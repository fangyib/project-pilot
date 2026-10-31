import { randomUUID } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { decompose } from "../planner/decompose.js";
import { recommendForTask } from "../router/recommend.js";
import { resolvePreference } from "../domain/preferences.js";
import type { Database, ModelConnection, ModelPreference, Project, Task } from "../domain/types.js";
import type { PilotEvent } from "../domain/events.js";
import { profileById } from "../catalog/models.js";
import { listProjectFiles, readProjectFile, writeProjectFile } from "../executor/project-folder.js";
import { executeProject } from "../executor/runProject.js";
import { isActive, isPaused, isStopped, pauseRun, resumeRun, stopRun } from "../executor/run-control.js";
import { decryptSecret } from "../store/crypto.js";
import type { Store } from "../store/database.js";

export interface PilotOptions {
  store: Store;
  dataDir: string;
  masterKey: Buffer;
  onEvent?: (event: PilotEvent) => void;
}

export function createPilot(options: PilotOptions) {
  const events: PilotEvent[] = [];
  function publish(event: PilotEvent): void {
    events.push(event);
    options.onEvent?.(event);
  }
  return {
    events,
    update: options.store.update.bind(options.store),
    async createProject(input: { idea: string; stack?: string }): Promise<Project> {
      return options.store.update((db) => {
        const id = randomUUID();
        const blueprint = decompose(input.idea, id);
        const project: Project = {
          id,
          name: blueprint.name,
          idea: input.idea,
          stack: input.stack ?? "",
          status: "blueprint",
          confirmed: false,
          outputDir: null,
          createdAt: new Date().toISOString(),
          taskPreferences: {},
          milestones: blueprint.milestones,
          tasks: blueprint.tasks.map((task) => attachRecommendation(db, task, undefined)),
          contract: blueprint.contract,
          runs: [],
          changesets: [],
          verifications: [],
          decisions: [],
          artifacts: [],
          messages: [],
          steering: "",
          paused: false,
          events: [],
          modelStats: [],
          spentCents: 0,
          workspaceDir: path.join(options.dataDir, "workspaces", id),
        };
        db.projects.unshift(project);
        publish({ id: randomUUID(), projectId: id, at: project.createdAt, type: "blueprint.ready", message: "蓝图和模型推荐已生成，偏好可随时修改。" });
        return publicProject(project);
      });
    },
    async listProjects(): Promise<Project[]> {
      return options.store.update((db) => {
        for (const project of db.projects) refreshRecommendations(db, project);
        return db.projects.map(publicProject);
      });
    },
    async getProject(id: string): Promise<Project> {
      return options.store.update((db) => {
        const project = findProject(db, id);
        refreshRecommendations(db, project);
        return publicProject(project);
      });
    },
    async setAccountPreference(preference: ModelPreference): Promise<void> {
      await options.store.update((db) => {
        db.accountPreference = { ...preference, scope: "account", scopeId: "account", updatedAt: new Date().toISOString() };
      });
    },
    async setProjectPreference(projectId: string, preference: Partial<ModelPreference>): Promise<Project> {
      return options.store.update((db) => {
        const project = findProject(db, projectId);
        project.preference = { ...preference, scope: "project", scopeId: projectId, updatedAt: new Date().toISOString() };
        refreshRecommendations(db, project);
        return publicProject(project);
      });
    },
    async setTaskPreference(projectId: string, taskId: string, preference: Partial<ModelPreference>): Promise<Project> {
      return options.store.update((db) => {
        const project = findProject(db, projectId);
        const task = findTask(project, taskId);
        project.taskPreferences[taskId] = { ...project.taskPreferences[taskId], ...preference, scope: "task", scopeId: taskId, updatedAt: new Date().toISOString() };
        task.recommendation = recommendationFor(db, project, task);
        if (!task.selectedModelId && task.recommendation.primary) task.selectedModelId = task.recommendation.primary.modelId;
        return publicProject(project);
      });
    },
    async updateTask(projectId: string, taskId: string, patch: { title?: string; selectedModelId?: string }): Promise<Project> {
      return options.store.update((db) => {
        const project = findProject(db, projectId);
        const task = findTask(project, taskId);
        if (patch.title) task.title = patch.title;
        if (patch.selectedModelId) task.selectedModelId = patch.selectedModelId;
        return publicProject(project);
      });
    },
    async confirm(projectId: string, outputDir: string): Promise<Project> {
      const selected = await assertOutputDirectory(outputDir);
      return options.store.update((db) => {
        const project = findProject(db, projectId);
        project.outputDir = selected;
        project.workspaceDir = selected;
        project.confirmed = true;
        project.status = "ready";
        return publicProject(project);
      });
    },
    async execute(projectId: string, mode: "trial" | "connected", restart = false): Promise<Project> {
      if (isPaused(projectId)) throw new Error("进程已暂停，请点继续");
      if (isActive(projectId)) throw new Error("进程已在运行");
      const snapshot = await options.store.update((db) => {
        const project = findProject(db, projectId);
        if (!project.confirmed) throw new Error("请先选择写入文件夹并确认方案");
        project.paused = false;
        for (const task of project.tasks) if (task.status === "running") task.status = "pending";
        if (project.outputDir) project.workspaceDir = project.outputDir;
        if (restart) {
          for (const task of project.tasks) task.status = "pending";
          project.status = "ready";
        }
        if (mode === "connected") {
          for (const task of project.tasks) {
            const profile = profileById(task.selectedModelId ?? "");
            if (!profile || profile.protocol === "trial") task.selectedModelId = null;
          }
          refreshRecommendations(db, project);
        }
        return structuredClone(project);
      });
      await executeProject({
        project: snapshot,
        mode,
        resolveKey: async (modelId) => options.store.update((db) => {
          const connection = db.connections.find((item) => item.modelIds.includes(modelId) && item.status !== "failed");
          if (!connection) return null;
          return { baseUrl: connection.baseUrl, apiKey: decryptSecret(connection.encryptedKey, options.masterKey) };
        }),
        onEvent: (event) => {
          snapshot.events.push(event);
          void options.store.update((db) => {
            const index = db.projects.findIndex((item) => item.id === projectId);
            if (index >= 0) db.projects[index] = structuredClone(snapshot);
          });
          publish(event);
        },
      });
      return options.store.update((db) => {
        const index = db.projects.findIndex((item) => item.id === projectId);
        if (index < 0) return publicProject(snapshot);
        db.projects[index] = snapshot;
        return publicProject(snapshot);
      });
    },
    async deleteProject(projectId: string): Promise<void> {
      if (isActive(projectId)) stopRun(projectId);
      const removed = await options.store.update((db) => {
        const project = db.projects.find((item) => item.id === projectId);
        if (!project) throw new Error("项目不存在");
        db.projects = db.projects.filter((item) => item.id !== projectId);
        return project;
      });
      const internal = path.resolve(options.dataDir, "workspaces", removed.id);
      const chosen = removed.outputDir ? path.resolve(removed.outputDir) : "";
      if (internal !== chosen) await rm(internal, { recursive: true, force: true });
    },
    async control(projectId: string, action: "pause" | "resume" | "stop"): Promise<Project> {
      if (action === "pause" && !pauseRun(projectId)) throw new Error("现在不能这样控制进程");
      if (action === "resume" && isActive(projectId)) resumeRun(projectId);
      if (action === "stop" && !stopRun(projectId)) throw new Error("现在没有正在运行的进程");
      return options.store.update((db) => {
        const project = findProject(db, projectId);
        project.paused = action === "pause";
        return publicProject(project);
      });
    },
    async say(projectId: string, text: string): Promise<{ project: Project; followUp: "resume" | "execute" | null }> {
      const trimmed = text.trim();
      if (!trimmed) throw new Error("先写一点内容");
      const followUp = followUpFor(trimmed, projectId);
      if (followUp === "resume") resumeRun(projectId);
      const reply = await answerProject(options, projectId, trimmed);
      const project = await options.store.update((db) => {
        const current = findProject(db, projectId);
        const at = new Date().toISOString();
        current.messages.push({ id: randomUUID(), taskId: null, role: "user", text: trimmed, at });
        current.messages.push({ id: randomUUID(), taskId: null, role: "assistant", text: reply.text, at });
        if (reply.written.length) {
          current.events.push({ id: randomUUID(), projectId, at, type: "changeset.created", taskId: current.tasks.find((task) => task.capability === "integration")?.id ?? current.tasks[0]?.id ?? projectId, message: `对话改了 ${reply.written.join("、")}` });
        }
        if (!isQuestion(trimmed) || wantsAdjust(trimmed)) current.steering = [current.steering, trimmed].filter(Boolean).join("\n");
        if (followUp) current.paused = false;
        return publicProject(current);
      });
      return { project, followUp };
    },
    async retry(projectId: string, taskId: string): Promise<Project> {
      return options.store.update((db) => {
        const project = findProject(db, projectId);
        releaseForRetry(project, findTask(project, taskId));
        return publicProject(project);
      });
    },
    async resolveDecision(projectId: string, decisionId: string, choice: string): Promise<Project> {
      return options.store.update((db) => {
        const project = findProject(db, projectId);
        const decision = project.decisions.find((item) => item.id === decisionId);
        if (!decision) throw new Error("确认项不存在");
        decision.choice = choice;
        decision.resolvedAt = new Date().toISOString();
        if (choice === "重试") {
          const task = project.tasks.find((item) => item.id === decision.taskId);
          if (task) releaseForRetry(project, task);
        }
        return publicProject(project);
      });
    },
  };
}

function wantsContinue(text: string): boolean {
  return /继续执行|接着做|往下做|继续做|^继续$/.test(text.trim());
}

function wantsAdjust(text: string): boolean {
  return /改成|调整|不要|加上|换成|补充/.test(text);
}

function isQuestion(text: string): boolean {
  return /[?？]\s*$/.test(text);
}

function followUpFor(text: string, projectId: string): "resume" | "execute" | null {
  if (!wantsContinue(text)) return null;
  if (isPaused(projectId)) return "resume";
  if (!isActive(projectId)) return "execute";
  return null;
}

function localReply(text: string, project: Project): string {
  if (wantsContinue(text)) return `好，按你的补充继续做「${project.name}」。`;
  if (wantsAdjust(text)) return `已记下。接下来做「${project.idea}」时会带上这个要求。`;
  return `这是项目「${project.name}」：${project.idea}`;
}

async function projectContext(project: Project): Promise<string> {
  const tasks = project.tasks.map((task) => `${task.title}｜${task.status}｜${task.acceptance}`).join("\n");
  const files = await listProjectFiles(project.workspaceDir);
  const folder = project.outputDir ?? project.workspaceDir;
  return [
    `你正在项目「${project.name}」自己的对话里，并且已经连上这个项目的文件夹：${folder}`,
    project.outputDir ? "这个文件夹就是用户选定的项目目录。要看文件就调用 read_file 或 list_files，要改就调用 write_file。不要让用户把文件内容贴过来，也不要说自己没读到文件。" : "用户还没选定电脑上的文件夹。现在读写的是这个项目的临时目录。",
    `想法：${project.idea}`,
    `技术栈：${project.stack || "未指定"}`,
    `状态：${project.status}`,
    `补充要求：${project.steering || "无"}`,
    `任务：\n${tasks}`,
    files.length ? `文件夹里现有文件：\n${files.join("\n")}` : "文件夹里还没有文件。需要的话可以直接 write_file。",
  ].join("\n\n");
}

const folderTools = [
  { type: "function", function: { name: "list_files", description: "列出当前项目文件夹里的文件", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "read_file", description: "读取当前项目文件夹里某个文件的全文", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "write_file", description: "把内容写入当前项目文件夹。已有文件会被覆盖。", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
];

async function useFolderTool(root: string, name: string, args: { path?: string; content?: string }, written: string[]): Promise<string> {
  try {
    if (name === "list_files") {
      const files = await listProjectFiles(root);
      return files.length ? files.join("\n") : "文件夹是空的";
    }
    if (name === "read_file" && args.path) return await readProjectFile(root, args.path);
    if (name === "write_file" && args.path && typeof args.content === "string") {
      const relative = await writeProjectFile(root, args.path, args.content);
      written.push(relative);
      return `已写入 ${relative}`;
    }
    return "没有执行。需要 path，写入时还需要 content。";
  } catch (error) {
    return error instanceof Error ? error.message : "文件操作失败";
  }
}

async function answerProject(options: PilotOptions, projectId: string, text: string): Promise<{ text: string; written: string[] }> {
  const project = await options.store.update((db) => findProject(db, projectId));
  const connection = await options.store.update((db) => db.connections.find((item) => item.status !== "failed"));
  if (!connection) return { text: localReply(text, project), written: [] };
  const written: string[] = [];
  const messages: unknown[] = [
    { role: "system", content: `你是这个项目的助手。用简短中文回答。只有 write_file 成功之后，才能说文件已经改好。用户只是提问时，先读文件再回答，不必改文件。\n\n${await projectContext(project)}` },
    ...project.messages.slice(-8).map((item) => ({ role: item.role, content: item.text })),
    { role: "user", content: text },
  ];
  try {
    for (let step = 0; step < 8; step += 1) {
      const response = await fetch(`${connection.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${decryptSecret(connection.encryptedKey, options.masterKey)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: connection.modelIds[0], messages, tools: folderTools }),
      });
      if (!response.ok) return { text: localReply(text, project), written };
      const body = await response.json() as { choices?: { message?: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] };
      const message = body.choices?.[0]?.message;
      if (!message) return { text: localReply(text, project), written };
      messages.push(message);
      if (!message.tool_calls?.length) {
        const reply = message.content?.trim() || (written.length ? `已改好：${written.join("、")}` : localReply(text, project));
        return { text: reply, written };
      }
      for (const call of message.tool_calls) {
        const args = JSON.parse(call.function.arguments || "{}") as { path?: string; content?: string };
        const result = await useFolderTool(project.workspaceDir, call.function.name, args, written);
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }
    return { text: written.length ? `已改好：${written.join("、")}` : localReply(text, project), written };
  } catch {
    return { text: localReply(text, project), written };
  }
}

function attachRecommendation(db: Database, task: Omit<Task, "recommendation" | "selectedModelId">, project?: Project): Task {
  const recommendation = recommendationFor(db, project, task);
  return { ...task, recommendation, selectedModelId: defaultModel(task.capability, recommendation) };
}

function defaultModel(capability: Task["capability"], recommendation: Task["recommendation"]): string {
  return recommendation.primary?.modelId ?? (capability === "visual_asset" ? "trial-asset" : "trial-coder");
}

function recommendationFor(db: Database, project: Project | undefined, task: Pick<Task, "id" | "capability">): Task["recommendation"] {
  const preference = resolvePreference(db.accountPreference, project?.preference, project?.taskPreferences[task.id]);
  return recommendForTask(task, preference, db.connections, project?.modelStats ?? []);
}

function refreshRecommendations(db: Database, project: Project): void {
  for (const task of project.tasks) {
    const selected = task.selectedModelId;
    task.recommendation = recommendationFor(db, project, task);
    task.selectedModelId = selected ?? defaultModel(task.capability, task.recommendation);
  }
}

function findProject(db: Database, id: string): Project {
  const project = db.projects.find((item) => item.id === id);
  if (!project) throw new Error("项目不存在");
  return project;
}

function releaseForRetry(project: Project, task: Task): void {
  task.status = "pending";
  const missingScript = project.verifications.some((item) => item.taskId === task.id && !item.passed && item.evidence.includes("verify.mjs"));
  if (task.capability === "testing" && missingScript) {
    for (const parentId of task.dependsOn) {
      const parent = project.tasks.find((item) => item.id === parentId);
      if (parent?.capability === "integration") parent.status = "pending";
    }
  }
  const stat = project.modelStats.find((item) => item.modelId === task.selectedModelId);
  if (stat) stat.rework += 1;
  project.status = "ready";
}

function findTask(project: Project, id: string): Task {
  const task = project.tasks.find((item) => item.id === id);
  if (!task) throw new Error("任务不存在");
  return task;
}

async function assertOutputDirectory(input: string): Promise<string> {
  const raw = input.trim();
  if (!raw || !path.isAbsolute(raw)) throw new Error("请选择电脑上的文件夹");
  const resolved = path.resolve(raw);
  let info;
  try {
    info = await stat(resolved);
  } catch {
    throw new Error("这个文件夹不存在");
  }
  if (!info.isDirectory()) throw new Error("请选择文件夹，而不是文件");
  return resolved;
}

function publicProject(project: Project): Project {
  const copy = structuredClone(project);
  copy.runState = isStopped(project.id) ? null : isPaused(project.id) ? "paused" : isActive(project.id) ? "running" : project.paused ? "paused" : null;
  return copy;
}

export function publicConnection(connection: ModelConnection): Omit<ModelConnection, "encryptedKey"> {
  const { encryptedKey: _encryptedKey, ...safe } = connection;
  return safe;
}

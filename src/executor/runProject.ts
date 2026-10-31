import { spawn } from "node:child_process";
import { access, cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PilotEvent } from "../domain/events.js";
import type { ChangeSet, Project, Run, Task, Verification } from "../domain/types.js";
import { profileById } from "../catalog/models.js";
import { OpenAICompatibleProvider, TrialProvider, type ModelProvider } from "./provider.js";
import { checkpoint, beginRun, endRun, isRunStopped, isStopped, signalFor } from "./run-control.js";
import { readWorkspaceFile, writeWorkspaceFiles } from "./workspace.js";

export interface ExecuteContext {
  project: Project;
  mode: "trial" | "connected";
  resolveKey: (modelId: string) => Promise<{ baseUrl: string; apiKey: string } | null>;
  onEvent: (event: PilotEvent) => void;
}

export async function executeProject(context: ExecuteContext): Promise<Project> {
  const project = context.project;
  beginRun(project.id);
  project.status = "running";
  try {
    let guard = 0;
    while (guard < 20) {
      await checkpoint(project.id);
      guard += 1;
      const wave = readyTasks(project);
      if (!wave.length) break;
      await Promise.all(wave.map((task) => executeTask(project, task, context)));
      if (isStopped(project.id)) break;
      if (project.tasks.some((task) => task.status === "blocked")) break;
    }
    if (isStopped(project.id)) {
      for (const task of project.tasks) if (task.status === "running") task.status = "pending";
      project.status = "ready";
      return project;
    }
    const blocked = project.tasks.some((task) => task.status === "blocked" || task.status === "needs_user");
    const unfinished = project.tasks.some((task) => task.status !== "done");
    project.status = blocked ? "needs_user" : unfinished ? "ready" : "delivered";
    return project;
  } finally {
    endRun(project.id);
  }
}

export function readyTasks(project: Project): Task[] {
  const ready = project.tasks.filter((task) => task.status === "pending" && task.dependsOn.every((id) => project.tasks.find((item) => item.id === id)?.status === "done"));
  const parallel = ready.filter((task) => task.capability !== "integration" && task.capability !== "testing");
  return parallel.length ? parallel : ready.slice(0, 1);
}

async function executeTask(project: Project, task: Task, context: ExecuteContext): Promise<void> {
  const modelId = task.selectedModelId ?? task.recommendation.primary?.modelId;
  if (!modelId) {
    block(project, task, context, "没有可用模型。");
    return;
  }
  const profile = profileById(modelId);
  const run: Run = { id: randomUUID(), projectId: project.id, taskId: task.id, modelId, status: "preparing", logs: [], costCents: 0, startedAt: new Date().toISOString() };
  project.runs.push(run);
  task.status = "running";
  const root = path.join(project.workspaceDir, "tasks", task.id);
  await mkdir(root, { recursive: true });
  emit(context, project, { type: "run.started", taskId: task.id, runId: run.id, message: `${task.title} 开始使用 ${profile?.label ?? modelId}` });
  try {
    if (task.capability === "integration" || task.capability === "testing") await copyDependencyFiles(project, task, root);
    run.status = "running";
    const provider = await providerFor(modelId, context);
    const existingFiles = await loadExisting(root, task);
    const result = await provider.execute({
      capability: task.capability,
      title: task.title,
      acceptance: task.acceptance,
      idea: project.idea,
      existingFiles,
      modelId,
      fileScope: task.fileScope,
      note: project.steering,
      signal: signalFor(project.id),
      checkpoint: () => checkpoint(project.id),
    });
    const files = await writeWorkspaceFiles(root, result.files);
    run.logs.push(...result.logs);
    run.costCents = result.costCents;
    project.spentCents += result.costCents;
    for (const line of result.logs) emit(context, project, { type: "run.log", taskId: task.id, runId: run.id, message: line });
    const changeset: ChangeSet = { id: randomUUID(), projectId: project.id, taskId: task.id, runId: run.id, files, createdAt: new Date().toISOString() };
    project.changesets.push(changeset);
    emit(context, project, { type: "changeset.created", taskId: task.id, message: `写入 ${files.map((file) => file.path).join("、")}` });
    for (const file of files) project.artifacts.push({ id: randomUUID(), projectId: project.id, taskId: task.id, title: file.path, path: path.join(root, file.path), kind: task.artifactType });
    await commitWorkspace(root, task.title);
    run.status = "verifying";
    const verification = task.capability === "testing" ? await verify(project, task, run, root) : null;
    if (verification) {
      project.verifications.push(verification);
      emit(context, project, { type: "verification.completed", taskId: task.id, passed: verification.passed, message: verification.passed ? "验证通过" : verification.evidence });
      if (!verification.passed) throw new Error(verification.evidence);
    }
    run.status = "succeeded";
    run.finishedAt = new Date().toISOString();
    task.status = "done";
    recordStat(project, modelId, true);
    emit(context, project, { type: "run.finished", taskId: task.id, runId: run.id, status: "succeeded", message: `${task.title} 完成` });
  } catch (error) {
    if (isRunStopped(error) || isStopped(project.id)) {
      run.status = "cancelled";
      run.finishedAt = new Date().toISOString();
      run.logs.push("已终止");
      task.status = "pending";
      emit(context, project, { type: "run.finished", taskId: task.id, runId: run.id, status: "cancelled", message: `${task.title} 已终止` });
      return;
    }
    run.status = "failed";
    run.finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "执行失败";
    run.logs.push(message);
    recordStat(project, modelId, false);
    block(project, task, context, message, run.id);
  }
}

async function providerFor(modelId: string, context: ExecuteContext): Promise<ModelProvider> {
  const profile = profileById(modelId);
  if (!profile || profile.protocol === "trial" || context.mode === "trial") return new TrialProvider();
  const key = await context.resolveKey(modelId);
  if (!key) throw new Error("所选模型没有可用的 API 连接");
  return new OpenAICompatibleProvider({ ...key, model: modelId });
}

async function copyDependencyFiles(project: Project, task: Task, root: string): Promise<void> {
  for (const dependencyId of task.dependsOn) {
    const source = path.join(project.workspaceDir, "tasks", dependencyId);
    await copyTree(source, root);
  }
}

async function copyTree(source: string, destination: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(source, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  await mkdir(destination, { recursive: true });
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else await cp(from, to, { force: true });
  }
}

async function loadExisting(root: string, task: Task): Promise<Record<string, string>> {
  if (task.capability !== "integration") return {};
  const files: Record<string, string> = {};
  for (const relative of ["src/game.js", "levels/01.json", "src/app.js", "assets/player.svg"]) {
    const content = await readWorkspaceFile(root, relative);
    if (content !== null) files[relative] = content;
  }
  return files;
}

const verifyScripts = ["verify.mjs", "verify.js", "validate.mjs", "validate.js"];

export async function findVerifyScript(root: string): Promise<string | null> {
  for (const name of verifyScripts) {
    try {
      await access(path.join(root, name));
      return name;
    } catch {
      continue;
    }
  }
  return null;
}

async function verify(project: Project, task: Task, run: Run, root: string): Promise<Verification> {
  const script = await findVerifyScript(root);
  const command = script ? `node ${script}` : "node verify.mjs";
  const result = script ? await runCommand(command, root) : { code: 1, stdout: "", stderr: "没有找到验证脚本。需要 verify.mjs 或 validate.js。" };
  const evidence = `${result.stdout}${result.stderr}`.trim();
  await writeWorkspaceFiles(root, { "reports/verification.txt": `${result.code === 0 ? "通过" : "失败"}\n${evidence}\n` });
  return { id: randomUUID(), projectId: project.id, taskId: task.id, runId: run.id, command, passed: result.code === 0, evidence, createdAt: new Date().toISOString() };
}

function runCommand(command: string, cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function commitWorkspace(root: string, title: string): Promise<void> {
  const options = { cwd: root };
  await runQuiet("git init", options);
  await runQuiet("git add .", options);
  await runQuiet(`git -c user.name=ProjectPilot -c user.email=pilot@localhost commit -m "${title.replaceAll('"', "'")}"`, options);
}

function runQuiet(command: string, options: { cwd: string }): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(command, { ...options, shell: true, stdio: "ignore" });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

function recordStat(project: Project, modelId: string, success: boolean): void {
  const stat = project.modelStats.find((item) => item.modelId === modelId) ?? { modelId, success: 0, total: 0, rework: 0 };
  if (!project.modelStats.includes(stat)) project.modelStats.push(stat);
  stat.total += 1;
  if (success) stat.success += 1;
}

function block(project: Project, task: Task, context: ExecuteContext, message: string, runId?: string): void {
  task.status = "blocked";
  const detail = message.includes("verify.mjs") ? "没有找到验证脚本 verify.mjs 或 validate.js。" : message.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 180);
  const decision = { id: randomUUID(), projectId: project.id, taskId: task.id, prompt: `「${task.title}」没有通过。${detail ?? "请选择下一步。"}`, options: ["重试", "缩小范围", "更换模型", "交给我处理"], createdAt: new Date().toISOString() };
  project.decisions.push(decision);
  project.status = "needs_user";
  emit(context, project, { type: "decision.requested", decisionId: decision.id, message });
  if (runId) emit(context, project, { type: "run.finished", taskId: task.id, runId, status: "failed", message });
}

type EventInput = {
  [Kind in PilotEvent["type"]]: Omit<Extract<PilotEvent, { type: Kind }>, "id" | "projectId" | "at">
}[PilotEvent["type"]];

function emit(context: ExecuteContext, project: Project, event: EventInput): void {
  context.onEvent({ ...event, id: randomUUID(), projectId: project.id, at: new Date().toISOString() } as PilotEvent);
}

import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { defaultAccountPreference, resolvePreference } from "../src/domain/preferences.js";
import { decompose } from "../src/planner/decompose.js";
import { recommendForTask } from "../src/router/recommend.js";
import { createPilot } from "../src/service/pilot.js";
import { createMemoryStore } from "../src/store/database.js";
import { decryptSecret, encryptSecret } from "../src/store/crypto.js";
import { OpenAICompatibleProvider } from "../src/executor/provider.js";
import { findVerifyScript } from "../src/executor/runProject.js";
import { findAppRoot } from "../src/executor/app-root.js";
import { listProjectFiles, readProjectFile, writeProjectFile } from "../src/executor/project-folder.js";
import { beginRun, checkpoint, endRun, pauseRun, resumeRun, stopRun } from "../src/executor/run-control.js";

test("任务偏好覆盖项目和账户偏好", () => {
  const resolved = resolvePreference(
    { ...defaultAccountPreference(), preset: "cost", region: "any" },
    { scope: "project", scopeId: "project", preset: "quality", region: "domestic", updatedAt: "2026-10-29" },
    { scope: "task", scopeId: "task", preset: "speed", updatedAt: "2026-10-29" },
  );
  assert.equal(resolved.preset, "speed");
  assert.equal(resolved.region, "domestic");
});

test("按偏好从市面模型推荐，已保存的 API 单独列出", () => {
  const preference = resolvePreference({ ...defaultAccountPreference(), preset: "domestic", region: "domestic", allowForeignData: false });
  const recommendation = recommendForTask(
    { id: "task", capability: "game_logic" },
    preference,
    [{ modelIds: ["deepseek-chat", "gpt-4.1"], status: "ok" }],
  );
  assert.equal(recommendation.primary?.modelId, "deepseek-chat");
  assert.ok(recommendation.filtered.some((item) => item.modelId === "gpt-4.1"));
  assert.ok(recommendation.connected.some((item) => item.modelId === "deepseek-chat"));
  assert.ok(recommendation.connected.some((item) => item.modelId === "gpt-4.1"));
  assert.ok(!recommendation.alternatives.some((item) => item.modelId.startsWith("trial-")));
});

test("游戏项目把画面、逻辑和关卡拆成可并行任务", () => {
  const blueprint = decompose("做一个横版闯关游戏，包含画面和游戏逻辑", "project");
  const byCapability = Object.fromEntries(blueprint.tasks.map((task) => [task.capability, task]));
  for (const capability of ["visual_asset", "game_logic", "level_design"]) {
    assert.deepEqual(byCapability[capability].dependsOn, [byCapability.architecture.id]);
  }
  assert.equal(byCapability.integration.dependsOn.length, 3);
});

test("API Key 只保存密文", () => {
  const key = randomBytes(32);
  const encrypted = encryptSecret("sk-test-secret-1234", key);
  assert.equal(encrypted.includes("sk-test-secret-1234"), false);
  assert.equal(decryptSecret(encrypted, key), "sk-test-secret-1234");
});

test("OpenAI-compatible 适配层执行统一写入工具", async () => {
  const provider = new OpenAICompatibleProvider({
    baseUrl: "https://example.test/v1",
    apiKey: "secret",
    model: "demo",
    async fetchImpl() {
      return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [
        { id: "1", function: { name: "write_file", arguments: JSON.stringify({ path: "src/app.js", content: "export const ready = true;\n" }) } },
        { id: "2", function: { name: "complete", arguments: JSON.stringify({ summary: "完成" }) } },
      ] } }] }), { status: 200 });
    },
  });
  const result = await provider.execute({ capability: "frontend", title: "实现", acceptance: "导出 ready", existingFiles: {}, modelId: "demo" });
  assert.equal(result.files["src/app.js"].includes("ready"), true);
  assert.equal(result.logs.includes("完成"), true);
});

test("一个小型游戏项目能完成拆分、隔离执行、集成和验证", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "pilot-"));
  const store = createMemoryStore();
  await store.update((db) => {
    db.accountPreference = { ...db.accountPreference, preset: "cost", region: "domestic", allowForeignData: false };
  });
  const pilot = createPilot({ store, dataDir, masterKey: randomBytes(32) });
  const created = await pilot.createProject({ idea: "做一个横版闯关小游戏，包含角色移动、画面和第一关" });
  const outputDir = path.join(dataDir, "game");
  await mkdir(outputDir);
  await assert.rejects(() => pilot.confirm(created.id, ""), /请选择电脑上的文件夹/);
  const finished = await pilot.execute((await pilot.confirm(created.id, outputDir)).id, "trial");
  assert.equal(finished.outputDir, outputDir);
  assert.equal(finished.status, "delivered");
  assert.equal(finished.verifications[0]?.passed, true);
  assert.ok(finished.changesets.some((item) => item.files.some((file) => file.path === "assets/player.svg")));
  assert.ok(finished.changesets.some((item) => item.files.some((file) => file.path === "src/game.js")));
  assert.ok(finished.events.some((event) => event.type === "verification.completed"));
});

test("选择重试会把停住的验证放回待执行，并补跑缺少脚本的集成", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "pilot-retry-"));
  const pilot = createPilot({ store: createMemoryStore(), dataDir, masterKey: randomBytes(32) });
  const created = await pilot.createProject({ idea: "做一个能前后左右移动的小人" });
  const outputDir = path.join(dataDir, "out");
  await mkdir(outputDir);
  const confirmed = await pilot.confirm(created.id, outputDir);
  const testing = confirmed.tasks.find((task) => task.capability === "testing");
  const integration = confirmed.tasks.find((task) => task.capability === "integration");
  assert.ok(testing && integration);
  await pilot.update((db) => {
    const project = db.projects[0]!;
    for (const task of project.tasks) task.status = "done";
    project.tasks.find((task) => task.id === testing.id)!.status = "blocked";
    project.verifications.push({ id: "verify", projectId: project.id, taskId: testing.id, runId: "run", command: "node verify.mjs", passed: false, evidence: "Cannot find module verify.mjs", createdAt: "2026-10-29" });
    project.decisions.push({ id: "decision", projectId: project.id, taskId: testing.id, prompt: "失败", options: ["重试"], createdAt: "2026-10-29" });
  });
  const resolved = await pilot.resolveDecision(confirmed.id, "decision", "重试");
  assert.equal(resolved.tasks.find((task) => task.id === testing.id)?.status, "pending");
  assert.equal(resolved.tasks.find((task) => task.id === integration.id)?.status, "pending");
});

test("验证会运行已经生成的 validate.js", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pilot-verify-"));
  await writeFile(path.join(root, "validate.js"), "console.log('ok');\n");
  assert.equal(await findVerifyScript(root), "validate.js");
});

test("暂停会停住进程，继续后放行，终止会打断", async () => {
  beginRun("control");
  assert.equal(pauseRun("control"), true);
  let released = false;
  const waiting = checkpoint("control").then(() => { released = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(released, false);
  resumeRun("control");
  await waiting;
  stopRun("control");
  await assert.rejects(() => checkpoint("control"), /已终止/);
  endRun("control");
});

test("项目对话只能读写自己的文件夹", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pilot-folder-"));
  await writeProjectFile(root, "tasks/page/index.html", "<h1>原文</h1>");
  assert.match(await readProjectFile(root, "tasks/page/index.html"), /原文/);
  assert.ok((await listProjectFiles(root)).includes("tasks/page/index.html"));
  await writeProjectFile(root, "tasks/page/index.html", "<h1>改过</h1>");
  assert.match(await readProjectFile(root, "tasks/page/index.html"), /改过/);
  await assert.rejects(() => writeProjectFile(root, "../outside.html", "no"), /非法路径|不能访问/);
});

test("删除项目记录时保留用户选定的文件夹", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "pilot-delete-"));
  const outputDir = await mkdtemp(path.join(tmpdir(), "pilot-keep-"));
  const pilot = createPilot({ store: createMemoryStore(), dataDir, masterKey: randomBytes(32) });
  const created = await pilot.createProject({ idea: "做一个能移动的小人" });
  const internal = path.join(dataDir, "workspaces", created.id);
  await mkdir(internal, { recursive: true });
  await writeFile(path.join(internal, "temp.txt"), "temp");
  await pilot.confirm(created.id, outputDir);
  await writeFile(path.join(outputDir, "keep.html"), "stay");
  await pilot.deleteProject(created.id);
  const projects = await pilot.listProjects();
  assert.equal(projects.some((item) => item.id === created.id), false);
  assert.equal(await readFile(path.join(outputDir, "keep.html"), "utf8"), "stay");
  await assert.rejects(() => access(path.join(internal, "temp.txt")));
});

test("对话记下调整，并在说继续时准备执行", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "pilot-say-"));
  const pilot = createPilot({ store: createMemoryStore(), dataDir, masterKey: randomBytes(32) });
  const created = await pilot.createProject({ idea: "做一个能移动的小人" });
  const noted = await pilot.say(created.id, "把按钮改成蓝色");
  assert.equal(noted.followUp, null);
  assert.match(noted.project.steering ?? "", /蓝色/);
  assert.equal(noted.project.messages.length, 2);
  assert.match(noted.project.messages[1]?.text ?? "", /做一个能移动的小人/);
  const continued = await pilot.say(created.id, "继续");
  assert.equal(continued.followUp, "execute");
});

test("暂停后离开再回来，项目仍是暂停，不能另开一次实现", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "pilot-pause-"));
  const pilot = createPilot({ store: createMemoryStore(), dataDir, masterKey: randomBytes(32) });
  const created = await pilot.createProject({ idea: "做一个能移动的小人" });
  beginRun(created.id);
  try {
    const paused = await pilot.control(created.id, "pause");
    assert.equal(paused.runState, "paused");
    const again = await pilot.getProject(created.id);
    assert.equal(again.runState, "paused");
    await assert.rejects(() => pilot.execute(created.id, "trial"), /请点继续/);
  } finally {
    endRun(created.id);
  }
  const remembered = await pilot.getProject(created.id);
  assert.equal(remembered.runState, "paused");
  const resumed = await pilot.control(created.id, "resume");
  assert.equal(resumed.runState, null);
  assert.equal(resumed.paused, false);
});

test("运行程序打开集成好的用户程序，而不是后写入的验证副本", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pilot-app-"));
  const program = path.join(root, "tasks", "integration");
  const verification = path.join(root, "tasks", "testing");
  await mkdir(program, { recursive: true });
  await mkdir(verification, { recursive: true });
  await writeFile(path.join(program, "index.html"), "program");
  await writeFile(path.join(verification, "index.html"), "verification");
  const past = new Date("2020-01-01");
  await utimes(path.join(program, "index.html"), past, past);
  await utimes(path.join(verification, "index.html"), new Date(), new Date());
  assert.equal(await findAppRoot(root, "integration"), program);
});

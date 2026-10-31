import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createPilot } from "../src/service/pilot.js";
import { createMemoryStore } from "../src/store/database.js";

const dataDir = path.resolve("examples/run");
const store = createMemoryStore();
await store.update((db) => {
  db.accountPreference = { ...db.accountPreference, preset: "domestic", region: "domestic", allowForeignData: false, budgetCents: 3000 };
  db.connections.push({
    id: "deepseek",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    modelIds: ["deepseek-chat", "deepseek-reasoner"],
    keyLast4: "demo",
    status: "ok",
    createdAt: new Date().toISOString(),
    encryptedKey: "not-used-in-trial",
  });
});
const pilot = createPilot({ store, dataDir, masterKey: randomBytes(32) });
const created = await pilot.createProject({ idea: "做一个横版闯关小游戏，包含角色移动、画面和第一关" });
const coding = created.tasks.find((task) => task.capability === "game_logic");
if (coding?.recommendation.primary?.modelId !== "deepseek-chat") throw new Error("已连接时应推荐 DeepSeek Chat");
if (!coding.recommendation.filtered.some((item) => item.modelId === "gpt-4.1")) throw new Error("国内偏好应过滤国外模型");
const outputDir = path.join(dataDir, "workspaces", created.id);
await mkdir(outputDir, { recursive: true });
const finished = await pilot.execute((await pilot.confirm(created.id, outputDir)).id, "trial");
if (finished.status !== "delivered" || !finished.verifications.at(-1)?.passed) throw new Error("游戏项目验证失败");
const testing = finished.tasks.find((task) => task.capability === "testing");
const source = path.join(finished.workspaceDir, "tasks", testing!.id);
const destination = path.resolve("examples/side-scroller");
await mkdir(path.dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true, force: true });
await mkdir("docs", { recursive: true });
await writeFile("docs/VALIDATION.md", `# 小型项目验证

验证项目：横版闯关小游戏。

- 蓝图在确认前生成，不需要真实 API 调用。
- 已连接 DeepSeek 时，游戏逻辑推荐 DeepSeek Chat；GPT-4.1 因国内偏好被过滤。
- 画面、逻辑、关卡三个任务只依赖架构契约，执行时处于同一并行波次。
- 实际执行使用本地试用执行器，产物位于 examples/side-scroller。
- 自动验证命令 \`node verify.mjs\` 已通过。
- 项目最终状态：${finished.status}。
- 运行事件 ${finished.events.length} 条，变更集 ${finished.changesets.length} 个。

打开 examples/side-scroller/index.html 可查看集成后的游戏页面。
`, "utf8");
console.log("validation ok");

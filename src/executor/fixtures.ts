import type { Capability } from "../domain/types.js";

export interface ProviderResult {
  files: Record<string, string>;
  logs: string[];
  costCents: number;
}

export interface ProviderRequest {
  capability: Capability;
  title: string;
  acceptance: string;
  idea?: string;
  existingFiles: Record<string, string>;
  modelId: string;
  fileScope?: string[];
  note?: string;
  checkpoint?: () => Promise<void>;
  signal?: AbortSignal;
}

export interface ModelProvider {
  execute(request: ProviderRequest): Promise<ProviderResult>;
}

export async function trialFiles(request: ProviderRequest): Promise<Record<string, string>> {
  await request.checkpoint?.();
  const idea = request.acceptance;
  switch (request.capability) {
    case "planning":
      return { "docs/plan.md": `# 计划\n\n${request.title}\n\n${idea}\n` };
    case "architecture":
      return {
        "docs/architecture.md": [
          "# 契约",
          "",
          "- 角色素材：assets/player.svg",
          "- 游戏逻辑：src/game.js 导出 createGame(level)",
          "- 关卡：levels/01.json，包含 width 与 platforms",
          "- 入口：index.html",
          "",
        ].join("\n"),
      };
    case "visual_asset":
      return {
        "assets/player.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="none"/>
  <rect x="16" y="8" width="32" height="28" rx="6" fill="#e85d04"/>
  <circle cx="26" cy="20" r="3" fill="#111"/>
  <circle cx="38" cy="20" r="3" fill="#111"/>
  <rect x="22" y="38" width="8" height="18" fill="#1d3557"/>
  <rect x="34" y="38" width="8" height="18" fill="#1d3557"/>
</svg>`,
      };
    case "game_logic":
      return { "src/game.js": gameLogic() };
    case "level_design":
      return {
        "levels/01.json": `${JSON.stringify({ id: 1, name: "第一关", width: 800, platforms: [[0, 400, 800, 40], [180, 310, 140, 16], [430, 250, 160, 16]] }, null, 2)}\n`,
      };
    case "frontend":
    case "backend":
      return {
        "src/app.js": `export function describeProject() {\n  return ${JSON.stringify(request.title)};\n}\n`,
      };
    case "integration":
      return integrationFiles(request.existingFiles);
    case "testing":
      return { "reports/verification.txt": "等待验证命令写入结果。\n" };
    case "review":
      return { "docs/review.md": `# 审查\n\n${idea}\n` };
    default:
      return {};
  }
}

function gameLogic(): string {
  return `export function createGame(level) {
  const width = level?.width ?? 800;
  return {
    x: 40,
    y: 360,
    level,
    move(dx) {
      this.x = Math.max(0, Math.min(width - 32, this.x + dx));
    },
    jump() {
      this.y = Math.max(80, this.y - 48);
    },
  };
}
`;
}

function integrationFiles(existing: Record<string, string>): Record<string, string> {
  const level = existing["levels/01.json"];
  const hasGame = Boolean(existing["src/game.js"]);
  if (hasGame && level) {
    const embedded = JSON.stringify(JSON.parse(level));
    return {
      "index.html": gameHtml(embedded),
      "verify.mjs": gameVerify(),
    };
  }
  return {
    "index.html": `<!doctype html><meta charset="utf-8"><title>Project Pilot</title><body><h1>项目已集成</h1><script type="module">import { describeProject } from "./src/app.js"; document.body.insertAdjacentHTML("beforeend", "<p>" + describeProject() + "</p>");</script></body>`,
    "verify.mjs": `import { describeProject } from "./src/app.js";
if (!describeProject()) throw new Error("缺少项目描述");
console.log("ok");
`,
  };
}

function gameHtml(levelJson: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>横版闯关</title>
<style>
  body { margin: 0; font-family: sans-serif; background: #f6f7f9; color: #172033; }
  canvas { background: #8ecae6; display: block; margin: 24px auto; border: 1px solid #c9d2df; }
  p { text-align: center; }
</style>
<canvas id="screen" width="800" height="450"></canvas>
<p>方向键移动，上方向键跳跃</p>
<script type="module">
import { createGame } from "./src/game.js";
const level = ${levelJson};
const game = createGame(level);
const ctx = document.querySelector("#screen").getContext("2d");
const keys = new Set();
addEventListener("keydown", (event) => keys.add(event.key));
addEventListener("keyup", (event) => keys.delete(event.key));
function frame() {
  if (keys.has("ArrowRight")) game.move(4);
  if (keys.has("ArrowLeft")) game.move(-4);
  if (keys.has("ArrowUp")) game.jump();
  ctx.clearRect(0, 0, 800, 450);
  ctx.fillStyle = "#2d6a4f";
  for (const platform of game.level.platforms) ctx.fillRect(...platform);
  ctx.fillStyle = "#e85d04";
  ctx.fillRect(game.x, game.y, 32, 32);
  requestAnimationFrame(frame);
}
frame();
</script>
`;
}

function gameVerify(): string {
  return `import { createGame } from "./src/game.js";
import { readFileSync } from "node:fs";
const level = JSON.parse(readFileSync(new URL("./levels/01.json", import.meta.url), "utf8"));
const game = createGame(level);
const start = game.x;
game.move(12);
if (game.x !== start + 12) throw new Error("向右移动失败");
game.move(-1000);
if (game.x !== 0) throw new Error("左边界失效");
if (!Array.isArray(level.platforms) || level.platforms.length < 1) throw new Error("关卡缺少平台");
console.log("ok");
`;
}

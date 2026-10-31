import { randomUUID } from "node:crypto";
import type { Capability, Milestone, Task, TaskContract } from "../domain/types.js";

export interface Blueprint {
  name: string;
  milestones: Milestone[];
  tasks: Omit<Task, "recommendation" | "selectedModelId">[];
  contract: TaskContract;
}

export function decompose(idea: string, projectId: string): Blueprint {
  const game = /游戏|闯关|画面|精灵|关卡/.test(idea);
  const name = game ? "横版闯关游戏" : idea.trim().slice(0, 24) || "未命名项目";
  const milestones: Milestone[] = [
    { id: randomUUID(), title: "确认蓝图", doneWhen: "任务、契约和模型分配已经确认" },
    { id: randomUUID(), title: "完成并行实现", doneWhen: "各能力任务都有产物" },
    { id: randomUUID(), title: "集成并验证", doneWhen: "集成产物通过自动验证" },
  ];
  const specs = game ? gameTasks(idea) : softwareTasks(idea);
  const tasks = specs.map((spec) => ({
    id: randomUUID(),
    projectId,
    title: spec.title,
    capability: spec.capability,
    artifactType: spec.artifactType,
    status: "pending" as const,
    dependsOn: [] as string[],
    fileScope: spec.fileScope,
    acceptance: spec.acceptance,
  }));
  const byCapability = new Map<Capability, string>();
  for (const task of tasks) byCapability.set(task.capability, task.id);
  for (const task of tasks) {
    const spec = specs.find((item) => item.capability === task.capability)!;
    task.dependsOn = spec.dependsOn.map((capability) => byCapability.get(capability)!).filter(Boolean);
  }
  return {
    name,
    milestones,
    tasks,
    contract: {
      id: randomUUID(),
      version: 1,
      summary: game
        ? "画面、逻辑和关卡先遵守同一套路径与接口，再并行实现。"
        : "实现任务遵守约定路径，集成任务负责合并。",
      entries: specs
        .filter((spec) => spec.capability !== "testing")
        .map((spec) => ({ key: spec.capability, path: spec.fileScope[0] ?? "", spec: spec.acceptance })),
    },
  };
}

interface Spec {
  capability: Capability;
  title: string;
  artifactType: Task["artifactType"];
  fileScope: string[];
  acceptance: string;
  dependsOn: Capability[];
}

function gameTasks(idea: string): Spec[] {
  return [
    spec("planning", "整理玩法与范围", "doc", ["docs/plan.md"], `把“${idea}”整理成可执行范围。`, []),
    spec("architecture", "定义资源与代码契约", "doc", ["docs/architecture.md"], "约定素材尺寸、文件路径和 createGame 接口。", ["planning"]),
    spec("visual_asset", "生成角色与场景素材", "image", ["assets/player.svg"], "输出透明背景的角色 SVG，路径为 assets/player.svg。", ["architecture"]),
    spec("game_logic", "编写移动与跳跃逻辑", "code", ["src/game.js"], "导出 createGame(level)，提供 move 和 jump。", ["architecture"]),
    spec("level_design", "编写第一关数据", "data", ["levels/01.json"], "提供 width 和 platforms。", ["architecture"]),
    spec("integration", "集成画面、逻辑和关卡", "app", ["index.html", "verify.mjs"], "生成可打开的游戏页面和验证脚本。", ["visual_asset", "game_logic", "level_design"]),
    spec("testing", "运行玩法验证", "report", ["reports/verification.txt"], "验证移动、边界和关卡数据。", ["integration"]),
  ];
}

function softwareTasks(idea: string): Spec[] {
  const ui = /页面|界面|前端|网站/.test(idea);
  const implementation: Spec = ui
    ? spec("frontend", "实现界面", "code", ["src/app.js"], "提供可展示的界面脚本。", ["architecture"])
    : spec("backend", "实现核心逻辑", "code", ["src/app.js"], "导出能完成目标的函数。", ["architecture"]);
  return [
    spec("planning", "整理需求", "doc", ["docs/plan.md"], `把“${idea}”拆成可验证的范围。`, []),
    spec("architecture", "定义模块契约", "doc", ["docs/architecture.md"], "约定 src/app.js 的导出和页面入口。", ["planning"]),
    implementation,
    spec("integration", "集成可运行入口", "app", ["index.html", "verify.mjs"], `生成可以直接打开的页面。页面本身就是「${idea}」，不要做成与这个想法无关的通用工具。`, [implementation.capability]),
    spec("testing", "运行自动验证", "report", ["reports/verification.txt"], "验证导出函数的结果。", ["integration"]),
  ];
}

function spec(
  capability: Capability,
  title: string,
  artifactType: Task["artifactType"],
  fileScope: string[],
  acceptance: string,
  dependsOn: Capability[],
): Spec {
  return { capability, title, artifactType, fileScope, acceptance, dependsOn };
}

import type { ModelConnection, ModelProfile, ModelRecommendation, ModelStat, ResolvedPreference, ScoredModel, Task } from "../domain/types.js";
import { MODEL_CATALOG } from "../catalog/models.js";

export function recommendForTask(
  task: Pick<Task, "id" | "capability">,
  preference: ResolvedPreference,
  connections: Pick<ModelConnection, "modelIds" | "status">[],
  stats: ModelStat[] = [],
  catalog: ModelProfile[] = MODEL_CATALOG,
): ModelRecommendation {
  const connectedIds = new Set(connections.filter((item) => item.status !== "failed").flatMap((item) => item.modelIds));
  const filtered: ModelRecommendation["filtered"] = [];
  const market: ScoredModel[] = [];
  const connected: ScoredModel[] = [];
  for (const profile of catalog) {
    if (profile.protocol === "trial") continue;
    const capabilityReason = capabilityBlock(profile, task.capability);
    const preferenceReason = preferenceBlock(profile, preference);
    if (capabilityReason) {
      filtered.push({ modelId: profile.id, label: profile.label, reason: capabilityReason });
      continue;
    }
    if (preferenceReason) filtered.push({ modelId: profile.id, label: profile.label, reason: preferenceReason });
    const available = connectedIds.has(profile.id);
    const scored = scoreModel(profile, task.capability, preference, stats, available, true);
    if (preferenceReason) scored.reasons = [`与偏好不符：${preferenceReason}`, ...scored.reasons];
    if (!preferenceReason) market.push(scored);
    if (available) connected.push(scored);
  }
  market.sort(byScore);
  connected.sort(byScore);
  const primary = market[0] ?? null;
  return {
    taskId: task.id,
    primary,
    alternatives: market.slice(1, 4),
    connected,
    filtered,
    noCandidateReason: primary ? undefined : "没有同时满足偏好和这项工作的模型。",
  };
}

function capabilityBlock(profile: ModelProfile, capability: Task["capability"]): string | null {
  if (capability === "visual_asset" && !profile.image) return "不能生成图像素材";
  if (!profile.capabilities.includes(capability) && capability !== "visual_asset") return "不覆盖这项能力";
  return null;
}

function preferenceBlock(profile: ModelProfile, preference: ResolvedPreference): string | null {
  if ((preference.region === "domestic" || !preference.allowForeignData) && profile.region === "foreign") {
    return preference.region === "domestic" ? "不满足“仅国内服务”" : "不满足“数据不出境”";
  }
  if (profile.costCentsPerRun > preference.budgetCents) return "预计费用超出预算";
  return null;
}

function scoreModel(
  profile: ModelProfile,
  capability: Task["capability"],
  preference: ResolvedPreference,
  stats: ModelStat[],
  available: boolean,
  requiresConnection: boolean,
): ScoredModel {
  const history = stats.find((item) => item.modelId === profile.id);
  const historyScore = history && history.total > 0 ? history.success / history.total : profile.baselineSuccess;
  const match = profile.capabilities.includes(capability) ? 1 : 0.45;
  const weights = preference.weights;
  const preferenceScore = profile.quality * weights.quality + cheapness(profile) * weights.cost + profile.speed * weights.speed;
  const costScore = cheapness(profile);
  const score = match * 0.4 + preferenceScore * 0.2 + historyScore * 0.2 + costScore * 0.1 + profile.stability * 0.1;
  const reasons = [
    `能力匹配：${profile.capabilities.includes(capability) ? "直接覆盖" : "部分相关"}`,
    available ? "连接可用" : "需要先添加 API 连接",
    `预计约 ¥${(profile.costCentsPerRun / 100).toFixed(2)}`,
    `偏好“${presetLabel(preference.preset)}”`,
  ];
  return {
    modelId: profile.id,
    label: profile.label,
    score: Number(score.toFixed(4)),
    available,
    requiresConnection,
    estimatedCostCents: profile.costCentsPerRun,
    estimatedMinutes: Math.max(1, Math.round((1.4 - profile.speed) * 6)),
    reasons,
  };
}

function cheapness(profile: ModelProfile): number {
  return 1 - Math.min(profile.costCentsPerRun, 300) / 300;
}

function presetLabel(preset: ResolvedPreference["preset"]): string {
  const labels: Record<ResolvedPreference["preset"], string> = {
    balance: "平衡",
    quality: "质量优先",
    cost: "性价比优先",
    speed: "速度优先",
    domestic: "国内服务优先",
    privacy: "隐私优先",
    custom: "自定义",
  };
  return labels[preset];
}

function byScore(a: ScoredModel, b: ScoredModel): number {
  return b.score - a.score;
}

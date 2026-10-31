import type { ModelPreference, PreferencePreset, ResolvedPreference } from "./types.js";

const WEIGHTS: Record<PreferencePreset, ResolvedPreference["weights"]> = {
  balance: { quality: 0.34, cost: 0.33, speed: 0.33 },
  quality: { quality: 0.7, cost: 0.1, speed: 0.2 },
  cost: { quality: 0.2, cost: 0.6, speed: 0.2 },
  speed: { quality: 0.2, cost: 0.2, speed: 0.6 },
  domestic: { quality: 0.34, cost: 0.33, speed: 0.33 },
  privacy: { quality: 0.45, cost: 0.2, speed: 0.35 },
  custom: { quality: 0.34, cost: 0.33, speed: 0.33 },
};

export function defaultAccountPreference(now = new Date().toISOString()): ModelPreference {
  return {
    scope: "account",
    scopeId: "account",
    preset: "balance",
    region: "any",
    allowForeignData: true,
    autoSelect: true,
    budgetCents: 3000,
    updatedAt: now,
  };
}

export function resolvePreference(
  account: ModelPreference,
  project?: ModelPreference | null,
  task?: ModelPreference | null,
): ResolvedPreference {
  const merged = { ...account, ...clean(project), ...clean(task) };
  const preset = merged.preset ?? "balance";
  const domesticPreset = preset === "domestic";
  const privacyPreset = preset === "privacy";
  return {
    preset,
    region: domesticPreset ? "domestic" : merged.region ?? "any",
    allowForeignData: privacyPreset ? false : merged.allowForeignData ?? true,
    autoSelect: merged.autoSelect ?? true,
    budgetCents: merged.budgetCents ?? 3000,
    weights: WEIGHTS[preset],
  };
}

function clean(preference?: ModelPreference | null): Partial<ModelPreference> {
  if (!preference) return {};
  const copy: Partial<ModelPreference> = { ...preference };
  for (const key of Object.keys(copy) as (keyof ModelPreference)[]) {
    if (copy[key] === undefined) delete copy[key];
  }
  delete copy.scope;
  delete copy.scopeId;
  delete copy.updatedAt;
  return copy;
}

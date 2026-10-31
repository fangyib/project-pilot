export type Capability =
  | "planning"
  | "architecture"
  | "frontend"
  | "backend"
  | "game_logic"
  | "visual_asset"
  | "level_design"
  | "review"
  | "testing"
  | "integration";

export type TaskStatus = "pending" | "running" | "needs_user" | "done" | "blocked";
export type RunStatus = "queued" | "preparing" | "running" | "verifying" | "succeeded" | "failed" | "cancelled";
export type ProjectStatus = "blueprint" | "ready" | "running" | "needs_user" | "delivered";
export type PreferenceScope = "account" | "project" | "task";
export type PreferencePreset = "balance" | "quality" | "cost" | "speed" | "domestic" | "privacy" | "custom";
export type ArtifactType = "doc" | "code" | "image" | "data" | "app" | "report";

export interface ModelPreference {
  scope: PreferenceScope;
  scopeId: string;
  preset?: PreferencePreset;
  region?: "any" | "domestic";
  allowForeignData?: boolean;
  autoSelect?: boolean;
  budgetCents?: number;
  updatedAt: string;
}

export interface ResolvedPreference {
  preset: PreferencePreset;
  region: "any" | "domestic";
  allowForeignData: boolean;
  autoSelect: boolean;
  budgetCents: number;
  weights: { quality: number; cost: number; speed: number };
}

export interface ModelProfile {
  id: string;
  label: string;
  provider: string;
  protocol: "openai-compatible" | "trial" | "image" | "anthropic";
  region: "domestic" | "foreign";
  capabilities: Capability[];
  tools: boolean;
  vision: boolean;
  image: boolean;
  quality: number;
  speed: number;
  stability: number;
  costCentsPerRun: number;
  baselineSuccess: number;
  updatedAt: string;
  source: string;
}

export interface ModelConnectionPublic {
  id: string;
  provider: string;
  baseUrl: string;
  modelIds: string[];
  keyLast4: string;
  status: "untested" | "ok" | "failed";
  createdAt: string;
}

export interface ModelConnection extends ModelConnectionPublic {
  encryptedKey: string;
}

export interface ScoredModel {
  modelId: string;
  label: string;
  score: number;
  available: boolean;
  requiresConnection: boolean;
  estimatedCostCents: number;
  estimatedMinutes: number;
  reasons: string[];
}

export interface ModelRecommendation {
  taskId: string;
  primary: ScoredModel | null;
  alternatives: ScoredModel[];
  connected: ScoredModel[];
  filtered: { modelId: string; label: string; reason: string }[];
  noCandidateReason?: string;
}

export interface TaskContractEntry {
  key: string;
  path: string;
  spec: string;
}

export interface TaskContract {
  id: string;
  version: number;
  summary: string;
  entries: TaskContractEntry[];
}

export interface Milestone {
  id: string;
  title: string;
  doneWhen: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  capability: Capability;
  artifactType: ArtifactType;
  status: TaskStatus;
  dependsOn: string[];
  fileScope: string[];
  acceptance: string;
  selectedModelId: string | null;
  recommendation: ModelRecommendation;
}

export interface Run {
  id: string;
  projectId: string;
  taskId: string;
  modelId: string;
  status: RunStatus;
  logs: string[];
  costCents: number;
  startedAt: string;
  finishedAt?: string;
}

export interface ChangeSet {
  id: string;
  projectId: string;
  taskId: string;
  runId: string;
  files: { path: string; additions: number }[];
  createdAt: string;
}

export interface Verification {
  id: string;
  projectId: string;
  taskId: string;
  runId: string;
  command: string;
  passed: boolean;
  evidence: string;
  createdAt: string;
}

export interface Decision {
  id: string;
  projectId: string;
  taskId?: string;
  prompt: string;
  options: string[];
  choice?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface Artifact {
  id: string;
  projectId: string;
  taskId: string;
  title: string;
  path: string;
  kind: ArtifactType;
}

export interface ModelStat {
  modelId: string;
  success: number;
  total: number;
  rework: number;
}

export interface ChatMessage {
  id: string;
  taskId: string | null;
  role: "user" | "assistant";
  text: string;
  at: string;
}

export interface Project {
  id: string;
  name: string;
  idea: string;
  stack: string;
  status: ProjectStatus;
  confirmed: boolean;
  outputDir: string | null;
  createdAt: string;
  preference?: ModelPreference;
  taskPreferences: Record<string, ModelPreference>;
  milestones: Milestone[];
  tasks: Task[];
  contract: TaskContract;
  runs: Run[];
  changesets: ChangeSet[];
  verifications: Verification[];
  decisions: Decision[];
  artifacts: Artifact[];
  messages: ChatMessage[];
  steering?: string;
  paused?: boolean;
  events: import("./events.js").PilotEvent[];
  modelStats: ModelStat[];
  spentCents: number;
  workspaceDir: string;
  runState?: "paused" | "running" | null;
}

export interface Database {
  accountPreference: ModelPreference;
  connections: ModelConnection[];
  projects: Project[];
}

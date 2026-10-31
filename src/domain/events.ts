import type { RunStatus } from "./types.js";

export type PilotEvent =
  | { id: string; projectId: string; at: string; type: "project.created"; message: string }
  | { id: string; projectId: string; at: string; type: "blueprint.ready"; message: string }
  | { id: string; projectId: string; at: string; type: "task.updated"; taskId: string; message: string }
  | { id: string; projectId: string; at: string; type: "run.started"; taskId: string; runId: string; message: string }
  | { id: string; projectId: string; at: string; type: "run.log"; taskId: string; runId: string; message: string }
  | { id: string; projectId: string; at: string; type: "run.finished"; taskId: string; runId: string; status: RunStatus; message: string }
  | { id: string; projectId: string; at: string; type: "changeset.created"; taskId: string; message: string }
  | { id: string; projectId: string; at: string; type: "verification.completed"; taskId: string; passed: boolean; message: string }
  | { id: string; projectId: string; at: string; type: "decision.requested"; decisionId: string; message: string };

export interface EventLog {
  events: PilotEvent[];
}

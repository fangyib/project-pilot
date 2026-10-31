const runs = new Map<string, { paused: boolean; stopped: boolean; abort: AbortController; waiters: Array<() => void> }>();

export class RunStopped extends Error {
  constructor() {
    super("已终止");
    this.name = "RunStopped";
  }
}

export function beginRun(projectId: string): AbortSignal {
  runs.get(projectId)?.abort.abort();
  const control = { paused: false, stopped: false, abort: new AbortController(), waiters: [] };
  runs.set(projectId, control);
  return control.abort.signal;
}

export function endRun(projectId: string): void {
  const control = runs.get(projectId);
  runs.delete(projectId);
  control?.waiters.splice(0).forEach((wake) => wake());
}

export function pauseRun(projectId: string): boolean {
  const control = runs.get(projectId);
  if (!control || control.stopped) return false;
  control.paused = true;
  return true;
}

export function resumeRun(projectId: string): boolean {
  const control = runs.get(projectId);
  if (!control) return false;
  control.paused = false;
  control.waiters.splice(0).forEach((wake) => wake());
  return true;
}

export function stopRun(projectId: string): boolean {
  const control = runs.get(projectId);
  if (!control) return false;
  control.stopped = true;
  control.paused = false;
  control.abort.abort();
  control.waiters.splice(0).forEach((wake) => wake());
  return true;
}

export function isPaused(projectId: string): boolean {
  return runs.get(projectId)?.paused === true;
}

export function isActive(projectId: string): boolean {
  return runs.has(projectId);
}

export function isStopped(projectId: string): boolean {
  return runs.get(projectId)?.stopped === true;
}

export function signalFor(projectId: string): AbortSignal | undefined {
  return runs.get(projectId)?.abort.signal;
}

export async function waitIfPaused(projectId: string): Promise<void> {
  const control = runs.get(projectId);
  if (!control) return;
  while (control.paused && !control.stopped) {
    await new Promise<void>((resolve) => control.waiters.push(resolve));
  }
}

export async function checkpoint(projectId: string): Promise<void> {
  await waitIfPaused(projectId);
  if (isStopped(projectId)) throw new RunStopped();
}

export function isRunStopped(error: unknown): boolean {
  return error instanceof RunStopped || (error instanceof Error && error.name === "AbortError");
}

/**
 * Cancellation for runs executing in this process.
 *
 * A pass runs detached and holds the workspace's one run slot, so a stalled
 * model call would otherwise block every other run until the stale-run sweep
 * catches it half an hour later. This lets a person stop it now.
 *
 * In-process by design, matching where the work runs. A run started by another
 * instance is not cancellable from here — `cancel` says so by returning false
 * rather than pretending it worked.
 */
const controllers = new Map<string, AbortController>();

export function registerRun(runId: string): AbortSignal {
  cancelRun(runId);

  const controller = new AbortController();
  controllers.set(runId, controller);
  return controller.signal;
}

export function releaseRun(runId: string): void {
  controllers.delete(runId);
}

/** True when a run was executing here and has now been told to stop. */
export function cancelRun(runId: string): boolean {
  const controller = controllers.get(runId);
  if (!controller) {
    return false;
  }

  controller.abort();
  controllers.delete(runId);
  return true;
}

export function isRunCancellable(runId: string): boolean {
  return controllers.has(runId);
}

/** Only for tests — the registry is process-wide state. */
export function resetRunCancellations(): void {
  for (const controller of controllers.values()) {
    controller.abort();
  }
  controllers.clear();
}

/**
 * ResourceStack — LIFO, idempotent teardown that runs in a `finally` so cleanup
 * happens on success, error, and timeout (grader spec Requirement 9).
 */
export class ResourceStack {
  private readonly deferred: Array<() => Promise<void> | void> = [];
  private disposed = false;

  /** Register a teardown to run (LIFO) on dispose. */
  defer(fn: () => Promise<void> | void): void {
    this.deferred.push(fn);
  }

  /** Run every teardown in reverse order; idempotent; never throws. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = this.deferred.length - 1; i >= 0; i--) {
      try {
        await this.deferred[i]!();
      } catch {
        // Already-removed resources must not fail cleanup (Req 9.5).
      }
    }
  }
}

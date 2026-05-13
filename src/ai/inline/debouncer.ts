/**
 * Intelligent request debouncer for inline completions.
 *
 * - Debounces rapid keystrokes (configurable delay)
 * - Cancels in-flight requests when new input arrives
 * - Tracks whether a request is pending
 */

export interface DebouncerOptions {
  /** Delay in ms before firing (default 300) */
  delay: number;
}

export class CompletionDebouncer {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private pendingCallback: (() => void) | null = null;
  private _isPending = false;
  private _requestId = 0;
  readonly delay: number;

  constructor(opts?: Partial<DebouncerOptions>) {
    this.delay = opts?.delay ?? 300;
  }

  /** Whether a debounced request is waiting to fire or is in-flight. */
  get isPending(): boolean {
    return this._isPending;
  }

  /** Monotonically increasing request ID for cancellation tracking. */
  get requestId(): number {
    return this._requestId;
  }

  /**
   * Schedule a callback after the debounce delay.
   * Cancels any previously scheduled callback.
   * Returns the request ID for this schedule.
   */
  schedule(callback: () => void): number {
    this.cancel();
    this._requestId += 1;
    const id = this._requestId;
    this._isPending = true;
    this.pendingCallback = callback;

    this.timerId = setTimeout(() => {
      this.timerId = null;
      this.pendingCallback = null;
      // Callback may set _isPending = false when the request completes
      callback();
    }, this.delay);

    return id;
  }

  /** Cancel any pending debounced callback. */
  cancel(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.pendingCallback = null;
    this._isPending = false;
  }

  /**
   * Check if a given request ID is still the latest.
   * Useful for cancelling stale in-flight requests.
   */
  isStale(id: number): boolean {
    return id !== this._requestId;
  }

  /** Mark the current request as complete. */
  complete(): void {
    this._isPending = false;
  }
}

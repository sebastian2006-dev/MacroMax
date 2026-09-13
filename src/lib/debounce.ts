/**
 * Tiny, dependency-free debounce primitive.
 *
 * Kept outside React (and free of timers created at import time) so it can be
 * unit-tested in Node with mock timers, and reused by hooks or plain code.
 *
 * A debouncer collapses a burst of `call()`s into a single invocation of the
 * wrapped function using the MOST RECENT arguments, fired `delayMs` after the
 * last call. `cancel()` drops a pending call, `flush()` runs it immediately.
 */

/** Debounce window for the search input (spec: 300–500 ms). */
export const DEFAULT_DEBOUNCE_MS = 350;

export interface Debouncer<TArgs extends unknown[]> {
  /** (Re)schedule the wrapped function with these arguments. */
  call: (...args: TArgs) => void;
  /** Drop any pending invocation. */
  cancel: () => void;
  /** Run a pending invocation right now (no-op when nothing is queued). */
  flush: () => void;
  /** Whether an invocation is currently queued. */
  readonly pending: boolean;
}

export function createDebouncer<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number
): Debouncer<TArgs> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queued: TArgs | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const invoke = () => {
    const args = queued;
    queued = null;
    if (args) {
      fn(...args);
    }
  };

  return {
    call(...args: TArgs) {
      queued = args;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        invoke();
      }, delayMs);
    },
    cancel() {
      clearTimer();
      queued = null;
    },
    flush() {
      clearTimer();
      invoke();
    },
    get pending() {
      return timer !== null;
    },
  };
}

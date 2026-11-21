/** A task that runs again and again in the background until it is stopped. */
export interface Running {
  /**
   * Starts no other run and tells the run in progress, if any, through its signal; resolves once
   * that run has ended.
   */
  stop(): Promise<void>;
}

/**
 * Runs `task` at once and then again `waitMs` after each run has ended, so two runs never
 * overlap. A run that rejects is handed to `onError`, and the next one still comes. Each run is
 * given a signal aborted once the runs are stopped, to end early.
 */
export function runEvery(
  waitMs: number,
  task: (stopping: AbortSignal) => Promise<void>,
  onError: (error: unknown) => void,
): Running {
  const stopping = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: Promise<void>;

  const runOnce = async () => {
    try {
      await task(stopping.signal);
    } catch (error) {
      onError(error);
    }
    if (!stopping.signal.aborted) timer = setTimeout(start, waitMs);
  };
  const start = () => {
    current = runOnce();
  };

  start();
  return {
    stop: async () => {
      stopping.abort();
      clearTimeout(timer);
      await current;
    },
  };
}

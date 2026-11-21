/** A task that runs again and again in the background until it is stopped. */
export interface Running {
  /** Starts no other run; resolves once the run in progress, if any, has ended. */
  stop(): Promise<void>;
}

/**
 * Runs `task` at once and then again `waitMs` after each run has ended, so two runs never
 * overlap. A run that rejects is handed to `onError`, and the next one still comes.
 */
export function runEvery(
  waitMs: number,
  task: () => Promise<void>,
  onError: (error: unknown) => void,
): Running {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: Promise<void>;

  const runOnce = async () => {
    try {
      await task();
    } catch (error) {
      onError(error);
    }
    if (!stopped) timer = setTimeout(start, waitMs);
  };
  const start = () => {
    current = runOnce();
  };

  start();
  return {
    stop: async () => {
      stopped = true;
      clearTimeout(timer);
      await current;
    },
  };
}

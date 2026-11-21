import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runEvery } from './run-every.js';

/** A task whose runs end only when the test ends them, one at a time. */
function heldTask() {
  const ends: (() => void)[] = [];
  let started = 0;
  return {
    run: () => {
      started += 1;
      return new Promise<void>((resolve) => ends.push(resolve));
    },
    get started() {
      return started;
    },
    endRun: () => ends.shift()?.(),
  };
}

describe('runEvery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the task at once, then again each time the wait after the last run is over', async () => {
    const task = heldTask();
    const running = runEvery(5_000, task.run, () => undefined);

    expect(task.started).toBe(1);
    await vi.advanceTimersByTimeAsync(4_000);
    task.endRun();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(task.started).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task.started).toBe(2);

    task.endRun();
    await running.stop();
  });

  it('never starts a run while the last one is still going', async () => {
    const task = heldTask();
    const running = runEvery(5_000, task.run, () => undefined);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(task.started).toBe(1);

    task.endRun();
    await running.stop();
  });

  it('hands a run that failed to the error handler and keeps running', async () => {
    const failures: unknown[] = [];
    const failure = new Error('Database down');
    let runs = 0;
    const running = runEvery(
      5_000,
      () => {
        runs += 1;
        return runs === 1 ? Promise.reject(failure) : Promise.resolve();
      },
      (error) => failures.push(error),
    );

    await vi.advanceTimersByTimeAsync(5_000);

    expect(failures).toEqual([failure]);
    expect(runs).toBe(2);
    await running.stop();
  });

  it('stopping waits for the run in progress, and starts no other', async () => {
    const task = heldTask();
    const running = runEvery(5_000, task.run, () => undefined);
    let stopped = false;

    const stopping = running.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);

    task.endRun();
    await stopping;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(stopped).toBe(true);
    expect(task.started).toBe(1);
  });

  it('stopping between runs starts no other', async () => {
    let runs = 0;
    const running = runEvery(
      5_000,
      () => {
        runs += 1;
        return Promise.resolve();
      },
      () => undefined,
    );
    await vi.advanceTimersByTimeAsync(1_000);

    await running.stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(runs).toBe(1);
  });
});

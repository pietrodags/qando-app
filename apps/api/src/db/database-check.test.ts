import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseCheck } from './database-check.js';

describe('createDatabaseCheck', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is up when the probe query succeeds', async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    const isUp = await createDatabaseCheck({ query })();

    expect(isUp).toBe(true);
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('is down when the probe query fails', async () => {
    const check = createDatabaseCheck({
      query: async () => {
        throw new Error('connection refused');
      },
    });

    expect(await check()).toBe(false);
  });

  it('is down when the probe query takes longer than the timeout', async () => {
    vi.useFakeTimers();
    const check = createDatabaseCheck({ query: () => new Promise(() => {}) }, 2000);

    const result = check();
    await vi.advanceTimersByTimeAsync(2000);

    expect(await result).toBe(false);
  });

  it('is up when the probe query answers just before the timeout', async () => {
    vi.useFakeTimers();
    const check = createDatabaseCheck(
      { query: () => new Promise((resolve) => setTimeout(resolve, 1999)) },
      2000,
    );

    const result = check();
    await vi.advanceTimersByTimeAsync(1999);

    expect(await result).toBe(true);
  });
});

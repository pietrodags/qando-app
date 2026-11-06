import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';

export interface TestClock {
  /** Runs the rest of the request on the time its `X-Test-Now` header names, if any. */
  readonly readRequestClock: RequestHandler;
  /** The current request's time, or the real time when it named none. */
  readonly now: () => Date;
}

/**
 * The clock of the acceptance tests (owner, 2026-11-06): each request may name the time the API
 * reads with `X-Test-Now: <UTC instant>`, so a scenario moves to "today is 2 July" without
 * touching the system clock, and scenarios running at once in parallel workers each keep their
 * own day. The time follows the request through every await of its handling. It is mounted only
 * when the API starts under `QANDO_TEST_CLOCK=on` (main.ts); a deployed API never reads the header.
 */
export function testClock(realNow: () => Date): TestClock {
  const requestTime = new AsyncLocalStorage<Date>();
  return {
    readRequestClock: (request, response, next) => {
      const header = request.get('X-Test-Now');
      if (header === undefined) {
        next();
        return;
      }
      // Only a UTC instant exactly as `Date.toISOString()` writes it: nothing left to interpret.
      const time = new Date(header);
      if (Number.isNaN(time.getTime()) || time.toISOString() !== header) {
        response.status(400).type('text/plain').send(`X-Test-Now is not a UTC instant: ${header}`);
        return;
      }
      requestTime.run(time, next);
    },
    now: () => requestTime.getStore() ?? realNow(),
  };
}

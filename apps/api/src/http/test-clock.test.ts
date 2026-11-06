import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { testClock } from './test-clock.js';

const real = new Date('2026-11-06T09:00:00.000Z');

/** An app behind the test clock whose only route answers the time it read, after a wait. */
function setUp() {
  const clock = testClock(() => real);
  const app = express()
    .use(clock.readRequestClock)
    .get('/now', async (_request, response) => {
      // The time is read after an await: it must still be the request's own.
      await new Promise((resolve) => setTimeout(resolve, 5));
      response.json({ now: clock.now().toISOString() });
    });
  return { app, now: clock.now };
}

describe('test clock', () => {
  it('answers the time the request names in X-Test-Now', async () => {
    const { app } = setUp();

    const response = await request(app).get('/now').set('X-Test-Now', '2026-07-01T21:58:00.000Z');

    expect(response.body).toEqual({ now: '2026-07-01T21:58:00.000Z' });
  });

  it('answers the real time to a request without X-Test-Now', async () => {
    const { app } = setUp();

    const response = await request(app).get('/now');

    expect(response.body).toEqual({ now: real.toISOString() });
  });

  it('keeps each request on its own time when they run at once', async () => {
    const { app } = setUp();
    const times = ['2026-06-15T10:00:00.000Z', '2026-07-02T10:00:00.000Z'];

    const responses = await Promise.all(
      times.map((time) => request(app).get('/now').set('X-Test-Now', time)),
    );

    expect(responses.map((response) => response.body as unknown)).toEqual(
      times.map((now) => ({ now })),
    );
  });

  it('answers the real time outside any request', () => {
    const { now } = setUp();

    expect(now()).toEqual(real);
  });

  it.each([
    'tomorrow',
    '2026-07-01',
    '2026-07-01T21:58:00.000',
    '2026-07-01T21:58:00Z',
    'x2026-07-01T21:58:00.000Z',
    '2026-07-01T21:58:00.000Zx',
    '2026-13-01T10:00:00.000Z',
  ])(
    'refuses the request when X-Test-Now is not a UTC instant from toISOString (%s)',
    async (value) => {
      const { app } = setUp();

      const response = await request(app).get('/now').set('X-Test-Now', value);

      expect(response.status).toBe(400);
      expect(response.text).toContain('X-Test-Now');
    },
  );
});

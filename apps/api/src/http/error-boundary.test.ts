import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { testDependencies } from '../test/test-dependencies.js';

/** A failure whose message carries the link, as a database error carries the query's parameters. */
function failingApp() {
  const logged: unknown[] = [];
  const failure = new Error('Failed query: select … where public_id = $1\nparams: k3P9x');
  failure.cause = Object.assign(new Error('connection terminated'), { code: '57P01' });
  const app = createApp({
    ...testDependencies(),
    publicEvents: { find: () => Promise.reject(failure) },
    logError: (entry) => logged.push(entry),
  });
  return { app, logged };
}

describe('a request that fails unexpectedly', () => {
  it('answers 500 with the shared error body, never cached', async () => {
    const { app } = failingApp();

    const response = await request(app).get('/api/public/events/k3P9x');

    expect(response.status).toBe(500);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'The request failed', details: [] },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('logs what failed and where, without the link, the message or the URL', async () => {
    const { app, logged } = failingApp();

    await request(app).get('/api/public/events/k3P9x');

    expect(logged).toEqual([
      {
        level: 'error',
        message: 'Request failed',
        method: 'GET',
        route: '/api/public/events/:id',
        error: 'Error',
        cause: 'Error',
        code: '57P01',
        stack: expect.arrayContaining([expect.stringMatching(/^at /)]) as unknown,
      },
    ]);
    expect(JSON.stringify(logged)).not.toContain('k3P9x');
  });

  it('logs no cause or code when the failure has none', async () => {
    const logged: unknown[] = [];
    const app = createApp({
      ...testDependencies(),
      publicEvents: { find: () => Promise.reject(new TypeError('k3P9x is not a function')) },
      logError: (entry) => logged.push(entry),
    });

    await request(app).get('/api/public/events/k3P9x');

    expect(logged).toEqual([expect.objectContaining({ error: 'TypeError' })]);
    expect(logged[0]).not.toHaveProperty('cause');
    expect(logged[0]).not.toHaveProperty('code');
    expect(JSON.stringify(logged)).not.toContain('k3P9x');
  });

  it('logs a thrown value that is not an error by its type only', async () => {
    const logged: unknown[] = [];
    const app = createApp({
      ...testDependencies(),
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test
      publicEvents: { find: () => Promise.reject('k3P9x') },
      logError: (entry) => logged.push(entry),
    });

    const response = await request(app).get('/api/public/events/k3P9x');

    expect(response.status).toBe(500);
    expect(logged).toEqual([expect.objectContaining({ error: 'string', stack: [] })]);
    expect(JSON.stringify(logged)).not.toContain('k3P9x');
  });

  it('never takes a line of the message for a stack frame', async () => {
    const logged: unknown[] = [];
    // A link decoded from `%0Aat%20k3P9x`, quoted by the database error's message.
    const failure = new Error('Failed query: select …\nparams: \nat k3P9x');
    const app = createApp({
      ...testDependencies(),
      publicEvents: { find: () => Promise.reject(failure) },
      logError: (entry) => logged.push(entry),
    });

    await request(app).get('/api/public/events/%0Aat%20k3P9x');

    expect(JSON.stringify(logged)).not.toContain('k3P9x');
    expect(logged).toEqual([
      expect.objectContaining({
        stack: expect.arrayContaining([expect.stringMatching(/^at /)]) as unknown,
      }),
    ]);
  });

  it('logs no frames when the stack does not start with the message', async () => {
    const logged: unknown[] = [];
    const failure = new Error('Failed query');
    failure.stack = 'Rewritten by a library\nat k3P9x (link.js:1:1)';
    const app = createApp({
      ...testDependencies(),
      publicEvents: { find: () => Promise.reject(failure) },
      logError: (entry) => logged.push(entry),
    });

    await request(app).get('/api/public/events/k3P9x');

    expect(logged).toEqual([expect.objectContaining({ stack: [] })]);
  });
});

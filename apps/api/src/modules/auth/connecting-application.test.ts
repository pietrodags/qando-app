import type { ConnectingApplication } from '@qando/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import {
  testDependencies,
  testSessionCookie,
  testTrustedOrigin,
} from '../../test/test-dependencies.js';
import type { ConnectionRequests } from './connecting-application.js';

/** The error a refused request answered. */
const errorOf = (response: request.Response) =>
  (response.body as { error: { code: string; details: unknown[] } }).error;

/** The request to connect the tests send: any text, as the fake requests judge none. */
const asked = 'response_type=code&client_id=https%3A%2F%2Fclaude.ai%2Fclient.json&exp=1&sig=abc';

/** Requests to connect that all name `application`, or all expired without one; every call recorded. */
function fakeRequests(application?: ConnectingApplication) {
  const read: string[] = [];
  const requests: ConnectionRequests = {
    applicationOf: (connectionRequest) => {
      read.push(connectionRequest);
      return Promise.resolve(application);
    },
  };
  return { requests, read };
}

const appWith = (connectionRequests: ConnectionRequests) =>
  createApp({ ...testDependencies(), connectionRequests });

const signedInAs = (accountId: string) => `${testSessionCookie}=${accountId}`;

const ask = (
  app: ReturnType<typeof appWith>,
  body: object = { connectionRequest: asked },
  ip = '1.1.1.1',
) =>
  request(app)
    .post('/api/auth/connecting-application')
    .set('Origin', testTrustedOrigin)
    .set('Cookie', signedInAs('ana'))
    .set('X-Forwarded-For', ip)
    .send(body);

describe('POST /api/auth/connecting-application', () => {
  it('answers the application the request names', async () => {
    const { requests, read } = fakeRequests({ name: 'Claude', host: 'claude.ai' });

    const response = await ask(appWith(requests));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: 'Claude', host: 'claude.ai' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(read).toEqual([asked]);
  });

  it('answers 410 for a request that expired or was not signed', async () => {
    const { requests } = fakeRequests();

    const response = await ask(appWith(requests));

    expect(response.status).toBe(410);
    expect(response.body).toEqual({
      error: {
        code: 'CONNECTION_REQUEST_EXPIRED',
        message: 'The request to connect expired',
        details: [],
      },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('answers 401 without a session, before the request is read', async () => {
    const { requests, read } = fakeRequests({ name: 'Claude', host: 'claude.ai' });

    const response = await request(appWith(requests))
      .post('/api/auth/connecting-application')
      .set('Origin', testTrustedOrigin)
      .send({ connectionRequest: asked });

    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe('UNAUTHENTICATED');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(read).toEqual([]);
  });

  it('answers 403 to a session sent from another site’s page', async () => {
    const { requests, read } = fakeRequests({ name: 'Claude', host: 'claude.ai' });

    const response = await ask(appWith(requests)).set('Origin', 'https://another-site.example');

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe('FORBIDDEN');
    expect(read).toEqual([]);
  });

  it.each<[string, object]>([
    ['no request', {}],
    ['an empty request', { connectionRequest: '' }],
    ['a request that is not text', { connectionRequest: 7 }],
    ['a field of its own', { connectionRequest: asked, accept: true }],
  ])('answers 400 to %s', async (_case, body) => {
    const { requests, read } = fakeRequests({ name: 'Claude', host: 'claude.ai' });

    const response = await ask(appWith(requests), body);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_FAILED');
    expect(read).toEqual([]);
  });

  it('reads a request as long as an application’s can be, and nothing over 32 KB', async () => {
    const { requests, read } = fakeRequests({ name: 'Claude', host: 'claude.ai' });
    const app = appWith(requests);
    // An address is at most 16 KB, and signing a request adds some hundreds of bytes to it.
    const long = `state=${'s'.repeat(17_000)}&sig=s`;

    const taken = await ask(app, { connectionRequest: long });
    const refused = await ask(app, { connectionRequest: `state=${'s'.repeat(33_000)}&sig=s` });

    expect(taken.status).toBe(200);
    // A request that cannot be read is the client's error, whatever made it so.
    expect(refused.status).toBe(400);
    expect(read).toEqual([long]);
  });

  it('answers an address 60 times a minute, then 429 with the seconds to wait', async () => {
    const { requests } = fakeRequests({ name: 'Claude', host: 'claude.ai' });
    const app = appWith(requests);

    const answers: number[] = [];
    for (let sent = 0; sent < 61; sent += 1) answers.push((await ask(app)).status);
    const refused = await ask(app);
    const another = await ask(app, { connectionRequest: asked }, '2.2.2.2');

    expect(answers.slice(0, 60)).toEqual(Array.from({ length: 60 }, () => 200));
    expect(answers[60]).toBe(429);
    expect(errorOf(refused).code).toBe('RATE_LIMITED');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    expect(another.status).toBe(200);
  });
});

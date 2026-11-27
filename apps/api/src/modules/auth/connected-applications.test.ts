import type { ConnectedApplication } from '@qando/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import type { ErrorLogEntry } from '../../http/error-boundary.js';
import {
  endedSession,
  testDependencies,
  testSessionCookie,
  testTrustedOrigin,
} from '../../test/test-dependencies.js';
import type { ConnectedApplications } from './connected-applications.js';

const claude: ConnectedApplication = {
  id: 'c1',
  name: 'Claude',
  host: 'claude.ai',
  connectedAt: '2026-11-24T18:30:00.000Z',
};
const chatgpt: ConnectedApplication = {
  id: 'c2',
  name: 'ChatGPT',
  host: 'chatgpt.com',
  connectedAt: '2026-11-20T09:00:00.000Z',
};

/** The connections of each account, in memory, with the disconnections asked of them. */
function inMemory(byAccount: Record<string, ConnectedApplication[]>) {
  const asked: { accountId: string; id: string }[] = [];
  const applications: ConnectedApplications = {
    of: (accountId) => Promise.resolve(byAccount[accountId] ?? []),
    disconnect: (accountId, id) => {
      asked.push({ accountId, id });
      const connections = byAccount[accountId] ?? [];
      const found = connections.some((connection) => connection.id === id);
      byAccount[accountId] = connections.filter((connection) => connection.id !== id);
      return Promise.resolve(found);
    },
  };
  return { applications, asked };
}

const appWith = (applications: ConnectedApplications, logError?: (entry: ErrorLogEntry) => void) =>
  createApp({
    ...testDependencies(),
    connectedApplications: applications,
    ...(logError && { logError }),
  });

/** The cookie of a session signed in as the account (`testSessions`). */
const sessionOf = (accountId: string) => `${testSessionCookie}=${accountId}`;

describe('GET /api/me/connected-apps', () => {
  it('answers the applications of the signed-in account, as they are stored, never cached', async () => {
    const { applications } = inMemory({ ana: [claude, chatgpt], bea: [{ ...claude, id: 'b1' }] });

    const response = await request(appWith(applications))
      .get('/api/me/connected-apps')
      .set('Cookie', sessionOf('ana'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([claude, chatgpt]);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('answers none for an account without applications', async () => {
    const { applications } = inMemory({});

    const response = await request(appWith(applications))
      .get('/api/me/connected-apps')
      .set('Cookie', sessionOf('ana'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it.each([
    ['without a session', undefined],
    ['with a session that ended', sessionOf(endedSession)],
  ])('answers 401 %s', async (_name, cookie) => {
    const { applications } = inMemory({ ana: [claude] });
    const sent = request(appWith(applications)).get('/api/me/connected-apps');

    const response = await (cookie === undefined ? sent : sent.set('Cookie', cookie));

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('answers 500 and logs it when the connections cannot be read', async () => {
    const logged: ErrorLogEntry[] = [];
    const failing: ConnectedApplications = {
      of: () => Promise.reject(new Error('database down')),
      disconnect: () => Promise.reject(new Error('database down')),
    };

    const response = await request(appWith(failing, (entry) => logged.push(entry)))
      .get('/api/me/connected-apps')
      .set('Cookie', sessionOf('ana'));

    expect(response.status).toBe(500);
    expect(logged).toHaveLength(1);
  });
});

describe('DELETE /api/me/connected-apps/{id}', () => {
  const disconnect = (
    applications: ConnectedApplications,
    id: string,
    {
      cookie = sessionOf('ana'),
      origin = testTrustedOrigin,
    }: { cookie?: string; origin?: string } = {},
  ) =>
    request(appWith(applications))
      .delete(`/api/me/connected-apps/${encodeURIComponent(id)}`)
      .set('Cookie', cookie)
      .set('Origin', origin);

  it('disconnects the connection of the signed-in account it names, never cached', async () => {
    const { applications, asked } = inMemory({ ana: [claude, chatgpt] });

    const response = await disconnect(applications, 'c1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ disconnected: true });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(asked).toEqual([{ accountId: 'ana', id: 'c1' }]);
    expect(await applications.of('ana')).toEqual([chatgpt]);
  });

  it.each<[string, Record<string, ConnectedApplication[]>, string]>([
    ['one the account never had', { ana: [claude] }, 'nope'],
    ['one disconnected already', { ana: [] }, 'c1'],
    ['another account’s', { ana: [], bea: [claude] }, 'c1'],
  ])('answers 404 to %s, and disconnects nothing', async (_name, stored, id) => {
    const { applications } = inMemory(stored);

    const response = await disconnect(applications, id);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'The account has no such connection', details: [] },
    });
    expect(await applications.of('bea')).toEqual(stored.bea ?? []);
  });

  it.each([
    ['without a session', { cookie: '' }, 401],
    ['with a session that ended', { cookie: sessionOf(endedSession) }, 401],
    ['from a page of another site', { origin: 'https://elsewhere.example' }, 403],
  ])('refuses a request %s, before anything is disconnected', async (_name, sent, status) => {
    const { applications, asked } = inMemory({ ana: [claude] });

    const response = await disconnect(applications, 'c1', sent);

    expect(response.status).toBe(status);
    expect(asked).toEqual([]);
  });

  it('answers 400 to a connection longer than any, before anything is disconnected', async () => {
    const { applications, asked } = inMemory({ ana: [claude] });

    const response = await disconnect(applications, 'x'.repeat(65));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(asked).toEqual([]);
  });
});

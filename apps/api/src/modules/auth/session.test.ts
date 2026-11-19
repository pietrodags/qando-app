import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorBoundary } from '../../http/error-boundary.js';
import type { Sessions } from '../../http/session.js';
import { testSessionCookie, testSessions } from '../../test/test-dependencies.js';
import { sessionRouter } from './session.js';

const renewed = ['qando.session_token=later; Max-Age=7776000; Path=/; HttpOnly; SameSite=Lax'];

/** The fake sessions, with Ana's session renewed while it is read and the reads counted. */
function readSessions(fail = false): Sessions & { reads: number } {
  const sessions: Sessions & { reads: number } = {
    ...testSessions,
    reads: 0,
    read: async (headers) => {
      sessions.reads += 1;
      if (fail) throw new Error('database down');
      const read = await testSessions.read(headers);
      return headers.cookie === `${testSessionCookie}=ana`
        ? {
            account: { id: 'account-1', name: 'Ana', email: 'ana@example.com' },
            renewedCookies: renewed,
          }
        : read;
    },
  };
  return sessions;
}

function appWith(sessions: Sessions, logged: unknown[] = []) {
  return express()
    .use(sessionRouter(sessions))
    .use(errorBoundary((entry) => logged.push(entry)));
}

describe('GET /api/auth/session', () => {
  it('answers the name and the email of the account signed in, never its ID', async () => {
    const response = await request(appWith(readSessions()))
      .get('/api/auth/session')
      .set('Cookie', `${testSessionCookie}=ana`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: 'Ana', email: 'ana@example.com' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('sends back the cookie renewed while the session was read', async () => {
    const response = await request(appWith(readSessions()))
      .get('/api/auth/session')
      .set('Cookie', `${testSessionCookie}=ana`);

    expect(response.headers['set-cookie']).toEqual(renewed);
  });

  it('answers null to a browser without a session, reading nothing', async () => {
    const sessions = readSessions();

    const response = await request(appWith(sessions)).get('/api/auth/session');

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(sessions.reads).toBe(0);
  });

  it('answers null to a session that expired or was signed out', async () => {
    const response = await request(appWith(readSessions()))
      .get('/api/auth/session')
      .set('Cookie', `${testSessionCookie}=ended`);

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  it('answers 500, never stored, when the session cannot be read', async () => {
    const logged: unknown[] = [];

    const response = await request(appWith(readSessions(true), logged))
      .get('/api/auth/session')
      .set('Cookie', `${testSessionCookie}=ana`);

    expect(response.status).toBe(500);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(logged).toHaveLength(1);
  });
});

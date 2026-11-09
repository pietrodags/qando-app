import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorBoundary } from '../../http/error-boundary.js';
import type { Sessions } from '../../http/session.js';
import {
  testSessionCookie,
  testSessions,
  testTrustedOrigin,
} from '../../test/test-dependencies.js';
import { signOutRouter } from './sign-out.js';

const cleared = ['qando.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax'];

/** The fake sessions, recording the cookies of each session ended; `fail` makes ending reject. */
function endingSessions(fail = false): Sessions & { ended: (string | undefined)[] } {
  const ended: (string | undefined)[] = [];
  return {
    ...testSessions,
    ended,
    end: (headers) => {
      if (fail) return Promise.reject(new Error('database down'));
      ended.push(headers.cookie);
      return Promise.resolve(cleared);
    },
  };
}

function appWith(sessions: Sessions) {
  return express()
    .use(signOutRouter(sessions))
    .use(
      errorBoundary(() => {
        // The failure's log is the error boundary's, tested with it.
      }),
    );
}

const session = `${testSessionCookie}=ana`;

describe('POST /api/auth/sign-out', () => {
  it('ends the session and clears its cookies, from a page of qando', async () => {
    const sessions = endingSessions();

    const response = await request(appWith(sessions))
      .post('/api/auth/sign-out')
      .set('Cookie', session)
      .set('Origin', testTrustedOrigin);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ signedOut: true });
    expect(response.headers['set-cookie']).toEqual(cleared);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(sessions.ended).toEqual([session]);
  });

  it('clears the cookies of a browser without a session', async () => {
    const sessions = endingSessions();

    const response = await request(appWith(sessions)).post('/api/auth/sign-out');

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toEqual(cleared);
    expect(sessions.ended).toEqual([undefined]);
  });

  it.each([
    ['from a page of another site', 'https://evil.test'],
    ['without an origin', undefined],
  ])('refuses the session sent %s, ending nothing', async (_name, origin) => {
    const sessions = endingSessions();
    const sent = request(appWith(sessions)).post('/api/auth/sign-out').set('Cookie', session);

    const response = await (origin === undefined ? sent : sent.set('Origin', origin));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(sessions.ended).toEqual([]);
  });

  it('answers 500 and clears no cookie when the session could not be deleted', async () => {
    const response = await request(appWith(endingSessions(true)))
      .post('/api/auth/sign-out')
      .set('Cookie', session)
      .set('Origin', testTrustedOrigin);

    expect(response.status).toBe(500);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('serves only POST', async () => {
    const response = await request(appWith(endingSessions())).get('/api/auth/sign-out');

    expect(response.status).toBe(404);
  });
});

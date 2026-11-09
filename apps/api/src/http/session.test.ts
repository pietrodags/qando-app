import express, { type Request } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorBoundary } from './error-boundary.js';
import { sessionReader, signedInAccount, type SessionRead, type Sessions } from './session.js';

const trusted = 'https://qando.test';

/** Sessions whose cookie `session=<account>` signs that account in; `ended` is signed out. */
function fakeSessions(renewed: readonly string[] = []): Sessions & { reads: number } {
  const accountIn = (cookie: string | undefined) =>
    /(?:^|; )session=([^;]+)/.exec(cookie ?? '')?.[1];
  const sessions = {
    reads: 0,
    carried: (headers: Request['headers']) =>
      Promise.resolve(accountIn(headers.cookie) !== undefined),
    trusts: (origin: string) => Promise.resolve(origin === trusted),
    read: (headers: Request['headers']): Promise<SessionRead> => {
      sessions.reads++;
      const account = accountIn(headers.cookie);
      return Promise.resolve({
        accountId: account === 'ended' ? undefined : account,
        renewedCookies: renewed,
      });
    },
  };
  return sessions;
}

/** An app that answers, on every method, which account the request is signed in as. */
function appWith(sessions: Sessions) {
  const app = express();
  app.use(sessionReader(sessions));
  app.all('/whoami', (req, res) => {
    res.json({ account: signedInAccount(req) ?? null });
  });
  app.use(
    errorBoundary(() => {
      // A failed session read is the error boundary's to answer; the log is not under test.
    }),
  );
  return app;
}

describe('sessionReader', () => {
  it('signs the request in as the account of its session', async () => {
    const response = await request(appWith(fakeSessions()))
      .get('/whoami')
      .set('Cookie', 'session=ana');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ account: 'ana' });
  });

  it('signs nothing in without a session cookie, reading nothing', async () => {
    const sessions = fakeSessions();

    const response = await request(appWith(sessions)).post('/whoami').set('Cookie', 'other=1');

    expect(response.body).toEqual({ account: null });
    expect(sessions.reads).toBe(0);
  });

  it('signs nothing in with a session that ended', async () => {
    const response = await request(appWith(fakeSessions()))
      .get('/whoami')
      .set('Cookie', 'session=ended');

    expect(response.body).toEqual({ account: null });
  });

  it('sends back every cookie renewed while reading the session', async () => {
    const renewed = ['qando.session_token=new; Max-Age=7776000', 'qando.extra=1'];

    const response = await request(appWith(fakeSessions(renewed)))
      .get('/whoami')
      .set('Cookie', 'session=ana');

    expect(response.headers['set-cookie']).toEqual(renewed);
  });

  it('sends no cookie back when the session was not renewed', async () => {
    const response = await request(appWith(fakeSessions()))
      .get('/whoami')
      .set('Cookie', 'session=ana');

    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'accepts a %s with the session from a page of qando',
    async (method) => {
      const response = await request(appWith(fakeSessions()))
        [method]('/whoami')
        .set('Cookie', 'session=ana')
        .set('Origin', trusted);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ account: 'ana' });
    },
  );

  describe.each(['post', 'put', 'patch', 'delete'] as const)('a %s with the session', (method) => {
    it.each([
      ['from a page of another site', 'https://evil.test'],
      ['without an origin', undefined],
    ])('is refused %s, before reading the session', async (_case, origin) => {
      const sessions = fakeSessions();
      const sent = request(appWith(sessions))[method]('/whoami').set('Cookie', 'session=ana');

      const response = await (origin === undefined ? sent : sent.set('Origin', origin));

      expect(response.status).toBe(403);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        error: {
          code: 'FORBIDDEN',
          message: 'The session cannot be used from this origin',
          details: [],
        },
      });
      expect(sessions.reads).toBe(0);
    });
  });

  it.each(['get', 'head', 'options'] as const)(
    'reads the session of a %s from another site: reading changes nothing',
    async (method) => {
      const sessions = fakeSessions();

      const response = await request(appWith(sessions))
        [method]('/whoami')
        .set('Cookie', 'session=ana')
        .set('Origin', 'https://evil.test');

      expect(response.status).toBe(200);
      expect(sessions.reads).toBe(1);
    },
  );

  it('lets a change from another site through when it carries no session', async () => {
    const response = await request(appWith(fakeSessions()))
      .post('/whoami')
      .set('Origin', 'https://evil.test');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ account: null });
  });

  it('hands a failed session read to the error boundary', async () => {
    const sessions: Sessions = {
      ...fakeSessions(),
      read: () => Promise.reject(new Error('database down')),
    };

    const response = await request(appWith(sessions)).get('/whoami').set('Cookie', 'session=ana');

    expect(response.status).toBe(500);
  });
});

describe('signedInAccount', () => {
  it('knows no account on a request the reader never saw', async () => {
    const app = express().get('/whoami', (req, res) => {
      res.json({ account: signedInAccount(req) ?? null });
    });

    const response = await request(app).get('/whoami').set('Cookie', 'session=ana');

    expect(response.body).toEqual({ account: null });
  });
});

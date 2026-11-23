import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import type { Sessions } from '../../http/session.js';
import { movingClock } from '../../test/moving-clock.js';
import {
  testDependencies,
  testSessionCookie,
  testSessions,
  testTrustedOrigin,
} from '../../test/test-dependencies.js';
import type { AccountDeletion, DeletionOutcome } from './account-deletion.js';
import type { CodeDelivery } from './sign-in.js';

/** The error a refused request answered. */
const errorOf = (response: request.Response) =>
  (response.body as { error: { code: string; attemptsLeft?: number } }).error;

/** An account deletion whose answers the test sets; it records every call. */
function fakeDeletion(delivery: CodeDelivery = 'sent', outcome?: DeletionOutcome) {
  const sentTo: string[] = [];
  const tried: { accountId: string; code: string }[] = [];
  const deletion: AccountDeletion = {
    sendCode: (accountId) => {
      sentTo.push(accountId);
      return Promise.resolve(delivery);
    },
    delete: (accountId, code) => {
      tried.push({ accountId, code });
      return Promise.resolve(outcome ?? { status: 'deleted' });
    },
  };
  return { deletion, sentTo, tried };
}

function appWith(
  deletion: AccountDeletion,
  options: { now?: () => Date; sessions?: Sessions } = {},
) {
  return createApp({
    ...testDependencies(),
    accountDeletion: deletion,
    ...(options.now && { now: options.now }),
    ...(options.sessions && { sessions: options.sessions }),
  });
}

const signedInAs = (accountId: string) => `${testSessionCookie}=${accountId}`;

const askCode = (app: ReturnType<typeof appWith>, ip = '1.1.1.1', account = 'ana') =>
  request(app)
    .post('/api/me/deletion-code')
    .set('Origin', testTrustedOrigin)
    .set('Cookie', signedInAs(account))
    .set('X-Forwarded-For', ip);

const deleteAccount = (
  app: ReturnType<typeof appWith>,
  body: object = { code: '482913' },
  ip = '1.1.1.1',
) =>
  request(app)
    .post('/api/me/deletion')
    .set('Origin', testTrustedOrigin)
    .set('Cookie', signedInAs('ana'))
    .set('X-Forwarded-For', ip)
    .send(body);

describe('POST /api/me/deletion-code', () => {
  it('sends the code for the session’s account and says when a new one may be asked for', async () => {
    const { deletion, sentTo } = fakeDeletion();

    const response = await askCode(appWith(deletion));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: true, resendAfterSeconds: 30 });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(sentTo).toEqual(['ana']);
  });

  it('answers 502 CODE_NOT_DELIVERED when the email server did not take it, and lets it be asked again at once', async () => {
    const { deletion, sentTo } = fakeDeletion('not-delivered');
    const app = appWith(deletion);

    const failed = await askCode(app);
    const again = await askCode(app);

    expect(failed.status).toBe(502);
    expect(errorOf(failed).code).toBe('CODE_NOT_DELIVERED');
    expect(again.status).toBe(502);
    expect(sentTo).toEqual(['ana', 'ana']);
  });

  it('sends a new code for the same account only after 30 seconds', async () => {
    const clock = movingClock();
    const { deletion, sentTo } = fakeDeletion();
    const app = appWith(deletion, { now: clock.now });

    await askCode(app);
    clock.advance(29_000);
    const tooSoon = await askCode(app, '2.2.2.2');
    clock.advance(1_000);
    const inTime = await askCode(app, '2.2.2.2');

    expect(tooSoon.status).toBe(429);
    expect(tooSoon.headers['retry-after']).toBe('1');
    expect(inTime.status).toBe(200);
    expect(sentTo).toEqual(['ana', 'ana']);
  });

  it('counts each account on its own', async () => {
    const { deletion, sentTo } = fakeDeletion();
    const app = appWith(deletion);

    await askCode(app, '1.1.1.1', 'ana');
    const luis = await askCode(app, '1.1.1.1', 'luis');

    expect(luis.status).toBe(200);
    expect(sentTo).toEqual(['ana', 'luis']);
  });

  it('sends at most 20 codes an hour from one address', async () => {
    const clock = movingClock();
    const { deletion } = fakeDeletion();
    const app = appWith(deletion, { now: clock.now });

    const answers = [];
    for (let account = 0; account < 21; account++) {
      answers.push((await askCode(app, '3.3.3.3', `account-${account}`)).status);
    }

    expect(answers.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(answers[20]).toBe(429);
  });

  it('refuses a request without a session with 401, sending nothing', async () => {
    const { deletion, sentTo } = fakeDeletion();

    const response = await request(appWith(deletion))
      .post('/api/me/deletion-code')
      .set('Origin', testTrustedOrigin);

    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe('UNAUTHENTICATED');
    expect(sentTo).toEqual([]);
  });

  it('refuses the session sent from a page of another site with 403, sending nothing', async () => {
    const { deletion, sentTo } = fakeDeletion();

    const response = await request(appWith(deletion))
      .post('/api/me/deletion-code')
      .set('Origin', 'https://elsewhere.example')
      .set('Cookie', signedInAs('ana'));

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe('FORBIDDEN');
    expect(sentTo).toEqual([]);
  });
});

describe('POST /api/me/deletion', () => {
  it('deletes the session’s account with the code and clears the browser’s cookies', async () => {
    const { deletion, tried } = fakeDeletion();

    const response = await deleteAccount(appWith(deletion));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deleted: true });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toEqual([`${testSessionCookie}=; Max-Age=0`]);
    expect(tried).toEqual([{ accountId: 'ana', code: '482913' }]);
  });

  it('answers deleted even when the cookies could not be cleared: the session went with the account', async () => {
    const { deletion } = fakeDeletion();
    const sessions: Sessions = {
      ...testSessions,
      end: () => Promise.reject(new Error('The database is down')),
    };

    const response = await deleteAccount(appWith(deletion, { sessions }));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deleted: true });
  });

  it.each([
    [{ status: 'wrong-code', attemptsLeft: 3 }, 'WRONG_CODE', 3],
    [{ status: 'expired' }, 'CODE_EXPIRED', undefined],
    [{ status: 'too-many-attempts' }, 'TOO_MANY_ATTEMPTS', undefined],
  ] as const)(
    'refuses a code that does not delete with 400 (%o), keeping the cookies',
    async (outcome, code, attemptsLeft) => {
      const { deletion } = fakeDeletion('sent', outcome);

      const response = await deleteAccount(appWith(deletion));

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe(code);
      expect(errorOf(response).attemptsLeft).toBe(attemptsLeft);
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it.each([[{}], [{ code: '48291' }], [{ code: '482913', email: 'ana@example.com' }]])(
    'refuses a body out of the contract (%o) with 400, trying nothing',
    async (body) => {
      const { deletion, tried } = fakeDeletion();

      const response = await deleteAccount(appWith(deletion), body);

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe('VALIDATION_FAILED');
      expect(tried).toEqual([]);
    },
  );

  it('tries at most 30 codes in 15 minutes from one address', async () => {
    const { deletion } = fakeDeletion('sent', { status: 'wrong-code', attemptsLeft: 1 });
    const app = appWith(deletion);

    const answers = [];
    for (let attempt = 0; attempt < 31; attempt++) {
      answers.push((await deleteAccount(app, { code: '482913' }, '4.4.4.4')).status);
    }

    expect(answers.slice(0, 30).every((status) => status === 400)).toBe(true);
    expect(answers[30]).toBe(429);
  });

  it('refuses a request without a session with 401, trying nothing', async () => {
    const { deletion, tried } = fakeDeletion();

    const response = await request(appWith(deletion))
      .post('/api/me/deletion')
      .set('Origin', testTrustedOrigin)
      .send({ code: '482913' });

    expect(response.status).toBe(401);
    expect(tried).toEqual([]);
  });

  it('refuses the session sent from a page of another site with 403, trying nothing', async () => {
    const { deletion, tried } = fakeDeletion();

    const response = await request(appWith(deletion))
      .post('/api/me/deletion')
      .set('Origin', 'https://elsewhere.example')
      .set('Cookie', signedInAs('ana'))
      .send({ code: '482913' });

    expect(response.status).toBe(403);
    expect(tried).toEqual([]);
  });
});

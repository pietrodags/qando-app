import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { testDependencies, testTrustedOrigin } from '../../test/test-dependencies.js';
import type { CodeDelivery, SignInCodes, SignInOutcome } from './sign-in.js';

/** The error a refused request answered. */
const errorOf = (response: request.Response) =>
  (response.body as { error: { code: string; attemptsLeft?: number; details: unknown[] } }).error;

/** Sign-in codes whose answers the test sets; they record every call. */
function fakeCodes(delivery: CodeDelivery = 'sent', outcome?: SignInOutcome) {
  const sent: string[] = [];
  const tried: { email: string; code: string }[] = [];
  const codes: SignInCodes = {
    send: (email) => {
      sent.push(email);
      return Promise.resolve(delivery);
    },
    signIn: (email, code) => {
      tried.push({ email, code });
      return Promise.resolve(
        outcome ?? { status: 'signed-in', cookies: ['qando.session_token=abc; Path=/; HttpOnly'] },
      );
    },
  };
  return { codes, sent, tried };
}

function appWith(codes: SignInCodes) {
  return createApp({ ...testDependencies(), signInCodes: codes });
}

const sendCode = (app: ReturnType<typeof appWith>, email = 'ana@example.com', ip = '1.1.1.1') =>
  request(app)
    .post('/api/auth/sign-in-code')
    .set('Origin', testTrustedOrigin)
    .set('X-Forwarded-For', ip)
    .send({ email });

const signIn = (
  app: ReturnType<typeof appWith>,
  body: object = { email: 'ana@example.com', code: '482915' },
  ip = '1.1.1.1',
) =>
  request(app)
    .post('/api/auth/sign-in')
    .set('Origin', testTrustedOrigin)
    .set('X-Forwarded-For', ip)
    .send(body);

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/auth/sign-in-code', () => {
  it('sends a code to the email, in lower case, and says when a new one may be asked for', async () => {
    const { codes, sent } = fakeCodes();

    const response = await sendCode(appWith(codes), ' Ana@Example.com ');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ sent: true, resendAfterSeconds: 30 });
    expect(sent).toEqual(['ana@example.com']);
  });

  it('answers 502 CODE_NOT_DELIVERED when the email server did not take it', async () => {
    const { codes } = fakeCodes('not-delivered');

    const response = await sendCode(appWith(codes));

    expect(response.status).toBe(502);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      error: {
        code: 'CODE_NOT_DELIVERED',
        message: 'The code email could not be delivered',
        details: [],
      },
    });
  });

  it('lets a code that was not delivered be asked for again at once', async () => {
    const { codes, sent } = fakeCodes('not-delivered');
    const app = appWith(codes);
    await sendCode(app);

    const again = await sendCode(app);

    expect(again.status).toBe(502);
    expect(sent).toHaveLength(2);
  });

  it('counts a code delivered after the browser gave up waiting', async () => {
    let deliver: (() => void) | undefined;
    const codes: SignInCodes = {
      // The first email takes long to deliver; any later one is delivered at once.
      send: () =>
        deliver
          ? Promise.resolve('sent')
          : new Promise((resolve) => {
              deliver = () => {
                resolve('sent');
              };
            }),
      signIn: () => Promise.reject(new Error('Not tried')),
    };
    const app = appWith(codes);
    await expect(sendCode(app).timeout(50)).rejects.toThrow('Timeout');
    // The server sees the browser leave before the email server answers.
    await new Promise((resolve) => setTimeout(resolve, 50));
    deliver?.();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const again = await sendCode(app);

    expect(again.status).toBe(429);
  });

  it('refuses a body that is not an email with 400, sending nothing', async () => {
    const { codes, sent } = fakeCodes();

    const response = await sendCode(appWith(codes), 'ana');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request breaks the contract',
        details: [{ code: 'INVALID_FIELD', in: 'body', path: ['email'] }],
      },
    });
    expect(sent).toEqual([]);
  });

  it('refuses a request from a page of another site with 403, sending nothing', async () => {
    const { codes, sent } = fakeCodes();

    const response = await request(appWith(codes))
      .post('/api/auth/sign-in-code')
      .set('Origin', 'https://evil.test')
      .send({ email: 'ana@example.com' });

    expect(response.status).toBe(403);
    expect(sent).toEqual([]);
  });

  it('sends a new code for the same email only after 30 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { codes, sent } = fakeCodes();
    const app = appWith(codes);
    await sendCode(app, 'Ana@example.com');

    vi.advanceTimersByTime(29_000);
    const early = await sendCode(app, 'ana@example.com');
    vi.advanceTimersByTime(1_000);
    const later = await sendCode(app, 'ana@example.com');

    expect(early.status).toBe(429);
    expect(early.headers['retry-after']).toBe('1');
    expect(errorOf(early).code).toBe('RATE_LIMITED');
    expect(later.status).toBe(200);
    expect(sent).toHaveLength(2);
  });

  it('sends at most 5 codes an hour to one email, from any address', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { codes, sent } = fakeCodes();
    const app = appWith(codes);
    for (let send = 0; send < 5; send += 1) {
      expect((await sendCode(app, 'ana@example.com', `2.2.2.${send}`)).status).toBe(200);
      vi.advanceTimersByTime(30_000);
    }

    const sixth = await sendCode(app, 'ana@example.com', '2.2.2.9');
    vi.advanceTimersByTime(60 * 60_000 - 5 * 30_000);
    const nextHour = await sendCode(app, 'ana@example.com', '2.2.2.9');

    expect(sixth.status).toBe(429);
    expect(sixth.headers['retry-after']).toBe(String(60 * 60 - 5 * 30));
    expect(nextHour.status).toBe(200);
    expect(sent).toHaveLength(6);
  });

  it('limits each email on its own', async () => {
    const { codes } = fakeCodes();
    const app = appWith(codes);
    await sendCode(app, 'ana@example.com');

    const other = await sendCode(app, 'luis@example.com');

    expect(other.status).toBe(200);
  });

  it('answers at most 20 requests an hour from one address, whatever the email', async () => {
    const { codes, sent } = fakeCodes();
    const app = appWith(codes);
    for (let send = 0; send < 20; send += 1) {
      expect((await sendCode(app, `person${send}@example.com`)).status).toBe(200);
    }

    const refused = await sendCode(app, 'one-more@example.com');
    const otherAddress = await sendCode(app, 'one-more@example.com', '3.3.3.3');

    expect(refused.status).toBe(429);
    expect(otherAddress.status).toBe(200);
    expect(sent).toHaveLength(21);
  });
});

describe('POST /api/auth/sign-in', () => {
  it('signs the browser in with the code: the session cookie is set', async () => {
    const { codes, tried } = fakeCodes();

    const response = await signIn(appWith(codes), { email: 'Ana@Example.com', code: '482915' });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toEqual(['qando.session_token=abc; Path=/; HttpOnly']);
    expect(response.body).toEqual({ signedIn: true });
    expect(tried).toEqual([{ email: 'ana@example.com', code: '482915' }]);
  });

  it('tells a wrong code with the attempts left', async () => {
    const { codes } = fakeCodes('sent', { status: 'wrong-code', attemptsLeft: 4 });

    const response = await signIn(appWith(codes));

    expect(response.status).toBe(400);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).toEqual({
      error: {
        code: 'WRONG_CODE',
        message: 'The code is not the last one sent to this email',
        details: [],
        attemptsLeft: 4,
      },
    });
  });

  it.each([
    [{ status: 'expired' }, 'CODE_EXPIRED', 'The email has no valid code'],
    [{ status: 'too-many-attempts' }, 'TOO_MANY_ATTEMPTS', 'The code is void after 5 wrong tries'],
  ] as const)('answers %o with 400 %s', async (outcome, code, message) => {
    const { codes } = fakeCodes('sent', outcome);

    const response = await signIn(appWith(codes));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code, message, details: [] } });
  });

  it('refuses a code that is not 6 digits with 400, trying nothing', async () => {
    const { codes, tried } = fakeCodes();

    const response = await signIn(appWith(codes), { email: 'ana@example.com', code: '4829' });

    expect(response.status).toBe(400);
    expect(errorOf(response).details).toEqual([
      { code: 'INVALID_FIELD', in: 'body', path: ['code'] },
    ]);
    expect(tried).toEqual([]);
  });

  it('refuses a sign-in from a page of another site with 403, trying nothing', async () => {
    const { codes, tried } = fakeCodes();

    const response = await request(appWith(codes))
      .post('/api/auth/sign-in')
      .send({ email: 'ana@example.com', code: '482915' });

    expect(response.status).toBe(403);
    expect(tried).toEqual([]);
  });

  it('answers at most 30 tries in 15 minutes from one address', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { codes, tried } = fakeCodes('sent', { status: 'wrong-code', attemptsLeft: 4 });
    const app = appWith(codes);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect((await signIn(app)).status).toBe(400);
    }

    const refused = await signIn(app);
    vi.advanceTimersByTime(15 * 60_000);
    const later = await signIn(app);

    expect(refused.status).toBe(429);
    expect(refused.headers['retry-after']).toBe(String(15 * 60));
    expect(later.status).toBe(400);
    expect(tried).toHaveLength(31);
  });
});

import type { ManagedEvent, Option } from '@qando/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { hashCapabilityToken } from '../../capability-token.js';
import {
  endedSession,
  testDependencies,
  testSessionCookie,
  testTrustedOrigin,
  type TestManagedEvent,
} from '../../test/test-dependencies.js';
import type { ManagedEvents, StoredManagedEvent } from './managed-events.js';

// "Cena de verano" closes at the end of 1 July in Madrid.
const closesAt = new Date('2026-07-01T21:59:59.999Z');
const beforeDeadline = '2026-06-15T08:00:00Z';
const afterDeadline = '2026-07-02T08:00:00Z';

const token = 'Zx81aB2cD4eF6gH8iJ0kLm';
const otherToken = 'Bq55aB2cD4eF6gH8iJ0kLm';

const option = (id: string, date: string): Option => ({
  id,
  dates: { kind: 'single', date },
  time: null,
});
const july6 = option('6a1e0c9b-1f4e-4b8e-9a51-0c1d2e3f4a06', '2026-07-06');
const july10 = option('0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c10', '2026-07-10');

const cena: StoredManagedEvent = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  state: 'open',
  closesAt,
  options: [july6, july10],
  confirmedOption: null,
  participationId: 'k3Jd9',
  resultsId: 'Qw7p2',
  votes: [
    { [july6.id]: 'available', [july10.id]: 'preferred' },
    { [july6.id]: 'unavailable', [july10.id]: 'available' },
  ],
};

const managed = (event: Partial<StoredManagedEvent> = {}): TestManagedEvent => ({
  status: 'found',
  managementTokenHash: hashCapabilityToken(token),
  ownerId: 'ana',
  event: { ...cena, ...event },
});

/** The cookie of a session signed in as the account (`testSessions`). */
const sessionOf = (accountId: string) => `${testSessionCookie}=${accountId}`;

function appWith(events: Record<string, TestManagedEvent>, now = beforeDeadline) {
  return createApp(testDependencies({ managedEvents: events, now: new Date(now) }));
}

const manage = (app: ReturnType<typeof appWith>, id: string, managementToken?: string) => {
  const sent = request(app).get(`/api/events/${id}`);
  return managementToken === undefined ? sent : sent.set('X-Management-Token', managementToken);
};

const manageCena = (event: Partial<StoredManagedEvent> = {}, now = beforeDeadline) =>
  manage(appWith({ k3Jd9: managed(event) }, now), 'k3Jd9', token);

describe('GET /api/events/:id', () => {
  it('answers the event to its management token, with the votes counted and the recommendation', async () => {
    const response = await manageCena();

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      title: 'Cena de verano',
      timeZone: 'Europe/Madrid',
      deadline: '2026-07-01',
      state: 'open',
      options: [july6, july10],
      confirmedOption: null,
      voters: 2,
      recommendedOptionIds: [july10.id],
      participationId: 'k3Jd9',
      resultsId: 'Qw7p2',
    } satisfies ManagedEvent);
  });

  it('answers voting as closed once the deadline has passed', async () => {
    const response = await manageCena({}, afterDeadline);
    expect((response.body as ManagedEvent).state).toBe('closed');
  });

  it('answers the confirmed option of a confirmed event', async () => {
    const response = await manageCena({ state: 'confirmed', confirmedOption: july10 });

    expect(response.body).toMatchObject({ state: 'confirmed', confirmedOption: july10 });
  });

  it('recommends nothing when nobody has voted', async () => {
    const response = await manageCena({ votes: [] });

    expect(response.body).toMatchObject({ voters: 0, recommendedOptionIds: [] });
  });

  it('recommends every option tied first, in chronological order', async () => {
    const response = await manageCena({
      votes: [{ [july6.id]: 'available', [july10.id]: 'available' }],
    });

    expect((response.body as ManagedEvent).recommendedOptionIds).toEqual([july6.id, july10.id]);
  });

  it('answers 401 UNAUTHENTICATED to a request without a credential', async () => {
    const response = await manage(appWith({ k3Jd9: managed() }), 'k3Jd9');

    expect(response.status).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'No credential to manage the event', details: [] },
    });
  });

  it.each([
    ['a wrong token', 'k3Jd9', otherToken],
    ['the participation link as the token', 'k3Jd9', 'k3Jd9aB2cD4eF6gH8iJ0kL'],
    ['the token of another event', 'Lm4Qa', token],
    ['an event that does not exist', 'nobody', token],
  ])('answers 403 FORBIDDEN to %s', async (_name, id, managementToken) => {
    const app = appWith({
      k3Jd9: managed(),
      Lm4Qa: {
        status: 'found',
        managementTokenHash: hashCapabilityToken(otherToken),
        ownerId: 'bea',
        event: cena,
      },
    });

    const response = await manage(app, id, managementToken);

    expect(response.status).toBe(403);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'The credential does not manage this event',
        details: [],
      },
    });
  });

  it('answers the event to its owner’s session, without a token', async () => {
    const response = await manage(appWith({ k3Jd9: managed() }), 'k3Jd9').set(
      'Cookie',
      sessionOf('ana'),
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ title: 'Cena de verano', participationId: 'k3Jd9' });
  });

  it('answers 403 FORBIDDEN to the session of another account', async () => {
    const response = await manage(appWith({ k3Jd9: managed() }), 'k3Jd9').set(
      'Cookie',
      sessionOf('bea'),
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('answers 401 UNAUTHENTICATED to a session that ended, without a token', async () => {
    const response = await manage(appWith({ k3Jd9: managed() }), 'k3Jd9').set(
      'Cookie',
      sessionOf(endedSession),
    );

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it.each([
    ['the event’s token with the session of another account', token, 'bea'],
    ['the owner’s session with a wrong token', otherToken, 'ana'],
  ])(
    'answers the event to %s: either credential grants it',
    async (_name, managementToken, account) => {
      const response = await manage(appWith({ k3Jd9: managed() }), 'k3Jd9', managementToken).set(
        'Cookie',
        sessionOf(account),
      );

      expect(response.status).toBe(200);
    },
  );

  it('answers 410 with the title of a cancelled event to any session', async () => {
    const app = appWith({ k3Jd9: { status: 'cancelled', title: 'Cena de verano' } });

    const response = await manage(app, 'k3Jd9').set('Cookie', sessionOf('bea'));

    expect(response.status).toBe(410);
  });

  it('answers 410 with the title of a cancelled event, whatever the token', async () => {
    const app = appWith({ k3Jd9: { status: 'cancelled', title: 'Cena de verano' } });

    const response = await manage(app, 'k3Jd9', otherToken);

    expect(response.status).toBe(410);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      error: {
        code: 'EVENT_CANCELLED',
        message: 'The event was cancelled',
        details: [],
        title: 'Cena de verano',
      },
    });
  });

  it('answers 403 when the event is gone between the token check and the read', async () => {
    const dependencies = testDependencies({ managedEvents: { k3Jd9: managed() } });
    const vanishing: ManagedEvents = {
      access: (id, match) => dependencies.managedEvents.access(id, match),
      event: () => Promise.resolve(undefined),
      change: (work) => dependencies.managedEvents.change(work),
    };

    const response = await manage(
      createApp({ ...dependencies, managedEvents: vanishing }),
      'k3Jd9',
      token,
    );

    expect(response.status).toBe(403);
  });

  it('answers 400 to a malformed token, naming the header but never its value', async () => {
    const response = await manage(appWith({ k3Jd9: managed() }), 'k3Jd9', 'short');

    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request breaks the contract',
        details: [{ code: 'INVALID_FIELD', in: 'header', path: ['x-management-token'] }],
      },
    });
  });

  it('logs a failure without the token, its hash or the link', async () => {
    const logged: unknown[] = [];
    const failing: ManagedEvents = {
      access: (id, { tokenHash }) => Promise.reject(new Error(`no event ${id} for ${tokenHash}`)),
      event: () => Promise.reject(new Error('unreachable')),
      change: () => Promise.reject(new Error('unreachable')),
    };
    const app = createApp({
      ...testDependencies(),
      managedEvents: failing,
      logError: (entry) => logged.push(entry),
    });

    const response = await manage(app, 'k3Jd9', token);

    expect(response.status).toBe(500);
    expect(logged).toHaveLength(1);
    const line = JSON.stringify(logged);
    for (const secret of [token, hashCapabilityToken(token), 'k3Jd9']) {
      expect(line).not.toContain(secret);
    }
  });
});

describe('POST /api/events/:id/confirmation', () => {
  const confirm = (
    app: ReturnType<typeof appWith>,
    body: object | string,
    // `null` sends no token at all.
    { managementToken = token }: { managementToken?: string | null } = {},
  ) => {
    const sent = request(app)
      .post('/api/events/k3Jd9/confirmation')
      .set('Content-Type', 'application/json')
      .send(typeof body === 'string' ? body : JSON.stringify(body));
    return managementToken === null ? sent : sent.set('X-Management-Token', managementToken);
  };

  const confirmedIn = async (app: ReturnType<typeof appWith>) =>
    ((await manage(app, 'k3Jd9', token)).body as ManagedEvent).confirmedOption;

  it('confirms an option while voting is open, closing it, and answers the managed event', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await confirm(app, { optionId: july10.id });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      title: 'Cena de verano',
      timeZone: 'Europe/Madrid',
      deadline: '2026-07-01',
      state: 'confirmed',
      options: [july6, july10],
      confirmedOption: july10,
      voters: 2,
      recommendedOptionIds: [july10.id],
      participationId: 'k3Jd9',
      resultsId: 'Qw7p2',
    } satisfies ManagedEvent);
    expect(await confirmedIn(app)).toEqual(july10);
  });

  it.each([
    ['after the deadline', {}, afterDeadline],
    ['once the organizer closed voting', { state: 'closed' as const }, beforeDeadline],
    ['an option that is not the recommended one', {}, beforeDeadline, july6],
    ['with no votes', { votes: [] }, beforeDeadline],
  ])('confirms %s', async (_name, event: Partial<StoredManagedEvent>, now, chosen = july10) => {
    const app = appWith({ k3Jd9: managed(event) }, now);

    const response = await confirm(app, { optionId: chosen.id });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ state: 'confirmed', confirmedOption: chosen });
  });

  it('answers the same to the confirmed option sent again, changing nothing', async () => {
    const app = appWith({ k3Jd9: managed() });
    const first = await confirm(app, { optionId: july10.id });

    const again = await confirm(app, { optionId: july10.id });

    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
  });

  it('reads the option ID whatever the case of its letters, also when sent again', async () => {
    const app = appWith({ k3Jd9: managed() });

    const first = await confirm(app, { optionId: july10.id.toUpperCase() });
    const again = await confirm(app, { optionId: july10.id });
    const upperAgain = await confirm(app, { optionId: july10.id.toUpperCase() });

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ confirmedOption: july10 });
    expect([again.status, upperAgain.status]).toEqual([200, 200]);
  });

  it('refuses another option once one is confirmed with 409 ALREADY_CONFIRMED', async () => {
    const app = appWith({ k3Jd9: managed({ state: 'confirmed', confirmedOption: july10 }) });

    const response = await confirm(app, { optionId: july6.id });

    expect(response.status).toBe(409);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      error: {
        code: 'ALREADY_CONFIRMED',
        message: 'Another option is already confirmed',
        details: [],
      },
    });
    expect(await confirmedIn(app)).toEqual(july10);
  });

  it('refuses an option that is not of the event with 400, naming it', async () => {
    const app = appWith({ k3Jd9: managed() });
    const elsewhere = '9d3e1a2b-4c5d-4e6f-8a7b-1c2d3e4f5a6b';

    const response = await confirm(app, { optionId: elsewhere });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The option is not one of the event’s',
        details: [{ code: 'OPTION_UNKNOWN', optionId: elsewhere }],
      },
    });
    expect(await confirmedIn(app)).toBeNull();
  });

  it.each([
    ['no option', {}],
    ['an option ID that is no UUID', { optionId: '10' }],
    ['a field that is not part of the contract', { optionId: july10.id, final: true }],
  ])('answers 400 to a body with %s, naming the field', async (_name, body) => {
    const app = appWith({ k3Jd9: managed() });

    const response = await confirm(app, body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request breaks the contract',
        details: [{ code: 'INVALID_FIELD', in: 'body' }],
      },
    });
    expect(await confirmedIn(app)).toBeNull();
  });

  it('answers 400 to a body that is not JSON', async () => {
    const response = await confirm(appWith({ k3Jd9: managed() }), '{"optionId":');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('answers 400 to a body larger than a confirmation needs, even if valid, and confirms nothing', async () => {
    const app = appWith({ k3Jd9: managed() });
    const padded = `{"optionId":"${july10.id}"${' '.repeat(1024)}}`;

    const response = await confirm(app, padded);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_FAILED', message: 'The request is malformed' },
    });
    expect(await confirmedIn(app)).toBeNull();
  });

  it('answers 401 without a credential and confirms nothing', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await confirm(app, { optionId: july10.id }, { managementToken: null });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    expect(await confirmedIn(app)).toBeNull();
  });

  it.each([
    ['a wrong token', otherToken],
    ['the participation link as the token', 'k3Jd9aB2cD4eF6gH8iJ0kL'],
  ])('answers 403 to %s and confirms nothing', async (_name, managementToken) => {
    const app = appWith({ k3Jd9: managed() });

    const response = await confirm(app, { optionId: july10.id }, { managementToken });

    expect(response.status).toBe(403);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(await confirmedIn(app)).toBeNull();
  });

  const confirmWithSession = (
    app: ReturnType<typeof appWith>,
    account: string,
    origin?: string,
  ) => {
    const sent = confirm(app, { optionId: july10.id }, { managementToken: null }).set(
      'Cookie',
      sessionOf(account),
    );
    return origin === undefined ? sent : sent.set('Origin', origin);
  };

  it('confirms with the owner’s session sent from a page of qando', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await confirmWithSession(app, 'ana', testTrustedOrigin);

    expect(response.status).toBe(200);
    expect(await confirmedIn(app)).toEqual(july10);
  });

  it('answers 403 to the session of another account and confirms nothing', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await confirmWithSession(app, 'bea', testTrustedOrigin);

    expect(response.status).toBe(403);
    expect(await confirmedIn(app)).toBeNull();
  });

  it.each([
    ['from a page of another site', 'https://evil.test'],
    ['without an origin', undefined],
  ])('refuses the owner’s session sent %s and confirms nothing', async (_name, origin) => {
    const app = appWith({ k3Jd9: managed() });

    const response = await confirmWithSession(app, 'ana', origin);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: { code: 'FORBIDDEN', message: 'The session cannot be used from this origin' },
    });
    expect(await confirmedIn(app)).toBeNull();
  });

  it('answers 410 with the title of a cancelled event', async () => {
    const app = appWith({ k3Jd9: { status: 'cancelled', title: 'Cena de verano' } });

    const response = await confirm(app, { optionId: july10.id });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });

  it('answers 403 when the event is gone between the token check and the confirmation', async () => {
    const dependencies = testDependencies({ managedEvents: { k3Jd9: managed() } });
    const vanishing: ManagedEvents = {
      ...dependencies.managedEvents,
      change: (work) =>
        work({
          lock: () => Promise.resolve(undefined),
          confirm: () => Promise.reject(new Error('Nothing to confirm')),
        }),
    };

    const response = await confirm(createApp({ ...dependencies, managedEvents: vanishing }), {
      optionId: july10.id,
    });

    expect(response.status).toBe(403);
  });
});

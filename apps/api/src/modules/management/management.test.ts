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
  emails: [{ type: 'summary', status: 'sent', sentAt: new Date('2026-06-15T08:00:05Z') }],
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

/**
 * An app whose event is cancelled by another request (a second tab) after the check of who is
 * acting: while the change it asks for waits for the event's lock (`change`, by default), just
 * before the event is read (`event`) or before a failed email is made due again
 * (`retryFailedEmail`).
 */
function cancelledSinceTheCheck({
  before = 'change',
  event = managed(),
}: {
  before?: 'change' | 'event' | 'retryFailedEmail';
  event?: ReturnType<typeof managed>;
} = {}) {
  const dependencies = testDependencies({ managedEvents: { k3Jd9: event } });
  const { managedEvents } = dependencies;
  const cancelling = async (step: typeof before) => {
    if (step !== before) return;
    await request(createApp(dependencies))
      .delete('/api/events/k3Jd9')
      .set('X-Management-Token', token);
  };
  const overtaken: ManagedEvents = {
    ...managedEvents,
    change: async (work) => {
      await cancelling('change');
      return managedEvents.change(work);
    },
    event: async (organizer) => {
      await cancelling('event');
      return managedEvents.event(organizer);
    },
    retryFailedEmail: async (organizer, type, at) => {
      await cancelling('retryFailedEmail');
      return managedEvents.retryFailedEmail(organizer, type, at);
    },
  };
  return createApp({ ...dependencies, managedEvents: overtaken });
}

/** An app whose event is gone between the check of who is acting and the change it asks for. */
function goneSinceTheCheck() {
  const dependencies = testDependencies({ managedEvents: { k3Jd9: managed() } });
  const managedEvents: ManagedEvents = {
    ...dependencies.managedEvents,
    change: (work) =>
      work({
        lock: () => Promise.resolve(undefined),
        confirm: () => Promise.reject(new Error('Nothing to confirm')),
        setClosing: () => Promise.reject(new Error('Nothing to change')),
      }),
  };
  return createApp({ ...dependencies, managedEvents });
}

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
      emails: [{ type: 'summary', status: 'sent', sentAt: '2026-06-15T08:00:05.000Z' }],
    } satisfies ManagedEvent);
  });

  it('answers each email’s state, saying when only for one sent', async () => {
    const response = await manageCena({
      emails: [
        { type: 'summary', status: 'failed' },
        { type: 'voting-closed', status: 'failed' },
      ],
    });

    expect((response.body as ManagedEvent).emails).toEqual([
      { type: 'summary', status: 'failed' },
      { type: 'voting-closed', status: 'failed' },
    ]);
  });

  it('answers "voting closed" as scheduled while voting is open: it waits for the closing', async () => {
    const response = await manageCena({
      emails: [
        { type: 'summary', status: 'pending' },
        { type: 'voting-closed', status: 'pending' },
      ],
    });

    expect((response.body as ManagedEvent).emails).toEqual([
      { type: 'summary', status: 'pending' },
      { type: 'voting-closed', status: 'scheduled' },
    ]);
  });

  it.each([
    ['by its deadline', {}, afterDeadline],
    ['early', { state: 'closed' }, undefined],
  ] as const)(
    'answers "voting closed" as being sent once voting has closed %s',
    async (_name, event, at) => {
      const response = await manageCena(
        { ...event, emails: [{ type: 'voting-closed', status: 'pending' }] },
        at,
      );

      expect((response.body as ManagedEvent).emails).toEqual([
        { type: 'voting-closed', status: 'pending' },
      ]);
    },
  );

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
      ownedBy: (accountId) => dependencies.managedEvents.ownedBy(accountId),
      event: () => Promise.resolve(undefined),
      retryFailedEmail: () => Promise.reject(new Error('unreachable')),
      cancel: () => Promise.reject(new Error('unreachable')),
      change: (work) => dependencies.managedEvents.change(work),
    };

    const response = await manage(
      createApp({ ...dependencies, managedEvents: vanishing }),
      'k3Jd9',
      token,
    );

    expect(response.status).toBe(403);
  });

  it('answers 410 with the title when another request cancelled it between the check and the read', async () => {
    const response = await manage(cancelledSinceTheCheck({ before: 'event' }), 'k3Jd9', token);

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
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
      ownedBy: () => Promise.reject(new Error('unreachable')),
      event: () => Promise.reject(new Error('unreachable')),
      retryFailedEmail: () => Promise.reject(new Error('unreachable')),
      cancel: () => Promise.reject(new Error('unreachable')),
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
      emails: [{ type: 'summary', status: 'sent', sentAt: '2026-06-15T08:00:05.000Z' }],
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
    const vanishing = goneSinceTheCheck();

    const response = await confirm(vanishing, {
      optionId: july10.id,
    });

    expect(response.status).toBe(403);
  });

  it('answers 410 with the title when another request cancelled it since the check', async () => {
    const response = await confirm(cancelledSinceTheCheck(), { optionId: july10.id });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });

  it('answers 410 with the title when another request cancelled it once the date was confirmed', async () => {
    const response = await confirm(cancelledSinceTheCheck({ before: 'event' }), {
      optionId: july10.id,
    });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });
});

describe('POST /api/events/:id/emails/:type/retry', () => {
  const failedSummary = managed({ emails: [{ type: 'summary', status: 'failed' }] });

  const retry = (
    app: ReturnType<typeof appWith>,
    {
      type = 'summary',
      managementToken = token,
    }: { type?: string; managementToken?: string | null } = {},
  ) => {
    const sent = request(app).post(`/api/events/k3Jd9/emails/${type}/retry`);
    return managementToken === null ? sent : sent.set('X-Management-Token', managementToken);
  };

  const emailsIn = async (app: ReturnType<typeof appWith>) =>
    ((await manage(app, 'k3Jd9', token)).body as ManagedEvent).emails;

  it('makes a failed email due again and answers it pending', async () => {
    const app = appWith({ k3Jd9: failedSummary });

    const response = await retry(app);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ type: 'summary', status: 'pending' });
    expect(await emailsIn(app)).toEqual([{ type: 'summary', status: 'pending' }]);
  });

  it('retries a failed "voting closed" email, leaving the summary as it is', async () => {
    const app = appWith({
      k3Jd9: managed({
        state: 'closed',
        emails: [
          { type: 'summary', status: 'failed' },
          { type: 'voting-closed', status: 'failed' },
        ],
      }),
    });

    const response = await retry(app, { type: 'voting-closed' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ type: 'voting-closed', status: 'pending' });
    expect(await emailsIn(app)).toEqual([
      { type: 'summary', status: 'failed' },
      { type: 'voting-closed', status: 'pending' },
    ]);
  });

  it.each([
    ['sent', managed()],
    ['still being tried', managed({ emails: [{ type: 'summary', status: 'pending' }] })],
    ['never queued', managed({ emails: [] })],
  ])('refuses an email %s with 409 EMAIL_NOT_FAILED, changing nothing', async (_name, event) => {
    const app = appWith({ k3Jd9: event });
    const before = await emailsIn(app);

    const response = await retry(app);

    expect(response.status).toBe(409);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      error: { code: 'EMAIL_NOT_FAILED', message: 'Only a failed email is retried', details: [] },
    });
    expect(await emailsIn(app)).toEqual(before);
  });

  it('answers 400 to an email that is not one of the event’s, naming the path', async () => {
    const app = appWith({ k3Jd9: failedSummary });

    const response = await retry(app, { type: 'voting_closed' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_FAILED', details: [{ code: 'INVALID_FIELD', in: 'path' }] },
    });
    expect(await emailsIn(app)).toEqual([{ type: 'summary', status: 'failed' }]);
  });

  it('answers 401 without a credential and retries nothing', async () => {
    const app = appWith({ k3Jd9: failedSummary });

    const response = await retry(app, { managementToken: null });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    expect(await emailsIn(app)).toEqual([{ type: 'summary', status: 'failed' }]);
  });

  it.each([
    ['a wrong token', otherToken],
    ['the participation link as the token', 'k3Jd9aB2cD4eF6gH8iJ0kL'],
  ])('answers 403 to %s and retries nothing', async (_name, managementToken) => {
    const app = appWith({ k3Jd9: failedSummary });

    const response = await retry(app, { managementToken });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(await emailsIn(app)).toEqual([{ type: 'summary', status: 'failed' }]);
  });

  const retryWithSession = (app: ReturnType<typeof appWith>, account: string, origin?: string) => {
    const sent = retry(app, { managementToken: null }).set('Cookie', sessionOf(account));
    return origin === undefined ? sent : sent.set('Origin', origin);
  };

  it('retries with the owner’s session sent from a page of qando', async () => {
    const app = appWith({ k3Jd9: failedSummary });

    const response = await retryWithSession(app, 'ana', testTrustedOrigin);

    expect(response.status).toBe(200);
    expect(await emailsIn(app)).toEqual([{ type: 'summary', status: 'pending' }]);
  });

  it('answers 403 to the session of another account and retries nothing', async () => {
    const app = appWith({ k3Jd9: failedSummary });

    const response = await retryWithSession(app, 'bea', testTrustedOrigin);

    expect(response.status).toBe(403);
    expect(await emailsIn(app)).toEqual([{ type: 'summary', status: 'failed' }]);
  });

  it.each([
    ['from a page of another site', 'https://evil.test'],
    ['without an origin', undefined],
  ])('refuses the owner’s session sent %s and retries nothing', async (_name, origin) => {
    const app = appWith({ k3Jd9: failedSummary });

    const response = await retryWithSession(app, 'ana', origin);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: { code: 'FORBIDDEN', message: 'The session cannot be used from this origin' },
    });
    expect(await emailsIn(app)).toEqual([{ type: 'summary', status: 'failed' }]);
  });

  it('answers 410 with the title of a cancelled event', async () => {
    const app = appWith({ k3Jd9: { status: 'cancelled', title: 'Cena de verano' } });

    const response = await retry(app);

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });

  it('answers 410 with the title when another request cancelled it since the check', async () => {
    const app = cancelledSinceTheCheck({ before: 'retryFailedEmail', event: failedSummary });

    const response = await retry(app);

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });
});

describe('DELETE /api/events/:id', () => {
  const cancel = (app: ReturnType<typeof appWith>, managementToken: string | null = token) => {
    const sent = request(app).delete('/api/events/k3Jd9');
    return managementToken === null ? sent : sent.set('X-Management-Token', managementToken);
  };

  const cancelWithSession = (app: ReturnType<typeof appWith>, account: string, origin?: string) => {
    const sent = cancel(app, null).set('Cookie', sessionOf(account));
    return origin === undefined ? sent : sent.set('Origin', origin);
  };

  /** What the management link answers afterwards: the event, or 410 once it is cancelled. */
  const statusAfter = async (app: ReturnType<typeof appWith>) =>
    (await manage(app, 'k3Jd9', token)).status;

  const cancelledAnswer = {
    error: {
      code: 'EVENT_CANCELLED',
      message: 'The event was cancelled',
      details: [],
      title: 'Cena de verano',
    },
  };

  it('cancels the event with its management token and answers its title alone', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await cancel(app);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ title: 'Cena de verano' });
    const afterwards = await manage(app, 'k3Jd9', token);
    expect(afterwards.status).toBe(410);
    expect(afterwards.body).toEqual(cancelledAnswer);
  });

  it.each([
    ['closed', managed({ state: 'closed' }), beforeDeadline],
    ['past its deadline', managed(), afterDeadline],
    ['confirmed', managed({ state: 'confirmed', confirmedOption: july10 }), beforeDeadline],
  ])('cancels an event %s too', async (_name, event, now) => {
    const app = appWith({ k3Jd9: event }, now);

    const response = await cancel(app);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ title: 'Cena de verano' });
  });

  it('answers a repeat with 410 and the title, as the page shows the same card', async () => {
    const app = appWith({ k3Jd9: managed() });
    await cancel(app);

    const again = await cancel(app);

    expect(again.status).toBe(410);
    expect(again.headers['cache-control']).toBe('no-store');
    expect(again.body).toEqual(cancelledAnswer);
  });

  it('answers 410 with the title when another request cancelled it since the check', async () => {
    const dependencies = testDependencies({ managedEvents: { k3Jd9: managed() } });
    const { managedEvents } = dependencies;
    const overtaken: ManagedEvents = {
      ...managedEvents,
      // The other request (a second tab, an agent's retry) deletes it first.
      cancel: async (organizer) => {
        await managedEvents.cancel(organizer);
        return undefined;
      },
    };

    const response = await cancel(createApp({ ...dependencies, managedEvents: overtaken }));

    expect(response.status).toBe(410);
    expect(response.body).toEqual(cancelledAnswer);
  });

  it('answers 401 without a credential and cancels nothing', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await cancel(app, null);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    expect(await statusAfter(app)).toBe(200);
  });

  it.each([
    ['a wrong token', otherToken],
    ['the participation link as the token', 'k3Jd9aB2cD4eF6gH8iJ0kL'],
  ])('answers 403 to %s and cancels nothing', async (_name, managementToken) => {
    const app = appWith({ k3Jd9: managed() });

    const response = await cancel(app, managementToken);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(await statusAfter(app)).toBe(200);
  });

  it('answers 400 to a malformed token, naming the header, and cancels nothing', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await cancel(app, 'short');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        details: [{ code: 'INVALID_FIELD', in: 'header', path: ['x-management-token'] }],
      },
    });
    expect(await statusAfter(app)).toBe(200);
  });

  it('cancels with the owner’s session sent from a page of qando', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await cancelWithSession(app, 'ana', testTrustedOrigin);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ title: 'Cena de verano' });
    expect(await statusAfter(app)).toBe(410);
  });

  it('answers 403 to the session of another account and cancels nothing', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await cancelWithSession(app, 'bea', testTrustedOrigin);

    expect(response.status).toBe(403);
    expect(await statusAfter(app)).toBe(200);
  });

  it.each([
    ['from a page of another site', 'https://evil.test'],
    ['without an origin', undefined],
  ])('refuses the owner’s session sent %s and cancels nothing', async (_name, origin) => {
    const app = appWith({ k3Jd9: managed() });

    const response = await cancelWithSession(app, 'ana', origin);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: { code: 'FORBIDDEN', message: 'The session cannot be used from this origin' },
    });
    expect(await statusAfter(app)).toBe(200);
  });

  it('answers 410 with the title to any token on an event cancelled before', async () => {
    const app = appWith({ k3Jd9: { status: 'cancelled', title: 'Cena de verano' } });

    const response = await cancel(app, otherToken);

    expect(response.status).toBe(410);
    expect(response.body).toEqual(cancelledAnswer);
  });
});

describe('PATCH /api/events/:id/deadline', () => {
  const changeDeadline = (
    app: ReturnType<typeof appWith>,
    body: object | string,
    // `null` sends no token at all.
    { managementToken = token }: { managementToken?: string | null } = {},
  ) => {
    const sent = request(app)
      .patch('/api/events/k3Jd9/deadline')
      .set('Content-Type', 'application/json')
      .send(typeof body === 'string' ? body : JSON.stringify(body));
    return managementToken === null ? sent : sent.set('X-Management-Token', managementToken);
  };

  const eventIn = async (app: ReturnType<typeof appWith>) =>
    (await manage(app, 'k3Jd9', token)).body as ManagedEvent;

  const votingClosedSent = {
    emails: [
      { type: 'summary', status: 'sent', sentAt: new Date('2026-06-15T08:00:05Z') },
      { type: 'voting-closed', status: 'sent', sentAt: new Date('2026-07-01T22:01:00Z') },
    ],
  } satisfies Partial<StoredManagedEvent>;

  it('moves the deadline of an open event later, and answers the managed event', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await changeDeadline(app, { deadline: '2026-07-03' });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      title: 'Cena de verano',
      timeZone: 'Europe/Madrid',
      deadline: '2026-07-03',
      state: 'open',
      options: [july6, july10],
      confirmedOption: null,
      voters: 2,
      recommendedOptionIds: [july10.id],
      participationId: 'k3Jd9',
      resultsId: 'Qw7p2',
      emails: [
        { type: 'summary', status: 'sent', sentAt: '2026-06-15T08:00:05.000Z' },
        { type: 'voting-closed', status: 'scheduled' },
      ],
    } satisfies ManagedEvent);
    expect(await eventIn(app)).toMatchObject({ deadline: '2026-07-03', state: 'open' });
  });

  it('moves it earlier, to hurry the group, down to today in the event’s time zone', async () => {
    // Ten past midnight on 15 June in Madrid, still the 14th in UTC.
    const app = appWith({ k3Jd9: managed() }, '2026-06-14T22:10:00Z');

    const yesterday = await changeDeadline(app, { deadline: '2026-06-14' });
    const response = await changeDeadline(app, { deadline: '2026-06-15' });

    expect(yesterday.status).toBe(400);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ deadline: '2026-06-15', state: 'open' });
  });

  it.each([
    ['by its deadline', {}, afterDeadline],
    ['early', { state: 'closed' }, beforeDeadline],
  ] as const)(
    'reopens voting closed %s, and the "voting closed" email waits for the new closing',
    async (_name, event, at) => {
      const app = appWith({ k3Jd9: managed({ ...event, ...votingClosedSent }) }, at);

      const response = await changeDeadline(app, { deadline: '2026-07-05' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        deadline: '2026-07-05',
        state: 'open',
        emails: [
          { type: 'summary', status: 'sent' },
          { type: 'voting-closed', status: 'scheduled' },
        ],
      });
    },
  );

  it.each([
    ['a day before today', '2026-06-14', 'DEADLINE_PAST'],
    ['a day beyond the twelve months', '2027-06-16', 'DEADLINE_TOO_FAR'],
  ])('refuses %s with 400, changing nothing', async (_name, deadline, code) => {
    const app = appWith({ k3Jd9: managed() });

    const response = await changeDeadline(app, { deadline });

    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The deadline cannot be chosen',
        details: [{ code }],
      },
    });
    expect(await eventIn(app)).toMatchObject({ deadline: '2026-07-01' });
  });

  it('refuses a confirmed event with 409 ALREADY_CONFIRMED before judging the day', async () => {
    const app = appWith({ k3Jd9: managed({ state: 'confirmed', confirmedOption: july10 }) });

    const response = await changeDeadline(app, { deadline: '2026-06-14' });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: 'ALREADY_CONFIRMED' } });
    expect(await eventIn(app)).toMatchObject({ deadline: '2026-07-01', state: 'confirmed' });
  });

  it.each([
    ['a day that does not exist', { deadline: '2026-07-32' }],
    ['no deadline', {}],
    ['a field the API does not take', { deadline: '2026-07-03', timeZone: 'Europe/London' }],
  ])('answers 400 to %s, naming the body, and changes nothing', async (_name, body) => {
    const app = appWith({ k3Jd9: managed() });

    const response = await changeDeadline(app, body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_FAILED', details: [{ code: 'INVALID_FIELD', in: 'body' }] },
    });
    expect(await eventIn(app)).toMatchObject({ deadline: '2026-07-01' });
  });

  it('answers 401 without a credential and changes nothing', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await changeDeadline(
      app,
      { deadline: '2026-07-03' },
      { managementToken: null },
    );

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    expect(await eventIn(app)).toMatchObject({ deadline: '2026-07-01' });
  });

  it('answers 403 to a wrong token and changes nothing', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await changeDeadline(
      app,
      { deadline: '2026-07-03' },
      { managementToken: otherToken },
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(await eventIn(app)).toMatchObject({ deadline: '2026-07-01' });
  });

  it('changes it with the owner’s session sent from a page of qando, never from another site', async () => {
    const app = appWith({ k3Jd9: managed() });
    const withSession = (deadline: string, origin: string) =>
      changeDeadline(app, { deadline }, { managementToken: null })
        .set('Cookie', sessionOf('ana'))
        .set('Origin', origin);

    const refused = await withSession('2026-07-05', 'https://evil.test');
    const changed = await withSession('2026-07-03', testTrustedOrigin);

    expect(refused.status).toBe(403);
    expect(changed.status).toBe(200);
    expect(await eventIn(app)).toMatchObject({ deadline: '2026-07-03' });
  });

  it('answers 410 with the title of a cancelled event', async () => {
    const app = appWith({ k3Jd9: { status: 'cancelled', title: 'Cena de verano' } });

    const response = await changeDeadline(app, { deadline: '2026-07-03' });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });

  it('answers 403 when the event is gone since the check and yet not cancelled', async () => {
    const response = await changeDeadline(goneSinceTheCheck(), { deadline: '2026-07-03' });

    expect(response.status).toBe(403);
  });

  it('answers 410 with the title when another request cancelled it since the check', async () => {
    const response = await changeDeadline(cancelledSinceTheCheck(), { deadline: '2026-07-03' });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });

  it('answers 410 with the title when another request cancelled it once the deadline was stored', async () => {
    const response = await changeDeadline(cancelledSinceTheCheck({ before: 'event' }), {
      deadline: '2026-07-03',
    });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });
});

describe('POST /api/events/:id/close', () => {
  const close = (
    app: ReturnType<typeof appWith>,
    // `null` sends no token at all.
    { managementToken = token }: { managementToken?: string | null } = {},
  ) => {
    const sent = request(app).post('/api/events/k3Jd9/close');
    return managementToken === null ? sent : sent.set('X-Management-Token', managementToken);
  };

  const eventIn = async (app: ReturnType<typeof appWith>) =>
    (await manage(app, 'k3Jd9', token)).body as ManagedEvent;

  it('closes voting now, the deadline becoming today, and the "voting closed" email goes', async () => {
    // Ten past midnight on 15 June in Madrid, still the 14th in UTC.
    const app = appWith(
      { k3Jd9: managed({ emails: [{ type: 'voting-closed', status: 'pending' }] }) },
      '2026-06-14T22:10:00Z',
    );

    const response = await close(app);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      title: 'Cena de verano',
      timeZone: 'Europe/Madrid',
      deadline: '2026-06-15',
      state: 'closed',
      options: [july6, july10],
      confirmedOption: null,
      voters: 2,
      recommendedOptionIds: [july10.id],
      participationId: 'k3Jd9',
      resultsId: 'Qw7p2',
      emails: [{ type: 'voting-closed', status: 'pending' }],
    } satisfies ManagedEvent);
    expect(await eventIn(app)).toMatchObject({ deadline: '2026-06-15', state: 'closed' });
  });

  it.each([
    ['by its deadline', { deadline: '2026-07-01' }, afterDeadline],
    ['early', { state: 'closed', deadline: '2026-06-20' }, '2026-06-22T08:00:00Z'],
  ] as const)(
    'answers an event closed %s as the first time, changing nothing',
    async (_name, event, at) => {
      const sent = {
        emails: [
          { type: 'voting-closed', status: 'sent', sentAt: new Date('2026-06-20T22:01:00Z') },
        ],
      } satisfies Partial<StoredManagedEvent>;
      const app = appWith({ k3Jd9: managed({ ...event, ...sent }) }, at);

      const response = await close(app);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        deadline: event.deadline,
        state: 'closed',
        emails: [{ type: 'voting-closed', status: 'sent' }],
      });
    },
  );

  it('refuses a confirmed event with 409 ALREADY_CONFIRMED', async () => {
    const app = appWith({ k3Jd9: managed({ state: 'confirmed', confirmedOption: july10 }) });

    const response = await close(app);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: 'ALREADY_CONFIRMED' } });
    expect(await eventIn(app)).toMatchObject({ deadline: '2026-07-01', state: 'confirmed' });
  });

  it('answers 401 without a credential and closes nothing', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await close(app, { managementToken: null });

    expect(response.status).toBe(401);
    expect(await eventIn(app)).toMatchObject({ state: 'open' });
  });

  it('answers 403 to a wrong token and closes nothing', async () => {
    const app = appWith({ k3Jd9: managed() });

    const response = await close(app, { managementToken: otherToken });

    expect(response.status).toBe(403);
    expect(await eventIn(app)).toMatchObject({ state: 'open' });
  });

  it('closes with the owner’s session sent from a page of qando, never from another site', async () => {
    const app = appWith({ k3Jd9: managed() });
    const withSession = (origin: string) =>
      close(app, { managementToken: null }).set('Cookie', sessionOf('ana')).set('Origin', origin);

    const refused = await withSession('https://evil.test');
    expect(refused.status).toBe(403);
    expect(await eventIn(app)).toMatchObject({ state: 'open' });

    const closed = await withSession(testTrustedOrigin);
    expect(closed.status).toBe(200);
    expect(await eventIn(app)).toMatchObject({ state: 'closed' });
  });

  it('answers 410 with the title of a cancelled event', async () => {
    const app = appWith({ k3Jd9: { status: 'cancelled', title: 'Cena de verano' } });

    const response = await close(app);

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });

  it('answers 410 with the title when another request cancelled it since the check', async () => {
    const response = await close(cancelledSinceTheCheck());

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });

  it('answers 410 with the title when another request cancelled it once voting was closed', async () => {
    const response = await close(cancelledSinceTheCheck({ before: 'event' }));

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });
});

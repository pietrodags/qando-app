import type { ManagedEvent, Option } from '@qando/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { hashCapabilityToken } from '../../capability-token.js';
import { testDependencies, type TestManagedEvent } from '../../test/test-dependencies.js';
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
  event: { ...cena, ...event },
});

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
      Lm4Qa: { status: 'found', managementTokenHash: hashCapabilityToken(otherToken), event: cena },
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
      access: (id, tokenHash) => dependencies.managedEvents.access(id, tokenHash),
      event: () => Promise.resolve(undefined),
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
      access: (id, tokenHash) => Promise.reject(new Error(`no event ${id} for ${tokenHash}`)),
      event: () => Promise.reject(new Error('unreachable')),
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

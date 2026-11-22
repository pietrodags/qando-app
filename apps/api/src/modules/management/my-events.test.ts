import type { Option } from '@qando/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import {
  endedSession,
  testDependencies,
  testSessionCookie,
  type TestManagedEvent,
} from '../../test/test-dependencies.js';
import type { StoredManagedEvent } from './managed-events.js';

// "Cena de verano" closes at the end of 1 July in Madrid.
const beforeDeadline = new Date('2026-06-15T08:00:00Z');
const afterDeadline = new Date('2026-07-02T08:00:00Z');

const july10: Option = {
  id: '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c10',
  dates: { kind: 'single', date: '2026-07-10' },
  time: null,
};

const cena: StoredManagedEvent = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  state: 'open',
  closesAt: new Date('2026-07-01T21:59:59.999Z'),
  options: [july10],
  confirmedOption: null,
  participationId: 'k3Jd9',
  resultsId: 'Qw7p2',
  votes: [],
  emails: [],
};

const owned = (
  ownerId: string,
  createdAt: string,
  event: Partial<StoredManagedEvent>,
): TestManagedEvent => ({
  status: 'found',
  managementTokenHash: `hash of ${event.title ?? cena.title}`,
  ownerId,
  createdAt: new Date(createdAt),
  event: { ...cena, ...event },
});

const stored: Record<string, TestManagedEvent> = {
  k3Jd9: owned('ana', '2026-06-10T18:05:12.345Z', {}),
  Re0YV: owned('ana', '2026-06-14T09:30:00Z', {
    title: 'Excursión',
    deadline: '2026-07-20',
    closesAt: new Date('2026-07-20T21:59:59.999Z'),
    participationId: 'Re0YV',
  }),
  Bp4Lk: owned('bea', '2026-06-12T12:00:00Z', { title: 'Partido', participationId: 'Bp4Lk' }),
  Zk2Wq: owned('ana', '2026-06-01T07:00:00Z', {
    title: 'Café',
    state: 'confirmed',
    confirmedOption: july10,
    participationId: 'Zk2Wq',
  }),
  Xc7Tt: { status: 'cancelled', title: 'Cumpleaños' },
};

const myEvents = (cookie: string | undefined, now = beforeDeadline) => {
  const sent = request(createApp(testDependencies({ managedEvents: stored, now }))).get(
    '/api/me/events',
  );
  return cookie === undefined ? sent : sent.set('Cookie', cookie);
};

/** The cookie of a session signed in as the account (`testSessions`). */
const sessionOf = (accountId: string) => `${testSessionCookie}=${accountId}`;

describe('GET /api/me/events', () => {
  it('answers the events of the signed-in account, newest first, never cached', async () => {
    const response = await myEvents(sessionOf('ana'));

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual([
      {
        id: 'Re0YV',
        title: 'Excursión',
        state: 'open',
        deadline: '2026-07-20',
        createdAt: '2026-06-14T09:30:00.000Z',
      },
      {
        id: 'k3Jd9',
        title: 'Cena de verano',
        state: 'open',
        deadline: '2026-07-01',
        createdAt: '2026-06-10T18:05:12.345Z',
      },
      {
        id: 'Zk2Wq',
        title: 'Café',
        state: 'confirmed',
        deadline: '2026-07-01',
        createdAt: '2026-06-01T07:00:00.000Z',
      },
    ]);
  });

  it('answers each event’s state at the time of the request: closed once its deadline has passed', async () => {
    const response = await myEvents(sessionOf('ana'), afterDeadline);

    expect(response.status).toBe(200);
    expect(
      (response.body as { title: string; state: string }[]).map(({ title, state }) => [
        title,
        state,
      ]),
    ).toEqual([
      ['Excursión', 'open'],
      ['Cena de verano', 'closed'],
      ['Café', 'confirmed'],
    ]);
  });

  it('answers an empty list to an account without events', async () => {
    const response = await myEvents(sessionOf('carla'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it.each([
    ['no session cookie', undefined],
    ['a session that has ended', sessionOf(endedSession)],
  ])('answers 401 to a request with %s, never cached', async (_name, cookie) => {
    const response = await myEvents(cookie);

    expect(response.status).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'This request needs a session', details: [] },
    });
  });
});

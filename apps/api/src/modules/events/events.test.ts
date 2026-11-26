import type { EventCreated } from '@qando/contracts';
import { closingInstant, type NewEvent } from '@qando/domain';
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
import type { NewEvents } from './create-event.js';

// 10:00 in Madrid on 15 June 2026.
const morning = new Date('2026-06-15T08:00:00Z');

const links: EventCreated = {
  participationId: 'uHuaiU4BzZfa7oUR2OC3QQ',
  resultsId: 'Re0YVYWmRfkSlDvhAzL-Yw',
};

/** The management token the page created for the event. */
const token = 'Zx81aB2cD4eF6gH8iJ0kLm';

const wholeDay = (date: string) => ({ dates: { kind: 'single', date }, time: null }) as const;

const cena = {
  title: 'Cena de verano',
  organizerName: 'Ana',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  anonymous: false,
  options: [wholeDay('2026-07-10'), wholeDay('2026-07-06')],
};

/** The events the app asked to store, by owner and token, answering `answer` for each. */
function recordingNewEvents(answer: EventCreated | 'taken' = links) {
  const created: { ownerId: string; managementToken: string; event: NewEvent }[] = [];
  const newEvents: NewEvents = {
    create: (ownerId, managementToken, event) => {
      created.push({ ownerId, managementToken, event });
      return Promise.resolve(answer);
    },
    createOnce: () => Promise.reject(new Error('The page always sends a token')),
    lastOrganizerName: () => Promise.reject(new Error('No name is looked up by the route')),
  };
  return { created, newEvents };
}

function appWith(newEvents: NewEvents, logError = testDependencies().logError) {
  return createApp({ ...testDependencies({ now: morning }), newEvents, logError });
}

const sessionOf = (accountId: string) => `${testSessionCookie}=${accountId}`;

/** A request as qando's page sends it: signed in as `ana`, from qando's origin, with the token. */
const create = (newEvents: NewEvents, body: unknown) =>
  request(appWith(newEvents))
    .post('/api/events')
    .set('Cookie', sessionOf('ana'))
    .set('Origin', testTrustedOrigin)
    .set('X-Management-Token', token)
    .send(body as object);

describe('POST /api/events', () => {
  it('stores the event as the domain checked it, owned by the session’s account with the page’s token, and answers its links', async () => {
    const { created, newEvents } = recordingNewEvents();

    const response = await create(newEvents, { ...cena, title: ' Cena de verano ', note: ' Ok ' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(links);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(created).toEqual([
      {
        ownerId: 'ana',
        managementToken: token,
        event: {
          organizerName: 'Ana',
          title: 'Cena de verano',
          note: 'Ok',
          timeZone: 'Europe/Madrid',
          deadline: '2026-07-01',
          closesAt: closingInstant('2026-07-01', 'Europe/Madrid'),
          anonymous: false,
          options: [wholeDay('2026-07-06'), wholeDay('2026-07-10')],
        },
      },
    ]);
  });

  it('refuses a request without a session, or with one that ended, before reading its body', async () => {
    const { created, newEvents } = recordingNewEvents();
    const app = appWith(newEvents);

    const without = await request(app)
      .post('/api/events')
      .set('Origin', testTrustedOrigin)
      .send(cena);
    // Neither a body that is not JSON nor one too large is read without a session.
    const broken = await request(app)
      .post('/api/events')
      .set('Origin', testTrustedOrigin)
      .set('Content-Type', 'application/json')
      .send('{"title":');
    const ended = await request(app)
      .post('/api/events')
      .set('Cookie', sessionOf(endedSession))
      .set('Origin', testTrustedOrigin)
      .set('Content-Type', 'application/json')
      .send(`${JSON.stringify(cena)}${' '.repeat(17_000)}`);

    for (const response of [without, broken, ended]) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'This request needs a session',
          details: [],
        },
      });
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(created).toEqual([]);
  });

  it('refuses a request without the management token, or with one of another shape, naming the header', async () => {
    const { created, newEvents } = recordingNewEvents();
    const app = appWith(newEvents);
    const send = (headers: Record<string, string>) =>
      request(app)
        .post('/api/events')
        .set({ Cookie: sessionOf('ana'), Origin: testTrustedOrigin, ...headers })
        .send({ ...cena, timeZone: 'Europe/Atlantis' });

    for (const response of [await send({}), await send({ 'X-Management-Token': 'short' })]) {
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request breaks the contract',
          details: [
            { code: 'INVALID_FIELD', in: 'header', path: ['x-management-token'] },
            { code: 'INVALID_FIELD', in: 'body', path: ['timeZone'] },
          ],
        },
      });
    }
    expect(created).toEqual([]);
  });

  it('refuses a management token that holds an event of another account, without saying whose', async () => {
    const { newEvents } = recordingNewEvents('taken');

    const response = await create(newEvents, cena);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The event was rejected',
        details: [{ code: 'MANAGEMENT_TOKEN_TAKEN' }],
      },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('refuses the session sent from a page of another site, or without Origin', async () => {
    const { created, newEvents } = recordingNewEvents();
    const app = appWith(newEvents);

    const foreign = await request(app)
      .post('/api/events')
      .set('Cookie', sessionOf('ana'))
      .set('Origin', 'https://elsewhere.example')
      .send(cena);
    const unsaid = await request(app)
      .post('/api/events')
      .set('Cookie', sessionOf('ana'))
      .send(cena);

    expect(foreign.status).toBe(403);
    expect(unsaid.status).toBe(403);
    expect(foreign.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(created).toEqual([]);
  });

  it('refuses an event that breaks a rule with every problem, an option’s by its place as sent', async () => {
    const { created, newEvents } = recordingNewEvents();

    const response = await create(newEvents, {
      ...cena,
      organizerName: 'A',
      deadline: '2026-06-14',
      options: [wholeDay('2026-07-06'), wholeDay('2026-06-14')],
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The event was rejected',
        details: [
          { code: 'NAME_TOO_SHORT' },
          { code: 'DATE_PAST', index: 1 },
          { code: 'DEADLINE_PAST' },
        ],
      },
    });
    expect(created).toEqual([]);
  });

  it('takes today from the clock in the event’s time zone', async () => {
    const { created, newEvents } = recordingNewEvents();
    const options = [wholeDay('2026-06-14')];

    const madrid = await create(newEvents, { ...cena, options });
    const pacific = await create(newEvents, {
      ...cena,
      timeZone: 'Pacific/Pago_Pago',
      deadline: '2026-06-14',
      options,
    });

    expect(madrid.status).toBe(400);
    // 10:00 in Madrid is 21:00 of the 14th in Pago Pago (UTC−11).
    expect(pacific.status).toBe(201);
    expect(created).toHaveLength(1);
  });

  it('refuses a body that breaks the contract, naming the part', async () => {
    const { created, newEvents } = recordingNewEvents();

    const response = await create(newEvents, { ...cena, timeZone: 'Europe/Atlantis' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        details: [{ code: 'INVALID_FIELD', in: 'body', path: ['timeZone'] }],
      },
    });
    expect(created).toEqual([]);
  });

  it('refuses a body that is not JSON', async () => {
    const { created, newEvents } = recordingNewEvents();

    const response = await request(appWith(newEvents))
      .post('/api/events')
      .set('Cookie', sessionOf('ana'))
      .set('Origin', testTrustedOrigin)
      .set('Content-Type', 'application/json')
      .send('{"title":');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(created).toEqual([]);
  });

  it('reads no body larger than an event of sixty options needs', async () => {
    const { created, newEvents } = recordingNewEvents();

    // A valid event padded with spaces, which JSON allows: only its size is refused.
    const padded = `${JSON.stringify(cena)}${' '.repeat(17_000)}`;

    const response = await request(appWith(newEvents))
      .post('/api/events')
      .set('Cookie', sessionOf('ana'))
      .set('Origin', testTrustedOrigin)
      .set('Content-Type', 'application/json')
      .send(padded);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'The request is malformed', details: [] },
    });
    expect(created).toEqual([]);
  });

  it('answers 500 and logs the failure when the event cannot be stored', async () => {
    const logged: ErrorLogEntry[] = [];
    const failing: NewEvents = {
      create: () => Promise.reject(new Error('connection lost')),
      createOnce: () => Promise.reject(new Error('The page always sends a token')),
      lastOrganizerName: () => Promise.reject(new Error('No name is looked up by the route')),
    };

    const response = await request(appWith(failing, (entry) => logged.push(entry)))
      .post('/api/events')
      .set('Cookie', sessionOf('ana'))
      .set('Origin', testTrustedOrigin)
      .set('X-Management-Token', token)
      .send(cena);

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(logged).toHaveLength(1);
  });
});

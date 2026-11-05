import { createHash } from 'node:crypto';
import type { Option } from '@qando/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import type { ErrorLogEntry } from '../../http/error-boundary.js';
import { testDependencies, type TestParticipation } from '../../test/test-dependencies.js';
import type { PublicEventLookup, StoredPublicEvent } from '../public-events/public-events.js';

// "Cena de verano" closes at the end of 1 July in Madrid and offers 6 and 10 July.
const closesAt = new Date('2026-07-01T21:59:59.999Z');
const july6Id = '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11';
const july10Id = '5d1e8a90-7c3b-4e2f-8a61-2b9c0d4e6f73';
const option = (id: string, date: string): Option => ({
  id,
  dates: { kind: 'single', date },
  time: null,
});

const cena: StoredPublicEvent = {
  title: 'Cena de verano',
  organizerName: 'Ana',
  note: null,
  deadline: '2026-07-01',
  timeZone: 'Europe/Madrid',
  anonymous: false,
  state: 'open',
  closesAt,
  options: [option(july6Id, '2026-07-06'), option(july10Id, '2026-07-10')],
  confirmedOption: null,
};

const luisToken = 'kQ7vZ2xT9bLm4Np0Rs8wYA';
const evaToken = 'Zx81pQ0aLm3Nv7Rt5Ws2Yb';
const luisVote = { name: '  Luis ', votes: { [july6Id]: 'available', [july10Id]: 'preferred' } };

function setUp(
  events: Record<string, PublicEventLookup> = { k3P9x: { status: 'found', event: cena } },
  now = '2026-06-15T08:00:00Z',
) {
  const participations: TestParticipation[] = [];
  const app = createApp(
    testDependencies({ publicEvents: events, participations, now: new Date(now) }),
  );
  const vote = (body: unknown, token: string | null = luisToken, publicId = 'k3P9x') => {
    const sent = request(app).post(`/api/public/events/${publicId}/participations`);
    return (token === null ? sent : sent.set('X-Vote-Token', token)).send(body as object);
  };
  return { app, participations, vote };
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe('POST /api/public/events/:id/participations', () => {
  it('stores the vote with the trimmed name and answers its ID', async () => {
    const { participations, vote } = setUp();

    const response = await vote(luisVote);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ participationId: participations[0]?.id });
    expect(participations).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
        eventId: 'k3P9x',
        name: 'Luis',
        tokenHash: sha256(luisToken),
        votes: { [july6Id]: 'available', [july10Id]: 'preferred' },
      },
    ]);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('stores only the hash of the token', async () => {
    const { participations, vote } = setUp();

    await vote(luisVote);

    expect(JSON.stringify(participations)).not.toContain(luisToken);
  });

  it('stores no name on an anonymous event', async () => {
    const { participations, vote } = setUp({
      k3P9x: { status: 'found', event: { ...cena, anonymous: true } },
    });

    const response = await vote({ votes: luisVote.votes });

    expect(response.status).toBe(201);
    expect(participations[0]?.name).toBeNull();
  });

  it('stores one vote per token: sending it again answers the first vote', async () => {
    const { participations, vote } = setUp();

    const first = await vote(luisVote);
    const again = await vote(luisVote);

    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(participations).toHaveLength(1);
  });

  it('keeps the first vote when the same token comes with other answers', async () => {
    const { participations, vote } = setUp();

    await vote(luisVote);
    const again = await vote({ name: 'Luisa', votes: { [july6Id]: 'unavailable' } });

    expect(again.status).toBe(201);
    expect(participations).toHaveLength(1);
    expect(participations[0]).toMatchObject({ name: 'Luis', votes: luisVote.votes });
  });

  it('answers the first vote even after voting closed', async () => {
    const participations: TestParticipation[] = [];
    const events = { k3P9x: { status: 'found', event: cena } } as const;
    const at = (now: string) =>
      createApp(testDependencies({ publicEvents: events, participations, now: new Date(now) }));
    const send = (now: string) =>
      request(at(now))
        .post('/api/public/events/k3P9x/participations')
        .set('X-Vote-Token', luisToken)
        .send(luisVote);

    const first = await send('2026-07-01T21:59:59Z');
    const again = await send('2026-07-02T08:00:00Z');

    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
  });

  it('stores a vote per token', async () => {
    const { participations, vote } = setUp();

    await vote(luisVote);
    await vote({ ...luisVote, name: 'Eva' }, evaToken);

    expect(participations.map((stored) => stored.name)).toEqual(['Luis', 'Eva']);
  });

  it('refuses a token that already holds a vote of another event', async () => {
    const { participations, vote } = setUp({
      k3P9x: { status: 'found', event: cena },
      z8Lm2: { status: 'found', event: { ...cena, title: 'Comida de equipo' } },
    });
    await vote(luisVote, luisToken, 'z8Lm2');

    const response = await vote(luisVote, luisToken, 'k3P9x');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The vote was rejected',
        details: [{ code: 'VOTE_TOKEN_TAKEN' }],
      },
    });
    expect(participations.map((stored) => stored.eventId)).toEqual(['z8Lm2']);
  });

  it('lists every problem of the vote and stores nothing', async () => {
    const { participations, vote } = setUp();

    const response = await vote({
      name: ' A ',
      votes: { [july6Id]: 'preferred', other: 'preferred' },
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The vote was rejected',
        details: [
          { code: 'NAME_TOO_SHORT' },
          { code: 'OPTION_MISSING', optionId: july10Id },
          { code: 'OPTION_UNKNOWN', optionId: 'other' },
          { code: 'SEVERAL_PREFERRED', optionIds: [july6Id, 'other'] },
        ],
      },
    });
    expect(participations).toEqual([]);
  });

  it('refuses a name on an anonymous event', async () => {
    const { vote } = setUp({ k3P9x: { status: 'found', event: { ...cena, anonymous: true } } });

    const response = await vote(luisVote);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { details: [{ code: 'NAME_NOT_ALLOWED' }] } });
  });

  it('names the fields that break the contract, without their values', async () => {
    const { participations, vote } = setUp();

    const response = await vote({ name: 'Luis', votes: { [july6Id]: 'maybe' } }, 'short');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request breaks the contract',
        details: [
          { code: 'INVALID_FIELD', in: 'header', path: ['x-vote-token'] },
          { code: 'INVALID_FIELD', in: 'body', path: ['votes', july6Id] },
        ],
      },
    });
    expect(response.text).not.toContain('maybe');
    expect(participations).toEqual([]);
  });

  it('requires the token', async () => {
    const { vote } = setUp();

    const response = await vote(luisVote, null);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { details: [{ code: 'INVALID_FIELD', in: 'header', path: ['x-vote-token'] }] },
    });
  });

  it('requires a JSON body', async () => {
    const { app } = setUp();

    const response = await request(app)
      .post('/api/public/events/k3P9x/participations')
      .set('X-Vote-Token', luisToken)
      .type('text/plain')
      .send('Luis');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { details: [{ code: 'INVALID_FIELD', in: 'body', path: [] }] },
    });
  });

  it('answers 400 to a body that is not valid JSON', async () => {
    const { app } = setUp();

    const response = await request(app)
      .post('/api/public/events/k3P9x/participations')
      .set('X-Vote-Token', luisToken)
      .type('application/json')
      .send('{"name": "Luis"');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('answers 400 to a body far larger than any vote, without reading it', async () => {
    const { app } = setUp();

    const response = await request(app)
      .post('/api/public/events/k3P9x/participations')
      .set('X-Vote-Token', luisToken)
      .send({ name: 'x'.repeat(64 * 1024), votes: luisVote.votes });

    expect(response.status).toBe(400);
    // Refused before the name is read, which would answer NAME_TOO_LONG.
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED', details: [] } });
  });

  it.each([
    ['the deadline has passed', cena, '2026-07-01T22:00:00Z'],
    ['the organizer closed voting', { ...cena, state: 'closed' as const }, '2026-06-15T08:00:00Z'],
    ['a date is confirmed', { ...cena, state: 'confirmed' as const }, '2026-06-15T08:00:00Z'],
  ])('answers 409 VOTING_CLOSED when %s, and stores nothing', async (_case, event, now) => {
    const { participations, vote } = setUp({ k3P9x: { status: 'found', event } }, now);

    const response = await vote(luisVote);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: 'VOTING_CLOSED', message: 'Voting is closed', details: [] },
    });
    expect(participations).toEqual([]);
  });

  it('takes votes until the last instant of the deadline', async () => {
    const { vote } = setUp(undefined, '2026-07-01T21:59:59.998Z');

    expect((await vote(luisVote)).status).toBe(201);
  });

  it('answers 410 with the title of a cancelled event', async () => {
    const { vote } = setUp({ k3P9x: { status: 'cancelled', title: 'Cena de verano' } });

    const response = await vote(luisVote);

    expect(response.status).toBe(410);
    expect(response.body).toEqual({
      error: {
        code: 'EVENT_CANCELLED',
        message: 'The event was cancelled',
        details: [],
        title: 'Cena de verano',
      },
    });
  });

  it('answers 404 for a link no event has', async () => {
    const { vote } = setUp();

    const response = await vote(luisVote, luisToken, 'unknown');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No event has this participation link', details: [] },
    });
  });

  it('answers 500 without the token or the vote when storing fails', async () => {
    const logged: ErrorLogEntry[] = [];
    const app = createApp({
      ...testDependencies({ publicEvents: { k3P9x: { status: 'found', event: cena } } }),
      participations: {
        transaction: () => Promise.reject(new Error(`insert failed for ${luisToken}, Luis`)),
      },
      logError: (entry) => logged.push(entry),
    });

    const response = await request(app)
      .post('/api/public/events/k3P9x/participations')
      .set('X-Vote-Token', luisToken)
      .send(luisVote);

    expect(response.status).toBe(500);
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged)).not.toContain(luisToken);
    expect(JSON.stringify(logged)).not.toContain('Luis');
    expect(logged[0]).toMatchObject({ route: '/api/public/events/:id/participations' });
  });
});

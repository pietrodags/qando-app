import { createHash } from 'node:crypto';
import type { Option } from '@qando/contracts';
import type { VoteState } from '@qando/domain';
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
const luisVote = {
  name: '  Luis ',
  votes: { [july6Id]: 'available', [july10Id]: 'preferred' } as Record<string, VoteState>,
};

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

  it('reads the clock once the event is locked, so a vote that waited past the deadline is closed', async () => {
    const participations: TestParticipation[] = [];
    const base = testDependencies({
      publicEvents: { k3P9x: { status: 'found', event: cena } },
      participations,
    });
    let now = new Date('2026-07-01T21:59:59Z');
    const app = createApp({
      ...base,
      now: () => now,
      participations: {
        transaction: (work) =>
          base.participations.transaction((ballot) =>
            work({
              ...ballot,
              // Waiting for the lock takes the request past the deadline.
              event: async (publicId) => {
                const lookup = await ballot.event(publicId);
                now = new Date('2026-07-01T22:00:01Z');
                return lookup;
              },
            }),
          ),
      },
    });

    const response = await request(app)
      .post('/api/public/events/k3P9x/participations')
      .set('X-Vote-Token', luisToken)
      .send(luisVote);

    expect(response.status).toBe(409);
    expect(participations).toEqual([]);
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

const forbidden = {
  error: { code: 'FORBIDDEN', message: 'The token holds no vote of this event', details: [] },
};

/** "Cena de verano" with Luis's vote stored, and a second event "Comida de equipo". */
function withLuisVote(event: StoredPublicEvent = cena, now?: string) {
  const comida = { ...cena, title: 'Comida de equipo' };
  const setup = setUp(
    { k3P9x: { status: 'found', event }, z8Lm2: { status: 'found', event: comida } },
    now,
  );
  setup.participations.push({
    id: '7a0f3c2e-1b4d-4e8f-9a6b-5c3d2e1f0a9b',
    eventId: 'k3P9x',
    name: 'Luis',
    tokenHash: sha256(luisToken),
    votes: luisVote.votes,
  });
  const mine = (token: string | null = luisToken, publicId = 'k3P9x') => {
    const sent = request(setup.app).get(`/api/public/events/${publicId}/participations/mine`);
    return token === null ? sent : sent.set('X-Vote-Token', token);
  };
  const edit = (body: unknown, token: string | null = luisToken, publicId = 'k3P9x') => {
    const sent = request(setup.app).put(`/api/public/events/${publicId}/participations/mine`);
    return (token === null ? sent : sent.set('X-Vote-Token', token)).send(body as object);
  };
  return { ...setup, mine, edit };
}

describe('GET /api/public/events/:id/participations/mine', () => {
  it('answers the name and the states stored under the token', async () => {
    const { mine } = withLuisVote();

    const response = await mine();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: 'Luis', votes: luisVote.votes });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('answers no name on an anonymous event', async () => {
    const { participations, mine } = withLuisVote({ ...cena, anonymous: true });
    participations[0] = { ...participations[0]!, name: null };

    const response = await mine();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ votes: luisVote.votes });
  });

  it.each([
    ['the deadline has passed', cena, '2026-07-02T08:00:00Z'],
    ['a date is confirmed', { ...cena, state: 'confirmed' as const }, undefined],
  ])('answers the vote even when %s', async (_case, event, now) => {
    const { mine } = withLuisVote(event, now);

    const response = await mine();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: 'Luis', votes: luisVote.votes });
  });

  it('answers 403 to a token that holds no vote', async () => {
    const { mine } = withLuisVote();

    const response = await mine(evaToken);

    expect(response.status).toBe(403);
    expect(response.body).toEqual(forbidden);
  });

  it('answers 403 to a token of a vote of another event, without that vote', async () => {
    const { mine } = withLuisVote();

    const response = await mine(luisToken, 'z8Lm2');

    expect(response.status).toBe(403);
    expect(response.text).not.toContain('Luis');
  });

  it('answers 400 to a missing or malformed token', async () => {
    const { mine } = withLuisVote();

    for (const token of [null, 'short']) {
      const response = await mine(token);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request breaks the contract',
          details: [{ code: 'INVALID_FIELD', in: 'header', path: ['x-vote-token'] }],
        },
      });
    }
  });

  it('answers 410 with the title of a cancelled event, and 404 for an unknown link', async () => {
    const { app } = setUp({ k3P9x: { status: 'cancelled', title: 'Cena de verano' } });
    const mine = (publicId: string) =>
      request(app)
        .get(`/api/public/events/${publicId}/participations/mine`)
        .set('X-Vote-Token', luisToken);

    const cancelled = await mine('k3P9x');
    expect(cancelled.status).toBe(410);
    expect(cancelled.body).toEqual({
      error: {
        code: 'EVENT_CANCELLED',
        message: 'The event was cancelled',
        details: [],
        title: 'Cena de verano',
      },
    });
    const missing = await mine('unknown');
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('PUT /api/public/events/:id/participations/mine', () => {
  const edited = { name: ' Luisa ', votes: { [july6Id]: 'unavailable', [july10Id]: 'available' } };

  it('replaces the name and the states of the same vote, and answers what it stored', async () => {
    const { participations, edit } = withLuisVote();

    const response = await edit(edited);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: 'Luisa', votes: edited.votes });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(participations).toEqual([
      {
        id: '7a0f3c2e-1b4d-4e8f-9a6b-5c3d2e1f0a9b',
        eventId: 'k3P9x',
        name: 'Luisa',
        tokenHash: sha256(luisToken),
        votes: edited.votes,
      },
    ]);
  });

  it('keeps no name on an anonymous event', async () => {
    const { participations, edit } = withLuisVote({ ...cena, anonymous: true });
    participations[0] = { ...participations[0]!, name: null };

    const response = await edit({ votes: edited.votes });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ votes: edited.votes });
    expect(participations[0]).toMatchObject({ name: null, votes: edited.votes });
  });

  it('then reads back the edited vote', async () => {
    const { edit, mine } = withLuisVote();

    await edit(edited);

    expect((await mine()).body).toEqual({ name: 'Luisa', votes: edited.votes });
  });

  it.each([
    ['holds no vote', evaToken, 'k3P9x'],
    ['holds a vote of another event', luisToken, 'z8Lm2'],
  ])('answers 403 to a token that %s, and changes nothing', async (_case, token, publicId) => {
    const { participations, edit } = withLuisVote();

    const response = await edit(edited, token, publicId);

    expect(response.status).toBe(403);
    expect(response.body).toEqual(forbidden);
    expect(participations).toHaveLength(1);
    expect(participations[0]).toMatchObject({ name: 'Luis', votes: luisVote.votes });
  });

  it('lists every problem of the edit and changes nothing', async () => {
    const { participations, edit } = withLuisVote();

    const response = await edit({ name: 'A', votes: { [july6Id]: 'preferred' } });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The vote was rejected',
        details: [{ code: 'NAME_TOO_SHORT' }, { code: 'OPTION_MISSING', optionId: july10Id }],
      },
    });
    expect(participations[0]).toMatchObject({ name: 'Luis', votes: luisVote.votes });
  });

  it('names the fields that break the contract, without their values', async () => {
    const { edit } = withLuisVote();

    const response = await edit({ name: 'Luis', votes: { [july6Id]: 'maybe' } }, 'short');

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
  });

  it.each([
    ['the deadline has passed', cena, '2026-07-01T22:00:00Z'],
    ['the organizer closed voting', { ...cena, state: 'closed' as const }, undefined],
    ['a date is confirmed', { ...cena, state: 'confirmed' as const }, undefined],
  ])('answers 409 VOTING_CLOSED when %s, and changes nothing', async (_case, event, now) => {
    const { participations, edit } = withLuisVote(event, now);

    const response = await edit(edited);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: 'VOTING_CLOSED', message: 'Voting is closed', details: [] },
    });
    expect(participations[0]).toMatchObject({ name: 'Luis', votes: luisVote.votes });
  });

  it('checks the token before the deadline: a stranger learns nothing about the event', async () => {
    const { edit } = withLuisVote(cena, '2026-07-02T08:00:00Z');

    expect((await edit(edited, evaToken)).status).toBe(403);
  });

  it('reads the clock once the event is locked, so an edit that waited past the deadline is closed', async () => {
    const { participations } = withLuisVote();
    const base = testDependencies({
      publicEvents: { k3P9x: { status: 'found', event: cena } },
      participations,
    });
    let now = new Date('2026-07-01T21:59:59Z');
    const app = createApp({
      ...base,
      now: () => now,
      participations: {
        transaction: (work) =>
          base.participations.transaction((ballot) =>
            work({
              ...ballot,
              event: async (publicId) => {
                const lookup = await ballot.event(publicId);
                now = new Date('2026-07-01T22:00:01Z');
                return lookup;
              },
            }),
          ),
      },
    });

    const response = await request(app)
      .put('/api/public/events/k3P9x/participations/mine')
      .set('X-Vote-Token', luisToken)
      .send(edited);

    expect(response.status).toBe(409);
    expect(participations[0]).toMatchObject({ name: 'Luis' });
  });

  it('answers 410 with the title of a cancelled event, and 404 for an unknown link', async () => {
    const { app } = setUp({ k3P9x: { status: 'cancelled', title: 'Cena de verano' } });
    const edit = (publicId: string) =>
      request(app)
        .put(`/api/public/events/${publicId}/participations/mine`)
        .set('X-Vote-Token', luisToken)
        .send(edited);

    const cancelled = await edit('k3P9x');
    expect(cancelled.status).toBe(410);
    expect(cancelled.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
    expect((await edit('unknown')).status).toBe(404);
  });

  it('answers 400 to a body far larger than any vote, without reading it', async () => {
    const { edit } = withLuisVote();

    const response = await edit({ name: 'x'.repeat(64 * 1024), votes: edited.votes });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED', details: [] } });
  });
});

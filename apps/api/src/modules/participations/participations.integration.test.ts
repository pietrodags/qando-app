import type { VoteCast } from '@qando/contracts';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { hashCapabilityToken } from '../../capability-token.js';
import { createDatabase, type Database } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { cancelledEvents, events, options, participations, votes } from '../../db/schema.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { storeUser } from '../../test/stored-user.js';
import { testDependencies } from '../../test/test-dependencies.js';
import { createParticipations } from './participations-repository.js';

// "Cena de verano": deadline 1 July in Madrid, so voting closes at 21:59:59.999 UTC that day.
const closesAt = new Date('2026-07-01T21:59:59.999Z');
const beforeDeadline = new Date('2026-06-15T08:00:00Z');
const afterDeadline = new Date('2026-07-02T08:00:00Z');

describe('participations against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: Database;

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    db = createDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  const token = () => randomBytes(16).toString('base64url');

  const app = (now = beforeDeadline) =>
    createApp({
      ...testDependencies(),
      participations: createParticipations(db),
      now: () => now,
    });

  const vote = (publicId: string, voteToken: string, body: unknown, now = beforeDeadline) =>
    request(app(now))
      .post(`/api/public/events/${publicId}/participations`)
      .set('X-Vote-Token', voteToken)
      .send(body as object);

  /** Stores "Cena de verano" with 6 and 10 July. */
  async function storeCena(values: Partial<typeof events.$inferInsert> = {}) {
    const [event] = await db
      .insert(events)
      .values({
        ownerId: await storeUser(db),
        publicId: token(),
        resultsId: token(),
        managementTokenHash: token(),
        organizerName: 'Ana',
        organizerEmail: 'ana@example.com',
        title: 'Cena de verano',
        timeZone: 'Europe/Madrid',
        deadline: '2026-07-01',
        closesAt,
        anonymous: false,
        ...values,
      })
      .returning();
    const [july6, july10] = await db
      .insert(options)
      .values([
        { eventId: event!.id, position: 0, startDate: '2026-07-06' },
        { eventId: event!.id, position: 1, startDate: '2026-07-10' },
      ])
      .returning();
    return { event: event!, july6: july6!, july10: july10! };
  }

  const storedVotesOf = (eventId: string) =>
    db.query.participations.findMany({
      where: eq(participations.eventId, eventId),
      columns: { id: true, name: true, editTokenHash: true },
      with: { votes: { columns: { optionId: true, state: true } } },
    });

  it('stores a valid vote in one participation with one state per option', async () => {
    const { event, july6, july10 } = await storeCena();
    const luis = token();

    const response = await vote(event.publicId, luis, {
      name: ' Luis ',
      votes: { [july6.id]: 'available', [july10.id]: 'preferred' },
    });

    expect(response.status).toBe(201);
    const stored = await storedVotesOf(event.id);
    expect(stored).toEqual([
      {
        id: (response.body as VoteCast).participationId,
        name: 'Luis',
        editTokenHash: hashCapabilityToken(luis),
        votes: expect.arrayContaining([
          { optionId: july6.id, state: 'available' },
          { optionId: july10.id, state: 'preferred' },
        ]) as unknown,
      },
    ]);
    expect(stored[0]?.votes).toHaveLength(2);
  });

  it('stores no name on an anonymous event', async () => {
    const { event, july6, july10 } = await storeCena({ anonymous: true });

    const response = await vote(event.publicId, token(), {
      votes: { [july6.id]: 'unavailable', [july10.id]: 'available' },
    });

    expect(response.status).toBe(201);
    expect((await storedVotesOf(event.id))[0]?.name).toBeNull();
  });

  it('stores one vote when the same send arrives twice, one after the other', async () => {
    const { event, july6, july10 } = await storeCena();
    const luis = token();
    const body = { name: 'Luis', votes: { [july6.id]: 'available', [july10.id]: 'available' } };

    const first = await vote(event.publicId, luis, body);
    const again = await vote(event.publicId, luis, body);

    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(await storedVotesOf(event.id)).toHaveLength(1);
  });

  it('stores one vote when the same send arrives twice at once', async () => {
    const { event, july6, july10 } = await storeCena();
    const luis = token();
    const body = { name: 'Luis', votes: { [july6.id]: 'available', [july10.id]: 'available' } };

    const answers = await Promise.all([
      vote(event.publicId, luis, body),
      vote(event.publicId, luis, body),
      vote(event.publicId, luis, body),
    ]);

    expect(answers.map((answer) => answer.status)).toEqual([201, 201, 201]);
    const ids = new Set(answers.map((answer) => (answer.body as VoteCast).participationId));
    expect(ids.size).toBe(1);
    expect(await storedVotesOf(event.id)).toHaveLength(1);
  });

  it('refuses the token of a vote of another event', async () => {
    const cena = await storeCena();
    const comida = await storeCena({ title: 'Comida de equipo' });
    const luis = token();
    await vote(cena.event.publicId, luis, {
      name: 'Luis',
      votes: { [cena.july6.id]: 'available', [cena.july10.id]: 'available' },
    });

    const response = await vote(comida.event.publicId, luis, {
      name: 'Luis',
      votes: { [comida.july6.id]: 'available', [comida.july10.id]: 'available' },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { details: [{ code: 'VOTE_TOKEN_TAKEN' }] } });
    expect(await storedVotesOf(comida.event.id)).toEqual([]);
  });

  it('refuses an option of another event with 400 and stores nothing', async () => {
    const cena = await storeCena();
    const comida = await storeCena({ title: 'Comida de equipo' });

    const response = await vote(cena.event.publicId, token(), {
      name: 'Luis',
      votes: { [cena.july6.id]: 'available', [comida.july10.id]: 'available' },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        details: [
          { code: 'OPTION_MISSING', optionId: cena.july10.id },
          { code: 'OPTION_UNKNOWN', optionId: comida.july10.id },
        ],
      },
    });
    expect(await storedVotesOf(cena.event.id)).toEqual([]);
  });

  it.each([
    ['the deadline has passed', {}, afterDeadline],
    ['the organizer closed voting', { state: 'closed' as const }, beforeDeadline],
    ['a date is confirmed', { state: 'confirmed' as const }, beforeDeadline],
  ])('rejects a vote when %s', async (_case, values, now) => {
    const { event, july6, july10 } = await storeCena(values);

    const response = await vote(
      event.publicId,
      token(),
      { name: 'Luis', votes: { [july6.id]: 'available', [july10.id]: 'available' } },
      now,
    );

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: 'VOTING_CLOSED' } });
    expect(await storedVotesOf(event.id)).toEqual([]);
  });

  it('answers the first vote to a send repeated after voting closed', async () => {
    const { event, july6, july10 } = await storeCena();
    const luis = token();
    const body = { name: 'Luis', votes: { [july6.id]: 'available', [july10.id]: 'available' } };

    const first = await vote(event.publicId, luis, body);
    const again = await vote(event.publicId, luis, body, afterDeadline);

    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
  });

  it('answers 410 on a cancelled event', async () => {
    const publicId = token();
    await db
      .insert(cancelledEvents)
      .values({ publicId, resultsId: token(), title: 'Cena de verano' });

    const response = await vote(publicId, token(), { name: 'Luis', votes: {} });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });

  it('answers 404 to a link no event has, or to the results link', async () => {
    const { event } = await storeCena();

    for (const publicId of [token(), event.resultsId]) {
      const response = await vote(publicId, token(), { name: 'Luis', votes: {} });
      expect(response.status).toBe(404);
    }
  });

  it('stores the participation and its states together, or neither', async () => {
    const { event, july6, july10 } = await storeCena();
    // A vote row the database refuses (a second preferred state) must undo its participation.
    const ballots = createParticipations(db);

    await expect(
      ballots.transaction((ballot) =>
        ballot.add(event.id, hashCapabilityToken(token()), {
          name: 'Luis',
          votes: { [july6.id]: 'preferred', [july10.id]: 'preferred' },
        }),
      ),
    ).rejects.toThrow();

    expect(await storedVotesOf(event.id)).toEqual([]);
    expect(await db.select().from(votes).where(eq(votes.eventId, event.id))).toEqual([]);
  });

  describe('my vote', () => {
    const mine = (publicId: string, voteToken: string) =>
      request(app())
        .get(`/api/public/events/${publicId}/participations/mine`)
        .set('X-Vote-Token', voteToken);

    const edit = (publicId: string, voteToken: string, body: unknown, now = beforeDeadline) =>
      request(app(now))
        .put(`/api/public/events/${publicId}/participations/mine`)
        .set('X-Vote-Token', voteToken)
        .send(body as object);

    /** "Cena de verano" with Luis available on 6 July and preferring 10 July. */
    async function withLuisVote(values: Partial<typeof events.$inferInsert> = {}) {
      const cena = await storeCena(values);
      const luis = token();
      const cast = await vote(cena.event.publicId, luis, {
        name: 'Luis',
        votes: { [cena.july6.id]: 'available', [cena.july10.id]: 'preferred' },
      });
      expect(cast.status).toBe(201);
      return { ...cena, luis, participationId: (cast.body as VoteCast).participationId };
    }

    const statesOf = async (eventId: string) =>
      (await storedVotesOf(eventId)).map(({ id, name, votes: states }) => ({
        id,
        name,
        votes: Object.fromEntries(states.map(({ optionId, state }) => [optionId, state])),
      }));

    it('reads back the vote of the token', async () => {
      const { event, july6, july10, luis } = await withLuisVote();

      const response = await mine(event.publicId, luis);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        name: 'Luis',
        votes: { [july6.id]: 'available', [july10.id]: 'preferred' },
      });
    });

    it('updates the same voter: one participation, its name and every state replaced', async () => {
      const { event, july6, july10, luis, participationId } = await withLuisVote();

      const response = await edit(event.publicId, luis, {
        name: ' Luisa ',
        votes: { [july6.id]: 'unavailable', [july10.id]: 'available' },
      });

      expect(response.status).toBe(200);
      expect(await statesOf(event.id)).toEqual([
        {
          id: participationId,
          name: 'Luisa',
          votes: { [july6.id]: 'unavailable', [july10.id]: 'available' },
        },
      ]);
      const [stored] = await db
        .select({ createdAt: participations.createdAt, updatedAt: participations.updatedAt })
        .from(participations)
        .where(eq(participations.id, participationId));
      expect(stored!.updatedAt.getTime()).toBeGreaterThan(stored!.createdAt.getTime());
      expect((await mine(event.publicId, luis)).body).toEqual({
        name: 'Luisa',
        votes: { [july6.id]: 'unavailable', [july10.id]: 'available' },
      });
    });

    it('answers 403 to a token without a vote, or with a vote of another event, and changes nothing', async () => {
      const cena = await withLuisVote();
      const comida = await withLuisVote({ title: 'Comida de equipo' });
      const before = await statesOf(cena.event.id);
      const body = {
        name: 'Eva',
        votes: { [cena.july6.id]: 'unavailable', [cena.july10.id]: 'unavailable' },
      };

      for (const voteToken of [token(), comida.luis]) {
        expect((await mine(cena.event.publicId, voteToken)).status).toBe(403);
        const response = await edit(cena.event.publicId, voteToken, body);
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
      }
      expect(await statesOf(cena.event.id)).toEqual(before);
    });

    it.each([
      ['the deadline has passed', {}, afterDeadline],
      ['the organizer closed voting', { state: 'closed' as const }, beforeDeadline],
      ['a date is confirmed', { state: 'confirmed' as const }, beforeDeadline],
    ])('rejects an edit when %s, and still reads the vote', async (_case, values, now) => {
      const { event, july6, july10, luis } = await withLuisVote();
      if ('state' in values) await db.update(events).set(values).where(eq(events.id, event.id));
      const before = await statesOf(event.id);

      const response = await edit(
        event.publicId,
        luis,
        { name: 'Luisa', votes: { [july6.id]: 'unavailable', [july10.id]: 'unavailable' } },
        now,
      );

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: 'VOTING_CLOSED' } });
      expect(await statesOf(event.id)).toEqual(before);
      expect((await mine(event.publicId, luis)).status).toBe(200);
    });

    it('refuses an option of another event with 400 and changes nothing', async () => {
      const cena = await withLuisVote();
      const comida = await storeCena({ title: 'Comida de equipo' });
      const before = await statesOf(cena.event.id);

      const response = await edit(cena.event.publicId, cena.luis, {
        name: 'Luis',
        votes: { [cena.july6.id]: 'available', [comida.july10.id]: 'available' },
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: {
          details: [
            { code: 'OPTION_MISSING', optionId: cena.july10.id },
            { code: 'OPTION_UNKNOWN', optionId: comida.july10.id },
          ],
        },
      });
      expect(await statesOf(cena.event.id)).toEqual(before);
    });

    it('applies edits of the same vote sent at once one after the other', async () => {
      const { event, july6, july10, luis } = await withLuisVote();
      const sent = (['available', 'unavailable', 'preferred'] as const).map((state) => ({
        name: 'Luis',
        votes: { [july6.id]: state, [july10.id]: 'available' },
      }));

      const answers = await Promise.all(sent.map((body) => edit(event.publicId, luis, body)));

      expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200]);
      const stored = await statesOf(event.id);
      expect(stored).toHaveLength(1);
      expect(sent.map((body) => body.votes)).toContainEqual(stored[0]?.votes);
    });

    it('replaces the name and the states together, or neither', async () => {
      const { event, july6, july10, participationId } = await withLuisVote();
      const before = await statesOf(event.id);

      // A vote row the database refuses (a second preferred state) must undo the whole edit.
      await expect(
        createParticipations(db).transaction((ballot) =>
          ballot.replace(event.id, participationId, {
            name: 'Luisa',
            votes: { [july6.id]: 'preferred', [july10.id]: 'preferred' },
          }),
        ),
      ).rejects.toThrow();

      expect(await statesOf(event.id)).toEqual(before);
    });

    it('answers 410 on a cancelled event and 404 to an unknown link', async () => {
      const publicId = token();
      await db
        .insert(cancelledEvents)
        .values({ publicId, resultsId: token(), title: 'Cena de verano' });

      expect((await mine(publicId, token())).status).toBe(410);
      expect((await edit(publicId, token(), { name: 'Luis', votes: {} })).status).toBe(410);
      expect((await mine(token(), token())).status).toBe(404);
      expect((await edit(token(), token(), { name: 'Luis', votes: {} })).status).toBe(404);
    });
  });
});

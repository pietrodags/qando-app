import type { ManagedEvent } from '@qando/contracts';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { hashCapabilityToken } from '../../capability-token.js';
import { createDatabase, type Database } from '../../db/database.js';
import type { ErrorLogEntry } from '../../http/error-boundary.js';
import { runMigrations } from '../../db/migrate.js';
import { seedEvent, type EventSeed } from '../../seed/seed-event.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { testDependencies } from '../../test/test-dependencies.js';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { confirmations, events } from '../../db/schema.js';
import { createParticipations } from '../participations/participations-repository.js';
import { createPublicEvents } from '../public-events/public-events-repository.js';
import { createManagedEvents } from './managed-events-repository.js';

const managedIn = (response: { body: unknown }) => response.body as ManagedEvent;

// Voting on "Cena de verano" closes at the end of 1 July in Madrid.
const beforeDeadline = new Date('2026-06-15T08:00:00Z');

const cena: EventSeed = {
  title: 'Cena de verano',
  // The 10th has times, so it is a single date.
  options: ['2026-07-06', { date: '2026-07-10', startTime: '20:00', endTime: '22:00' }],
  deadline: '2026-07-01',
  votes: [
    { name: 'Luis', states: ['available', 'preferred'] },
    { name: 'Marta', states: ['unavailable', 'available'] },
  ],
};

describe('GET /api/events/:id against PostgreSQL', () => {
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

  const appOn = (on: Database, logError = testDependencies().logError) =>
    createApp({
      ...testDependencies(),
      managedEvents: createManagedEvents(on),
      now: () => beforeDeadline,
      logError,
    });

  const manage = (id: string, token?: string) => {
    const sent = request(appOn(db)).get(`/api/events/${encodeURIComponent(id)}`);
    return token === undefined ? sent : sent.set('X-Management-Token', token);
  };

  it('answers the event to its management token, with every option in full', async () => {
    const seeded = await seedEvent(db, cena);
    const [july6, july10] = seeded.optionIds as [string, string];

    const response = await manage(seeded.publicId, seeded.managementToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      title: 'Cena de verano',
      timeZone: 'Europe/Madrid',
      deadline: '2026-07-01',
      state: 'open',
      options: [
        { id: july6, dates: { kind: 'single', date: '2026-07-06' }, time: null },
        {
          id: july10,
          dates: { kind: 'single', date: '2026-07-10' },
          time: { kind: 'range', start: '20:00', end: '22:00' },
        },
      ],
      confirmedOption: null,
      voters: 2,
      recommendedOptionIds: [july10],
      participationId: seeded.publicId,
      resultsId: seeded.resultsId,
    } satisfies ManagedEvent);
  });

  it('counts only the votes of its own event', async () => {
    const seeded = await seedEvent(db, cena);
    await seedEvent(db, {
      ...cena,
      votes: [{ name: 'Pablo', states: ['preferred', 'available'] }],
    });

    const response = await manage(seeded.publicId, seeded.managementToken);

    expect(managedIn(response).voters).toBe(2);
  });

  it('answers the confirmed option of a confirmed event', async () => {
    const seeded = await seedEvent(db, { ...cena, outcome: { confirmed: 1 } });

    const response = await manage(seeded.publicId, seeded.managementToken);

    expect(managedIn(response)).toMatchObject({
      state: 'confirmed',
      confirmedOption: { id: seeded.optionIds[1] },
    });
  });

  it('answers 401 without a token', async () => {
    const seeded = await seedEvent(db, cena);

    const response = await manage(seeded.publicId);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('answers 403 to a wrong token, the token of another event and an unknown event', async () => {
    const seeded = await seedEvent(db, cena);
    const other = await seedEvent(db, cena);

    for (const [id, token] of [
      [seeded.publicId, 'Zx81aB2cD4eF6gH8iJ0kLm'],
      [seeded.publicId, seeded.publicId],
      [seeded.publicId, seeded.resultsId],
      [seeded.publicId, other.managementToken],
      ['nobody-has-this-link', seeded.managementToken],
    ] as const) {
      const response = await manage(id, token);

      expect(response.status, `${id} with ${token}`).toBe(403);
      expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    }
  });

  it('answers 410 with the title of a cancelled event', async () => {
    const seeded = await seedEvent(db, { ...cena, outcome: 'cancelled' });

    const response = await manage(seeded.publicId, seeded.managementToken);

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });

  it('never logs the token, its hash or the link when the database fails', async () => {
    const seeded = await seedEvent(db, cena);
    const closed = new pg.Pool({ connectionString: database.url });
    await closed.end();
    const logged: ErrorLogEntry[] = [];

    const response = await request(appOn(createDatabase(closed), (entry) => logged.push(entry)))
      .get(`/api/events/${seeded.publicId}`)
      .set('X-Management-Token', seeded.managementToken);

    expect(response.status).toBe(500);
    expect(logged).toHaveLength(1);
    const line = JSON.stringify(logged);
    for (const secret of [
      seeded.managementToken,
      hashCapabilityToken(seeded.managementToken),
      seeded.publicId,
    ]) {
      expect(line).not.toContain(secret);
    }
  });
});

describe('POST /api/events/:id/confirmation against PostgreSQL', () => {
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

  const app = (now = beforeDeadline) =>
    createApp({
      ...testDependencies(),
      managedEvents: createManagedEvents(db),
      publicEvents: createPublicEvents(db),
      participations: createParticipations(db),
      now: () => now,
    });

  const confirm = (id: string, token: string, optionId: string, now = beforeDeadline) =>
    request(app(now))
      .post(`/api/events/${encodeURIComponent(id)}/confirmation`)
      .set('X-Management-Token', token)
      .send({ optionId });

  /** The confirmed option's ID and the stored state of the event. */
  async function storedOutcome(publicId: string) {
    const [stored] = await db
      .select({ state: events.state, optionId: confirmations.optionId })
      .from(events)
      .leftJoin(confirmations, eq(confirmations.eventId, events.id))
      .where(eq(events.publicId, publicId));
    return stored;
  }

  it('confirms an option while voting is open; voting is then closed to everyone', async () => {
    const seeded = await seedEvent(db, cena);
    const [july6, july10] = seeded.optionIds as [string, string];

    const response = await confirm(seeded.publicId, seeded.managementToken, july10);

    expect(response.status).toBe(200);
    expect(managedIn(response)).toMatchObject({
      state: 'confirmed',
      confirmedOption: { id: july10 },
      voters: 2,
    });
    expect(await storedOutcome(seeded.publicId)).toEqual({ state: 'confirmed', optionId: july10 });

    const participation = await request(app()).get(`/api/public/events/${seeded.publicId}`);
    expect(participation.body).toMatchObject({
      state: 'confirmed',
      confirmedOption: { id: july10 },
    });
    const vote = await request(app())
      .post(`/api/public/events/${seeded.publicId}/participations`)
      .set('X-Vote-Token', randomBytes(16).toString('base64url'))
      .send({ name: 'Pablo', votes: { [july6]: 'available', [july10]: 'available' } });
    expect(vote.status).toBe(409);
  });

  it('confirms after the deadline', async () => {
    const seeded = await seedEvent(db, cena);
    const [july6] = seeded.optionIds as [string, string];

    const response = await confirm(
      seeded.publicId,
      seeded.managementToken,
      july6,
      new Date('2026-07-02T08:00:00Z'),
    );

    expect(response.status).toBe(200);
    expect(await storedOutcome(seeded.publicId)).toEqual({ state: 'confirmed', optionId: july6 });
  });

  it('answers the confirmed option sent again as the first time', async () => {
    const seeded = await seedEvent(db, cena);
    const [, july10] = seeded.optionIds as [string, string];
    const first = await confirm(seeded.publicId, seeded.managementToken, july10);

    const again = await confirm(seeded.publicId, seeded.managementToken, july10);

    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
  });

  it('refuses a second confirmation of another option with 409; the first stays', async () => {
    const seeded = await seedEvent(db, cena);
    const [july6, july10] = seeded.optionIds as [string, string];
    await confirm(seeded.publicId, seeded.managementToken, july10);

    const response = await confirm(seeded.publicId, seeded.managementToken, july6);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: 'ALREADY_CONFIRMED' } });
    expect(await storedOutcome(seeded.publicId)).toEqual({ state: 'confirmed', optionId: july10 });
  });

  it('lets only one of two confirmations sent at once win', async () => {
    const seeded = await seedEvent(db, cena);
    const [july6, july10] = seeded.optionIds as [string, string];

    const answers = await Promise.all([
      confirm(seeded.publicId, seeded.managementToken, july6),
      confirm(seeded.publicId, seeded.managementToken, july10),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    const [winner] = answers.filter(({ status }) => status === 200).map(managedIn);
    expect((await storedOutcome(seeded.publicId))?.optionId).toBe(winner?.confirmedOption?.id);
  });

  it('refuses an option of another event with 400 and confirms nothing', async () => {
    const seeded = await seedEvent(db, cena);
    const other = await seedEvent(db, cena);

    const [elsewhere] = other.optionIds as [string, string];

    const response = await confirm(seeded.publicId, seeded.managementToken, elsewhere);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_FAILED', details: [{ code: 'OPTION_UNKNOWN' }] },
    });
    expect(await storedOutcome(seeded.publicId)).toEqual({ state: 'open', optionId: null });
    expect(await storedOutcome(other.publicId)).toEqual({ state: 'open', optionId: null });
  });

  it('refuses the participation link, the results link and another event’s token with 403', async () => {
    const seeded = await seedEvent(db, cena);
    const other = await seedEvent(db, cena);

    const [, july10] = seeded.optionIds as [string, string];

    for (const token of [seeded.publicId, seeded.resultsId, other.managementToken]) {
      const response = await confirm(seeded.publicId, token, july10);

      expect(response.status, token).toBe(403);
    }
    expect(await storedOutcome(seeded.publicId)).toEqual({ state: 'open', optionId: null });
  });

  it('refuses a cancelled event with 410 and its title', async () => {
    const seeded = await seedEvent(db, { ...cena, outcome: 'cancelled' });

    // A cancelled event keeps no options: any option ID is answered the same.
    const response = await confirm(
      seeded.publicId,
      seeded.managementToken,
      '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c10',
    );

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });
});

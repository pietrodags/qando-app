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

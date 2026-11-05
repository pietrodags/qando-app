import { randomBytes } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { cancelledEvents, confirmations, events, options } from '../../db/schema.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { testDependencies } from '../../test/test-dependencies.js';
import { createPublicEvents } from './public-events-repository.js';

// "Cena de verano": deadline 1 July in Madrid, so voting closes at 21:59:59.999 UTC that day.
const closesAt = new Date('2026-07-01T21:59:59.999Z');
const beforeDeadline = new Date('2026-06-15T08:00:00Z');
const afterDeadline = new Date('2026-07-02T08:00:00Z');

describe('GET /api/public/events/:id against PostgreSQL', () => {
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

  const read = (publicId: string, now = beforeDeadline) =>
    request(
      createApp({ ...testDependencies(), publicEvents: createPublicEvents(db), now: () => now }),
    ).get(`/api/public/events/${publicId}`);

  /** Stores "Cena de verano" with 11, 6 (21:00) and 10 July (whole day), out of order. */
  async function storeCena(values: Partial<typeof events.$inferInsert> = {}) {
    const [event] = await db
      .insert(events)
      .values({
        publicId: token(),
        resultsId: token(),
        managementTokenHash: token(),
        organizerName: 'Ana',
        organizerEmail: 'ana@example.com',
        title: 'Cena de verano',
        note: 'En el sitio de siempre',
        timeZone: 'Europe/Madrid',
        deadline: '2026-07-01',
        closesAt,
        anonymous: false,
        ...values,
      })
      .returning();
    const stored = await db
      .insert(options)
      .values([
        {
          eventId: event!.id,
          position: 2,
          startDate: '2026-07-11',
          startTime: '09:00',
          endTime: '13:30',
        },
        { eventId: event!.id, position: 0, startDate: '2026-07-06', startTime: '21:00' },
        { eventId: event!.id, position: 1, startDate: '2026-07-10', endDate: '2026-07-12' },
      ])
      .returning();
    const byDate = (date: string) => stored.find((option) => option.startDate === date)!;
    return {
      event: event!,
      july6: byDate('2026-07-06'),
      july10: byDate('2026-07-10'),
      july11: byDate('2026-07-11'),
    };
  }

  it('answers an open event with its options in chronological order', async () => {
    const { event, july6, july10, july11 } = await storeCena();

    const response = await read(event.publicId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      title: 'Cena de verano',
      organizerName: 'Ana',
      note: 'En el sitio de siempre',
      deadline: '2026-07-01',
      timeZone: 'Europe/Madrid',
      anonymous: false,
      state: 'open',
      options: [
        {
          id: july6.id,
          dates: { kind: 'single', date: '2026-07-06' },
          time: { kind: 'single', at: '21:00' },
        },
        {
          id: july10.id,
          dates: { kind: 'range', start: '2026-07-10', end: '2026-07-12' },
          time: null,
        },
        {
          id: july11.id,
          dates: { kind: 'single', date: '2026-07-11' },
          time: { kind: 'range', start: '09:00', end: '13:30' },
        },
      ],
      confirmedOption: null,
    });
  });

  it('never answers the organizer email, the tokens or the internal IDs', async () => {
    const { event } = await storeCena();

    const response = await read(event.publicId);

    for (const secret of [
      event.organizerEmail,
      event.managementTokenHash,
      event.resultsId,
      event.id,
    ]) {
      expect(response.text).not.toContain(secret);
    }
  });

  it('answers an anonymous event as anonymous', async () => {
    const { event } = await storeCena({ anonymous: true });

    const response = await read(event.publicId);

    expect(response.body).toMatchObject({ anonymous: true });
  });

  it('answers closed after the deadline, though the stored state is still open', async () => {
    const { event } = await storeCena();

    const response = await read(event.publicId, afterDeadline);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ state: 'closed' });
  });

  it('answers closed when the organizer closed voting before the deadline', async () => {
    const { event } = await storeCena({ state: 'closed' });

    const response = await read(event.publicId);

    expect(response.body).toMatchObject({ state: 'closed' });
  });

  it('answers a confirmed event with the confirmed option', async () => {
    const { event, july10 } = await storeCena({ state: 'confirmed' });
    await db.insert(confirmations).values({ eventId: event.id, optionId: july10.id });

    const response = await read(event.publicId, afterDeadline);

    expect(response.body).toMatchObject({
      state: 'confirmed',
      confirmedOption: {
        id: july10.id,
        dates: { kind: 'range', start: '2026-07-10', end: '2026-07-12' },
        time: null,
      },
    });
  });

  it('answers 410 with the title of a cancelled event', async () => {
    const publicId = token();
    await db
      .insert(cancelledEvents)
      .values({ publicId, resultsId: token(), title: 'Cena de verano' });

    const response = await read(publicId);

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });

  it('answers 404 for a link no event has', async () => {
    const response = await read(token());

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('does not open an event through its results link', async () => {
    const { event } = await storeCena();

    const response = await read(event.resultsId);

    expect(response.status).toBe(404);
  });
});

import { eq } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createDatabase, type Database } from '../db/database.js';
import { runMigrations } from '../db/migrate.js';
import { events, users } from '../db/schema.js';
import { createParticipations } from '../modules/participations/participations-repository.js';
import { createPublicEvents } from '../modules/public-events/public-events-repository.js';
import { createFreshDatabase, type FreshDatabase } from '../test/fresh-database.js';
import { testDependencies } from '../test/test-dependencies.js';
import { demoEvents } from './demo-events.js';
import { seedEvent, type EventSeed } from './seed-event.js';
import { storedVotes } from './stored-votes.js';

const beforeDeadline = new Date('2026-06-15T08:00:00Z');

const cena: EventSeed = {
  title: 'Cena de verano',
  note: 'En el sitio de siempre',
  deadline: '2026-07-01',
  options: [
    '2026-07-06',
    { date: '2026-07-10', endDate: '2026-07-12' },
    { date: '2026-07-11', startTime: '09:00', endTime: '13:30' },
  ],
};

describe('seedEvent against PostgreSQL', () => {
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

  // The seeded events are read back through the API, as the pages read them.
  const api = (now = beforeDeadline) =>
    request(
      createApp({
        ...testDependencies(),
        publicEvents: createPublicEvents(db),
        participations: createParticipations(db),
        now: () => now,
      }),
    );

  it('stores an open event that the participation link opens', async () => {
    const seeded = await seedEvent(db, cena);

    const response = await api().get(`/api/public/events/${seeded.publicId}`);

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
          id: seeded.optionIds[0],
          dates: { kind: 'single', date: '2026-07-06' },
          time: null,
        },
        {
          id: seeded.optionIds[1],
          dates: { kind: 'range', start: '2026-07-10', end: '2026-07-12' },
          time: null,
        },
        {
          id: seeded.optionIds[2],
          dates: { kind: 'single', date: '2026-07-11' },
          time: { kind: 'range', start: '09:00', end: '13:30' },
        },
      ],
      confirmedOption: null,
    });
  });

  it('gives every event its own links, each 128 random bits', async () => {
    const first = await seedEvent(db, cena);
    const second = await seedEvent(db, cena);

    const links = [first, second].flatMap((seeded) => [
      seeded.publicId,
      seeded.resultsId,
      seeded.managementToken,
    ]);
    expect(new Set(links).size).toBe(6);
    for (const link of links) expect(link).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('closes voting at the end of the deadline in the event time zone', async () => {
    const seeded = await seedEvent(db, { ...cena, timeZone: 'America/New_York' });

    // 1 July ends at 04:00 UTC in New York (UTC-4 in summer).
    const lastMoment = await api(new Date('2026-07-02T03:59:59.998Z')).get(
      `/api/public/events/${seeded.publicId}`,
    );
    const closed = await api(new Date('2026-07-02T03:59:59.999Z')).get(
      `/api/public/events/${seeded.publicId}`,
    );

    expect(lastMoment.body).toMatchObject({ timeZone: 'America/New_York', state: 'open' });
    expect(closed.body).toMatchObject({ state: 'closed' });
  });

  it('stores the votes, each opened by its own edit link', async () => {
    const seeded = await seedEvent(db, {
      ...cena,
      votes: [
        { name: 'Luis', states: ['available', 'preferred', 'unavailable'] },
        { name: 'Marta', states: ['unavailable', 'available', 'available'] },
      ],
    });

    const luis = await api()
      .get(`/api/public/events/${seeded.publicId}/participations/mine`)
      .set('X-Vote-Token', seeded.votes[0]!.token);
    expect(seeded.votes.map(({ name }) => name)).toEqual(['Luis', 'Marta']);
    const marta = await api()
      .get(`/api/public/events/${seeded.publicId}/participations/mine`)
      .set('X-Vote-Token', seeded.votes[1]!.token);

    expect(luis.status).toBe(200);
    expect(luis.body).toEqual({
      name: 'Luis',
      votes: {
        [seeded.optionIds[0]!]: 'available',
        [seeded.optionIds[1]!]: 'preferred',
        [seeded.optionIds[2]!]: 'unavailable',
      },
    });
    expect(marta.body).toMatchObject({ name: 'Marta' });
  });

  it('stores an anonymous event and its votes without names', async () => {
    const seeded = await seedEvent(db, {
      ...cena,
      anonymous: true,
      votes: [{ states: ['available', 'available', 'preferred'] }],
    });

    const event = await api().get(`/api/public/events/${seeded.publicId}`);
    const vote = await api()
      .get(`/api/public/events/${seeded.publicId}/participations/mine`)
      .set('X-Vote-Token', seeded.votes[0]!.token);

    expect(event.body).toMatchObject({ anonymous: true });
    expect(vote.body).not.toHaveProperty('name');
  });

  it('stores an event whose organizer closed voting before the deadline', async () => {
    const seeded = await seedEvent(db, { ...cena, outcome: 'closed early' });

    const response = await api().get(`/api/public/events/${seeded.publicId}`);

    expect(response.body).toMatchObject({ state: 'closed' });
  });

  it('stores a confirmed event with the confirmed option', async () => {
    const seeded = await seedEvent(db, { ...cena, outcome: { confirmed: 1 } });

    const response = await api().get(`/api/public/events/${seeded.publicId}`);

    expect(response.body).toMatchObject({
      state: 'confirmed',
      confirmedOption: { id: seeded.optionIds[1] },
    });
  });

  it('gives every event the verified account of its organizer email, one account per email', async () => {
    const organizer = { name: 'Gema', email: ' Gema.Owner@Example.com ' };
    const first = await seedEvent(db, { ...cena, organizer });
    const second = await seedEvent(db, {
      ...cena,
      organizer: { name: 'Gema R.', email: 'gema.owner@example.com' },
    });

    const ownerOf = async (publicId: string) => {
      const [row] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          verified: users.emailVerified,
        })
        .from(events)
        .innerJoin(users, eq(users.id, events.ownerId))
        .where(eq(events.publicId, publicId));
      return row;
    };
    const owner = await ownerOf(first.publicId);
    expect(owner).toMatchObject({ email: 'gema.owner@example.com', name: 'Gema', verified: true });
    expect((await ownerOf(second.publicId))?.id).toBe(owner?.id);
  });

  it('stores a cancelled event as what is left of it: its title behind its links', async () => {
    const seeded = await seedEvent(db, { ...cena, outcome: 'cancelled' });

    const response = await api().get(`/api/public/events/${seeded.publicId}`);

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });

  it('stores every demo event, each read back in the state it shows', async () => {
    const expected = ['open', 'open', 'closed', 'confirmed'];
    const demos = demoEvents('2026-06-15');

    for (const [index, { seed }] of demos.entries()) {
      const seeded = await seedEvent(db, seed);
      const response = await api().get(`/api/public/events/${seeded.publicId}`);

      if (seed.outcome === 'cancelled') {
        expect(response.status, seed.title).toBe(410);
        continue;
      }
      expect(response.body, seed.title).toMatchObject({ state: expected[index] });
      for (const vote of seeded.votes) {
        const mine = await api()
          .get(`/api/public/events/${seeded.publicId}/participations/mine`)
          .set('X-Vote-Token', vote.token);
        expect(mine.status, seed.title).toBe(200);
      }
    }
  });

  it('stores nothing when a part of the event breaks a rule of the database', async () => {
    const broken = seedEvent(db, {
      ...cena,
      title: 'Dos preferidas',
      votes: [{ name: 'Luis', states: ['preferred', 'preferred', 'available'] }],
    });

    await expect(broken).rejects.toThrow();
    const stored = await pool.query("SELECT 1 FROM events WHERE title = 'Dos preferidas'");
    expect(stored.rowCount).toBe(0);
  });

  it('refuses a vote that does not answer every option, as the API would', async () => {
    const incomplete = seedEvent(db, {
      ...cena,
      votes: [{ name: 'Luis', states: ['available', 'preferred'] }],
    });

    await expect(incomplete).rejects.toThrow('must answer each of its options once');
  });

  it('refuses to confirm an option the event does not have', async () => {
    const unknown = seedEvent(db, { ...cena, outcome: { confirmed: 3 } });

    await expect(unknown).rejects.toThrow('has no option 3');
  });

  it('reads the votes back as they were stored', async () => {
    const seeded = await seedEvent(db, {
      ...cena,
      votes: [
        { name: 'Luis', states: ['available', 'preferred', 'unavailable'] },
        { name: 'Marta', states: ['unavailable', 'available', 'available'] },
      ],
    });

    // Seeded in one transaction, both votes share their time: their order is not defined.
    const stored = await storedVotes(db, seeded.publicId);
    expect(stored).toHaveLength(2);
    expect(stored).toEqual(
      expect.arrayContaining([
        { name: 'Luis', states: ['available', 'preferred', 'unavailable'] },
        { name: 'Marta', states: ['unavailable', 'available', 'available'] },
      ]),
    );
  });

  it('reads the votes of anonymous events without a name', async () => {
    const seeded = await seedEvent(db, {
      ...cena,
      anonymous: true,
      votes: [{ states: ['available', 'available', 'preferred'] }],
    });

    expect(await storedVotes(db, seeded.publicId)).toEqual([
      { states: ['available', 'available', 'preferred'] },
    ]);
  });

  it('reads no votes for an event nobody voted on, or for an unknown link', async () => {
    const seeded = await seedEvent(db, cena);

    expect(await storedVotes(db, seeded.publicId)).toEqual([]);
    expect(await storedVotes(db, 'no-such-link')).toEqual([]);
  });
});

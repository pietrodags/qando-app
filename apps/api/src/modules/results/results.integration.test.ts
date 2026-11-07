import type { Results } from '@qando/contracts';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { seedEvent, type EventSeed } from '../../seed/seed-event.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { testDependencies } from '../../test/test-dependencies.js';
import { newCapabilityToken } from '../../capability-token.js';
import { createParticipations } from '../participations/participations-repository.js';
import { createPublicEvents } from '../public-events/public-events-repository.js';
import { createEventResults } from './results-repository.js';

/** The real voting ports, so a test casts votes as the voting page does. */
const realVoting = (db: Database) => ({
  publicEvents: createPublicEvents(db),
  participations: createParticipations(db),
  now: () => beforeDeadline,
});

const resultsIn = (response: { body: unknown }) => response.body as Results;

// Voting on "Cena de verano" closes at the end of 1 July in Madrid.
const beforeDeadline = new Date('2026-06-15T08:00:00Z');

const cena: EventSeed = {
  title: 'Cena de verano',
  // Stored in this order; the 10th has times, so it is a single date.
  options: [
    '2026-07-06',
    { date: '2026-07-10', startTime: '20:00', endTime: '22:00' },
    '2026-07-11',
  ],
  deadline: '2026-07-01',
  votes: [
    { name: 'Luis', states: ['available', 'preferred', 'unavailable'] },
    { name: 'Marta', states: ['available', 'available', 'unavailable'] },
    { name: 'Álvaro', states: ['unavailable', 'available', 'available'] },
  ],
};

describe('GET /api/results/:resultsId against PostgreSQL', () => {
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

  const read = (resultsId: string) =>
    request(
      createApp({
        ...testDependencies(),
        results: createEventResults(db),
        now: () => beforeDeadline,
      }),
    ).get(`/api/results/${encodeURIComponent(resultsId)}`);

  it('answers the results of the link, with every option in full and the names', async () => {
    const seeded = await seedEvent(db, cena);
    const [, july10] = seeded.optionIds;

    const response = await read(seeded.resultsId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      title: 'Cena de verano',
      timeZone: 'Europe/Madrid',
      final: false,
      outcome: 'one',
      voters: 3,
      attending: 3,
      notAttending: 0,
      winnersListed: true,
      winners: [
        {
          option: {
            id: july10,
            dates: { kind: 'single', date: '2026-07-10' },
            time: { kind: 'range', start: '20:00', end: '22:00' },
          },
          preferred: 1,
          available: 2,
          unavailable: 0,
          names: { preferred: ['Luis'], available: ['Álvaro', 'Marta'], unavailable: [] },
        },
      ],
      alternatives: [],
      confirmedOption: null,
    });
  });

  it('counts only the votes of its own event', async () => {
    const seeded = await seedEvent(db, cena);
    await seedEvent(db, {
      ...cena,
      votes: [{ name: 'Pablo', states: ['preferred', 'unavailable', 'available'] }],
    });

    const response = await read(seeded.resultsId);

    expect(resultsIn(response).voters).toBe(3);
  });

  it('tells voters with the same name apart in the order they voted', async () => {
    const seeded = await seedEvent(db, { ...cena, votes: [] });
    const [july6, july10, july11] = seeded.optionIds as [string, string, string];
    // Two votes sent one after the other, the first one unavailable on the 6th.
    for (const states of [
      { [july6]: 'unavailable', [july10]: 'preferred', [july11]: 'unavailable' },
      { [july6]: 'preferred', [july10]: 'available', [july11]: 'unavailable' },
    ]) {
      const vote = await request(createApp({ ...testDependencies(), ...realVoting(db) }))
        .post(`/api/public/events/${seeded.publicId}/participations`)
        .set('X-Vote-Token', newCapabilityToken())
        .send({ name: 'Ana', votes: states });
      expect(vote.status).toBe(201);
    }

    const response = await read(seeded.resultsId);

    expect(resultsIn(response).winners).toMatchObject([
      { option: { id: july10 }, names: { preferred: ['Ana'], available: ['Ana (2)'] } },
    ]);
  });

  it('answers the options in the event order, so ties list them chronologically', async () => {
    const seeded = await seedEvent(db, {
      ...cena,
      votes: [
        { name: 'Luis', states: ['unavailable', 'preferred', 'available'] },
        { name: 'Marta', states: ['unavailable', 'available', 'preferred'] },
      ],
    });

    const response = await read(seeded.resultsId);

    expect(resultsIn(response).outcome).toBe('two');
    expect(resultsIn(response).winners.map((shown) => shown.option.id)).toEqual(
      seeded.optionIds.slice(1),
    );
  });

  it('shows no names on an anonymous event', async () => {
    const seeded = await seedEvent(db, {
      ...cena,
      anonymous: true,
      votes: [{ states: ['preferred', 'available', 'unavailable'] }],
    });

    const response = await read(seeded.resultsId);

    expect(resultsIn(response).voters).toBe(1);
    expect(JSON.stringify(response.body)).not.toContain('names');
  });

  it('answers the confirmed option and final results on a confirmed event', async () => {
    const seeded = await seedEvent(db, { ...cena, outcome: { confirmed: 2 } });

    const response = await read(seeded.resultsId);

    expect(response.body).toMatchObject({
      final: true,
      confirmedOption: { id: seeded.optionIds[2], dates: { kind: 'single', date: '2026-07-11' } },
    });
  });

  it('answers final results when voting was closed early', async () => {
    const seeded = await seedEvent(db, { ...cena, outcome: 'closed early' });

    expect(resultsIn(await read(seeded.resultsId)).final).toBe(true);
  });

  it('refuses the participation link with 403', async () => {
    const seeded = await seedEvent(db, cena);

    const response = await read(seeded.publicId);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('refuses the participation link of a cancelled event with 403 too', async () => {
    const seeded = await seedEvent(db, { ...cena, outcome: 'cancelled' });

    expect((await read(seeded.publicId)).status).toBe(403);
  });

  it('opens nothing with the management token: the management page links to the results', async () => {
    const seeded = await seedEvent(db, cena);

    expect((await read(seeded.managementToken)).status).toBe(404);
  });

  it('answers a cancelled event with 410 and its title', async () => {
    const seeded = await seedEvent(db, { ...cena, outcome: 'cancelled' });

    const response = await read(seeded.resultsId);

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });

  it('answers an unknown link with 404', async () => {
    const response = await read('Qw7p2-unknown');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

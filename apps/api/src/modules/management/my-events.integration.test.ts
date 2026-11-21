import type { MyEvent } from '@qando/contracts';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { events, users } from '../../db/schema.js';
import { seedEvent, type EventSeed, type SeededEvent } from '../../seed/seed-event.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { testDependencies, testSessionCookie } from '../../test/test-dependencies.js';
import { createManagedEvents } from './managed-events-repository.js';

// Voting on "Cena de verano" closes at the end of 1 July in Madrid.
const beforeDeadline = new Date('2026-06-15T08:00:00Z');
const afterDeadline = new Date('2026-07-02T08:00:00Z');

const ana = { name: 'Ana', email: 'ana@example.com' };
const bea = { name: 'Bea', email: 'bea@example.com' };

const event = (title: string, deadline: string, seed: Partial<EventSeed> = {}): EventSeed => ({
  title,
  options: ['2026-07-06', '2026-07-10'],
  deadline,
  organizer: ana,
  ...seed,
});

describe('GET /api/me/events against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: Database;
  let anaId: string;
  let cena: SeededEvent;
  let excursion: SeededEvent;
  let cafe: SeededEvent;

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    db = createDatabase(pool);
    // One after another, so each is created after the one before.
    cafe = await seedEvent(db, event('Café', '2026-06-20', { outcome: { confirmed: 1 } }));
    cena = await seedEvent(db, event('Cena de verano', '2026-07-01'));
    await seedEvent(db, event('Partido', '2026-07-01', { organizer: bea }));
    await seedEvent(db, event('Cumpleaños', '2026-07-01', { outcome: 'cancelled' }));
    excursion = await seedEvent(db, event('Excursión', '2026-07-20'));
    const [account] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ana.email));
    anaId = account?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  const myEvents = (accountId: string | undefined, now = beforeDeadline) => {
    const app = createApp({
      ...testDependencies(),
      managedEvents: createManagedEvents(db),
      now: () => now,
    });
    const sent = request(app).get('/api/me/events');
    return accountId === undefined ? sent : sent.set('Cookie', `${testSessionCookie}=${accountId}`);
  };

  const createdAtOf = async (seeded: SeededEvent) => {
    const [row] = await db
      .select({ createdAt: events.createdAt })
      .from(events)
      .where(eq(events.publicId, seeded.publicId));
    if (!row) throw new Error(`No stored event ${seeded.title}`);
    return row.createdAt.toISOString();
  };

  it('answers only the account’s own events, newest first, each with its current state', async () => {
    const response = await myEvents(anaId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: excursion.publicId,
        title: 'Excursión',
        state: 'open',
        deadline: '2026-07-20',
        createdAt: await createdAtOf(excursion),
      },
      {
        id: cena.publicId,
        title: 'Cena de verano',
        state: 'open',
        deadline: '2026-07-01',
        createdAt: await createdAtOf(cena),
      },
      {
        id: cafe.publicId,
        title: 'Café',
        state: 'confirmed',
        deadline: '2026-06-20',
        createdAt: await createdAtOf(cafe),
      },
    ] satisfies MyEvent[]);
  });

  it('answers an event whose deadline has passed as closed, though its row still says open', async () => {
    const response = await myEvents(anaId, afterDeadline);

    expect((response.body as MyEvent[]).map(({ title, state }) => [title, state])).toEqual([
      ['Excursión', 'open'],
      ['Cena de verano', 'closed'],
      ['Café', 'confirmed'],
    ]);
  });

  it('answers 401 to a request without a session', async () => {
    const response = await myEvents(undefined);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });
});

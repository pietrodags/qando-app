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
import {
  testDependencies,
  testSessionCookie,
  testTrustedOrigin,
} from '../../test/test-dependencies.js';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  cancelledEvents,
  confirmations,
  events,
  notifications,
  options,
  participations,
  votes,
} from '../../db/schema.js';
import { scheduleEmail } from '../../email/outbox.js';
import { createParticipations } from '../participations/participations-repository.js';
import { createPublicEvents } from '../public-events/public-events-repository.js';
import { createEventResults } from '../results/results-repository.js';
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
      emails: [{ type: 'voting-closed', status: 'scheduled' }],
    } satisfies ManagedEvent);
  });

  it('answers the state of each email queued for the event, the summary first', async () => {
    const seeded = await seedEvent(db, { ...cena, emails: { summary: 'sent' } });
    await seedEvent(db, { ...cena, emails: { summary: 'failed' } });
    const [stored] = await db
      .select({ id: events.id, closesAt: events.closesAt })
      .from(events)
      .where(eq(events.publicId, seeded.publicId));
    await scheduleEmail(db, {
      eventId: stored!.id,
      type: 'voting_closed',
      recipient: 'ana@example.com',
      at: stored!.closesAt,
    });
    // Written again after "voting closed" was queued, as a retry would: stored after it.
    await db
      .update(notifications)
      .set({ recipient: 'ana@example.com' })
      .where(and(eq(notifications.eventId, stored!.id), eq(notifications.type, 'summary')));
    const [summary] = await db
      .select({ sentAt: notifications.sentAt })
      .from(notifications)
      .where(eq(notifications.eventId, stored!.id))
      .then((rows) => rows.filter(({ sentAt }) => sentAt !== null));

    // Read without indexes, so the rows come in the order they are stored, whatever plan the
    // database would pick.
    const scanning = new pg.Pool({
      connectionString: database.url,
      options: '-c enable_indexscan=off -c enable_bitmapscan=off',
    });
    const response = await request(appOn(createDatabase(scanning)))
      .get(`/api/events/${seeded.publicId}`)
      .set('X-Management-Token', seeded.managementToken);
    await scanning.end();

    expect(managedIn(response).emails).toEqual([
      { type: 'summary', status: 'sent', sentAt: summary!.sentAt!.toISOString() },
      { type: 'voting-closed', status: 'scheduled' },
    ]);
  });

  it('answers "voting closed" as scheduled while voting is open, and as being sent once closed', async () => {
    const seeded = await seedEvent(db, cena);
    const readAt = (now: Date) =>
      request(
        createApp({
          ...testDependencies(),
          managedEvents: createManagedEvents(db),
          now: () => now,
        }),
      )
        .get(`/api/events/${seeded.publicId}`)
        .set('X-Management-Token', seeded.managementToken);

    expect(managedIn(await readAt(beforeDeadline)).emails).toEqual([
      { type: 'voting-closed', status: 'scheduled' },
    ]);
    // Closed, in the minute before it is due: about to go, no longer waiting for the closing.
    const closed = managedIn(await readAt(new Date('2026-07-01T22:00:30Z')));
    expect(closed.state).toBe('closed');
    expect(closed.emails).toEqual([{ type: 'voting-closed', status: 'pending' }]);
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

  it('drops the "voting closed" email not sent yet: it would ask to choose the date', async () => {
    const seeded = await seedEvent(db, { ...cena, emails: { summary: 'sent' } });
    const [, july10] = seeded.optionIds as [string, string];

    const response = await confirm(seeded.publicId, seeded.managementToken, july10);

    expect(response.status).toBe(200);
    expect(managedIn(response).emails).toEqual([
      { type: 'summary', status: 'sent', sentAt: expect.any(String) as string },
    ]);
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

describe('POST /api/events/:id/emails/:type/retry against PostgreSQL', () => {
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

  const retry = (
    id: string,
    credential: { token: string } | { accountId: string },
    type = 'summary',
  ) => {
    const app = createApp({
      ...testDependencies(),
      managedEvents: createManagedEvents(db),
      now: () => beforeDeadline,
    });
    const sent = request(app).post(`/api/events/${encodeURIComponent(id)}/emails/${type}/retry`);
    return 'token' in credential
      ? sent.set('X-Management-Token', credential.token)
      : sent
          .set('Cookie', `${testSessionCookie}=${credential.accountId}`)
          .set('Origin', testTrustedOrigin);
  };

  /** The event's summary as the outbox reads it, and the account that owns the event. */
  async function storedSummary(publicId: string) {
    const [stored] = await db
      .select({
        ownerId: events.ownerId,
        status: notifications.status,
        scheduledAt: notifications.scheduledAt,
      })
      .from(events)
      .innerJoin(notifications, eq(notifications.eventId, events.id))
      .where(and(eq(events.publicId, publicId), eq(notifications.type, 'summary')));
    return stored!;
  }

  it('makes a failed summary due at the request’s time, with the management link', async () => {
    const seeded = await seedEvent(db, { ...cena, emails: { summary: 'failed' } });

    const response = await retry(seeded.publicId, { token: seeded.managementToken });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ type: 'summary', status: 'pending' });
    expect(await storedSummary(seeded.publicId)).toMatchObject({
      status: 'pending',
      scheduledAt: beforeDeadline,
    });
  });

  it('retries a failed "voting closed" email, leaving the failed summary as it is', async () => {
    const seeded = await seedEvent(db, { ...cena, emails: { summary: 'failed' } });
    const [stored] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.publicId, seeded.publicId));
    const eventId = stored!.id;
    await scheduleEmail(db, {
      eventId,
      type: 'voting_closed',
      recipient: 'ana@example.com',
      at: beforeDeadline,
    });
    await db
      .update(notifications)
      .set({ status: 'failed', attempts: 5 })
      .where(eq(notifications.eventId, eventId));

    const response = await retry(
      seeded.publicId,
      { token: seeded.managementToken },
      'voting-closed',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ type: 'voting-closed', status: 'pending' });
    const states = await db
      .select({ type: notifications.type, status: notifications.status })
      .from(notifications)
      .where(eq(notifications.eventId, eventId));
    expect(states).toEqual(
      expect.arrayContaining([
        { type: 'summary', status: 'failed' },
        { type: 'voting_closed', status: 'pending' },
      ]),
    );
  });

  it('makes a failed summary due again with the owner’s session', async () => {
    const seeded = await seedEvent(db, { ...cena, emails: { summary: 'failed' } });
    const { ownerId } = await storedSummary(seeded.publicId);

    const response = await retry(seeded.publicId, { accountId: ownerId });

    expect(response.status).toBe(200);
    expect(await storedSummary(seeded.publicId)).toMatchObject({ status: 'pending' });
  });

  it('refuses the participation link, the results link and another event’s token with 403', async () => {
    const seeded = await seedEvent(db, { ...cena, emails: { summary: 'failed' } });
    const other = await seedEvent(db, { ...cena, emails: { summary: 'failed' } });

    for (const token of [seeded.publicId, seeded.resultsId, other.managementToken]) {
      const response = await retry(seeded.publicId, { token });

      expect(response.status, token).toBe(403);
    }
    expect(await storedSummary(seeded.publicId)).toMatchObject({ status: 'failed' });
    expect(await storedSummary(other.publicId)).toMatchObject({ status: 'failed' });
  });

  it('refuses a summary already sent with 409 EMAIL_NOT_FAILED, leaving it sent', async () => {
    const seeded = await seedEvent(db, { ...cena, emails: { summary: 'sent' } });

    const response = await retry(seeded.publicId, { token: seeded.managementToken });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: 'EMAIL_NOT_FAILED' } });
    expect(await storedSummary(seeded.publicId)).toMatchObject({ status: 'sent' });
  });

  it('refuses a cancelled event with 410 and its title', async () => {
    const seeded = await seedEvent(db, { ...cena, outcome: 'cancelled' });

    const response = await retry(seeded.publicId, { token: seeded.managementToken });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });
});

describe('DELETE /api/events/:id against PostgreSQL', () => {
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

  const app = () =>
    createApp({
      ...testDependencies(),
      managedEvents: createManagedEvents(db),
      publicEvents: createPublicEvents(db),
      participations: createParticipations(db),
      results: createEventResults(db),
      now: () => beforeDeadline,
    });

  const cancel = (id: string, credential: { token: string } | { accountId: string }) => {
    const sent = request(app()).delete(`/api/events/${encodeURIComponent(id)}`);
    return 'token' in credential
      ? sent.set('X-Management-Token', credential.token)
      : sent
          .set('Cookie', `${testSessionCookie}=${credential.accountId}`)
          .set('Origin', testTrustedOrigin);
  };

  /** The stored event's own ID and owner, and the IDs of its participations. */
  async function storedEvent(publicId: string) {
    const [event] = await db
      .select({ id: events.id, ownerId: events.ownerId })
      .from(events)
      .where(eq(events.publicId, publicId));
    if (!event) return undefined;
    const cast = await db
      .select({ id: participations.id })
      .from(participations)
      .where(eq(participations.eventId, event.id));
    return { ...event, participationIds: cast.map(({ id }) => id) };
  }

  /** How many rows of each table under the event are left. */
  async function rowsLeft(eventId: string, participationIds: readonly string[]) {
    const count = async (rows: Promise<unknown[]>) => (await rows).length;
    return {
      options: await count(db.select().from(options).where(eq(options.eventId, eventId))),
      participations: await count(
        db.select().from(participations).where(eq(participations.eventId, eventId)),
      ),
      votes: (
        await Promise.all(
          participationIds.map((id) =>
            count(db.select().from(votes).where(eq(votes.participationId, id))),
          ),
        )
      ).reduce((sum, left) => sum + left, 0),
      confirmations: await count(
        db.select().from(confirmations).where(eq(confirmations.eventId, eventId)),
      ),
      emails: await count(
        db.select().from(notifications).where(eq(notifications.eventId, eventId)),
      ),
    };
  }

  const nothingLeft = { options: 0, participations: 0, votes: 0, confirmations: 0, emails: 0 };

  it('deletes the event and everything under it, keeping its title behind its links', async () => {
    const seeded = await seedEvent(db, {
      ...cena,
      emails: { summary: 'sent' },
      outcome: { confirmed: 1 },
    });
    const before = (await storedEvent(seeded.publicId))!;
    expect(await rowsLeft(before.id, before.participationIds)).toEqual({
      options: 2,
      participations: 2,
      votes: 4,
      confirmations: 1,
      emails: 1,
    });

    const response = await cancel(seeded.publicId, { token: seeded.managementToken });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ title: 'Cena de verano' });
    expect(await storedEvent(seeded.publicId)).toBeUndefined();
    expect(await rowsLeft(before.id, before.participationIds)).toEqual(nothingLeft);
    const kept = await db
      .select()
      .from(cancelledEvents)
      .where(eq(cancelledEvents.publicId, seeded.publicId));
    expect(kept).toEqual([
      {
        publicId: seeded.publicId,
        resultsId: seeded.resultsId,
        title: 'Cena de verano',
        cancelledAt: expect.any(Date) as Date,
      },
    ]);
  });

  it('shows every link cancelled afterwards and refuses votes with 410', async () => {
    const seeded = await seedEvent(db, cena);
    const [july6, july10] = seeded.optionIds as [string, string];
    await cancel(seeded.publicId, { token: seeded.managementToken });

    const answers = [
      await request(app()).get(`/api/public/events/${seeded.publicId}`),
      await request(app()).get(`/api/results/${seeded.resultsId}`),
      await request(app())
        .get(`/api/events/${seeded.publicId}`)
        .set('X-Management-Token', seeded.managementToken),
      await request(app())
        .post(`/api/public/events/${seeded.publicId}/participations`)
        .set('X-Vote-Token', randomBytes(16).toString('base64url'))
        .send({ name: 'Pablo', votes: { [july6]: 'available', [july10]: 'available' } }),
    ];

    for (const answer of answers) {
      expect(answer.status).toBe(410);
      expect(answer.body).toMatchObject({
        error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
      });
    }
  });

  it('cancels with the owner’s session', async () => {
    const seeded = await seedEvent(db, cena);
    const { ownerId } = (await storedEvent(seeded.publicId))!;

    const response = await cancel(seeded.publicId, { accountId: ownerId });

    expect(response.status).toBe(200);
    expect(await storedEvent(seeded.publicId)).toBeUndefined();
  });

  it('answers a repeat with 410 and the title', async () => {
    const seeded = await seedEvent(db, cena);
    await cancel(seeded.publicId, { token: seeded.managementToken });

    const again = await cancel(seeded.publicId, { token: seeded.managementToken });

    expect(again.status).toBe(410);
    expect(again.body).toMatchObject({
      error: { code: 'EVENT_CANCELLED', title: 'Cena de verano' },
    });
  });

  it('lets only one of two cancellations sent at once delete it; the other answers as a repeat', async () => {
    const seeded = await seedEvent(db, cena);

    const answers = await Promise.all([
      cancel(seeded.publicId, { token: seeded.managementToken }),
      cancel(seeded.publicId, { token: seeded.managementToken }),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 410]);
    const kept = await db
      .select({ title: cancelledEvents.title })
      .from(cancelledEvents)
      .where(eq(cancelledEvents.publicId, seeded.publicId));
    expect(kept).toEqual([{ title: 'Cena de verano' }]);
  });

  it('refuses the participation link, the results link and another event’s token with 403, deleting nothing', async () => {
    const seeded = await seedEvent(db, cena);
    const other = await seedEvent(db, cena);

    for (const token of [seeded.publicId, seeded.resultsId, other.managementToken]) {
      const response = await cancel(seeded.publicId, { token });

      expect(response.status, token).toBe(403);
    }
    const left = (await storedEvent(seeded.publicId))!;
    expect(await rowsLeft(left.id, left.participationIds)).toMatchObject({
      options: 2,
      participations: 2,
      votes: 4,
    });
    expect(await storedEvent(other.publicId)).toBeDefined();
  });

  it('refuses the session of another account with 403', async () => {
    const seeded = await seedEvent(db, cena);
    const other = await seedEvent(db, {
      ...cena,
      organizer: { name: 'Bea', email: 'bea@example.com' },
    });
    const { ownerId } = (await storedEvent(other.publicId))!;

    const response = await cancel(seeded.publicId, { accountId: ownerId });

    expect(response.status).toBe(403);
    expect(await storedEvent(seeded.publicId)).toBeDefined();
  });
});

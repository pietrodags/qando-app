import { randomUUID } from 'node:crypto';
import type { EventCreated } from '@qando/contracts';
import { closingInstant, validateNewEvent, type NewEvent } from '@qando/domain';
import { asc, eq } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { hashCapabilityToken, newCapabilityToken } from '../../capability-token.js';
import { createDatabase, type Database } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { events, notifications, options, users } from '../../db/schema.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { movingClock } from '../../test/moving-clock.js';
import {
  testDependencies,
  testSessionCookie,
  testTrustedOrigin,
} from '../../test/test-dependencies.js';
import { createManagedEvents } from '../management/managed-events-repository.js';
import { createPublicEvents } from '../public-events/public-events-repository.js';
import { createNewEvents } from './new-events-repository.js';

// 10:00 in Madrid on 15 June 2026.
const morning = new Date('2026-06-15T08:00:00Z');

interface SentOption {
  dates: { kind: 'single'; date: string } | { kind: 'range'; start: string; end: string };
  time: null | { kind: 'single'; at: string } | { kind: 'range'; start: string; end: string };
}

const wholeDay = (date: string): SentOption => ({ dates: { kind: 'single', date }, time: null });
/** Each day from 1 July on, as many as asked. */
const daysFromJuly = (count: number): SentOption[] =>
  Array.from({ length: count }, (_, index) =>
    wholeDay(new Date(Date.UTC(2026, 6, 1 + index)).toISOString().slice(0, 10)),
  );

const onTheSixth = (time: SentOption['time']): SentOption => ({
  dates: { kind: 'single', date: '2026-07-06' },
  time,
});

const cena = {
  title: 'Cena de verano',
  organizerName: 'Ana',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  note: 'Trae postre.',
  anonymous: false,
  // Sent out of order: stored by day, then by time.
  options: [
    onTheSixth({ kind: 'range', start: '20:00', end: '22:00' }),
    { dates: { kind: 'range', start: '2026-07-10', end: '2026-07-12' }, time: null },
    onTheSixth({ kind: 'single', at: '18:00' }),
  ] satisfies SentOption[],
};

describe('POST /api/events against PostgreSQL', () => {
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

  /** A verified account, named or not yet, as signing in with a code leaves it. */
  async function storeAccount(name = ''): Promise<string> {
    const id = randomUUID();
    await db.insert(users).values({ id, name, email: `${id}@example.com`, emailVerified: true });
    return id;
  }

  const app = () =>
    createApp({
      ...testDependencies({ now: morning }),
      newEvents: createNewEvents(db, () => morning),
      publicEvents: createPublicEvents(db),
      managedEvents: createManagedEvents(db),
    });

  /** A request as qando's page sends it, with a management token new unless one is given. */
  const createAs = (accountId: string, body: unknown, token = newCapabilityToken()) =>
    request(app())
      .post('/api/events')
      .set('Cookie', `${testSessionCookie}=${accountId}`)
      .set('Origin', testTrustedOrigin)
      .set('X-Management-Token', token)
      .send(body as object);

  const eventsOf = (accountId: string) =>
    db.select().from(events).where(eq(events.ownerId, accountId));

  /** The emails queued for the account's events. */
  const emailsOf = (accountId: string) =>
    db
      .select({
        type: notifications.type,
        recipient: notifications.recipient,
        scheduledAt: notifications.scheduledAt,
        status: notifications.status,
        attempts: notifications.attempts,
      })
      .from(notifications)
      .innerJoin(events, eq(events.id, notifications.eventId))
      .where(eq(events.ownerId, accountId));

  const nameOf = async (accountId: string) =>
    (await db.select({ name: users.name }).from(users).where(eq(users.id, accountId)))[0]?.name;

  const optionsOf = async (accountId: string) =>
    await db
      .select({ id: options.id })
      .from(options)
      .innerJoin(events, eq(events.id, options.eventId))
      .where(eq(events.ownerId, accountId));

  it('stores the event and its options in order, owned by the account, behind its new links', async () => {
    const ana = await storeAccount();
    const token = newCapabilityToken();

    const response = await createAs(ana, cena, token);

    expect(response.status).toBe(201);
    const links = response.body as EventCreated;
    const [stored, ...others] = await eventsOf(ana);
    expect(others).toEqual([]);
    expect(stored).toMatchObject({
      publicId: links.participationId,
      resultsId: links.resultsId,
      managementTokenHash: hashCapabilityToken(token),
      organizerName: 'Ana',
      organizerEmail: `${ana}@example.com`,
      title: 'Cena de verano',
      note: 'Trae postre.',
      timeZone: 'Europe/Madrid',
      deadline: '2026-07-01',
      closesAt: closingInstant('2026-07-01', 'Europe/Madrid'),
      anonymous: false,
      state: 'open',
    });
    const offered = await db
      .select({
        position: options.position,
        startDate: options.startDate,
        endDate: options.endDate,
        startTime: options.startTime,
        endTime: options.endTime,
      })
      .from(options)
      .where(eq(options.eventId, stored?.id ?? ''))
      .orderBy(asc(options.position));
    expect(offered).toEqual([
      { position: 0, startDate: '2026-07-06', endDate: null, startTime: '18:00:00', endTime: null },
      {
        position: 1,
        startDate: '2026-07-06',
        endDate: null,
        startTime: '20:00:00',
        endTime: '22:00:00',
      },
      {
        position: 2,
        startDate: '2026-07-10',
        endDate: '2026-07-12',
        startTime: null,
        endTime: null,
      },
    ]);
  });

  it('queues the summary to the account, due at once, and "voting closed" for the closing', async () => {
    const ana = await storeAccount();

    await createAs(ana, cena);

    expect(await emailsOf(ana)).toEqual(
      expect.arrayContaining([
        {
          type: 'summary',
          recipient: `${ana}@example.com`,
          scheduledAt: morning,
          status: 'pending',
          attempts: 0,
        },
        {
          type: 'voting_closed',
          recipient: `${ana}@example.com`,
          // A minute after the deadline's 23:59:59.999 in Madrid.
          scheduledAt: new Date('2026-07-01T22:00:59.999Z'),
          status: 'pending',
          attempts: 0,
        },
      ]),
    );
    expect(await emailsOf(ana)).toHaveLength(2);
  });

  it('opens the voting page with the participation link and the management page with the token', async () => {
    const ana = await storeAccount();
    const token = newCapabilityToken();
    const links = (await createAs(ana, cena, token)).body as EventCreated;

    const voting = await request(app()).get(`/api/public/events/${links.participationId}`);
    const managed = await request(app())
      .get(`/api/events/${links.participationId}`)
      .set('X-Management-Token', token);

    expect(voting.status).toBe(200);
    expect(voting.body).toMatchObject({ title: 'Cena de verano', organizerName: 'Ana' });
    expect(managed.status).toBe(200);
    expect(managed.body).toMatchObject({
      participationId: links.participationId,
      resultsId: links.resultsId,
      state: 'open',
    });
  });

  it('names an account without a name after the organizer, and keeps the name of one that has it', async () => {
    const unnamed = await storeAccount();
    const named = await storeAccount('Ana María');

    await createAs(unnamed, { ...cena, organizerName: '  Ana ' });
    await createAs(named, cena);

    expect(await nameOf(unnamed)).toBe('Ana');
    expect(await nameOf(named)).toBe('Ana María');
  });

  it('gives every event links of its own', async () => {
    const ana = await storeAccount();

    const first = (await createAs(ana, cena)).body as EventCreated;
    const second = (await createAs(ana, cena)).body as EventCreated;

    const all = [first, second].flatMap(Object.values);
    expect(new Set(all).size).toBe(4);
    expect(await eventsOf(ana)).toHaveLength(2);
  });

  it('answers a send repeated with the same token with the event it stored, and stores nothing more', async () => {
    const ana = await storeAccount();
    const token = newCapabilityToken();

    const first = await createAs(ana, cena, token);
    const again = await createAs(ana, cena, token);

    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(await eventsOf(ana)).toHaveLength(1);
    expect(await optionsOf(ana)).toHaveLength(3);
    // Its summary and its "voting closed", once.
    expect(await emailsOf(ana)).toHaveLength(2);
  });

  it('stores one event for two sends with the same token at once', async () => {
    const ana = await storeAccount();
    const token = newCapabilityToken();

    const answers = await Promise.all([createAs(ana, cena, token), createAs(ana, cena, token)]);

    expect(answers.map((answer) => answer.status)).toEqual([201, 201]);
    expect(answers[1].body).toEqual(answers[0].body);
    expect(await eventsOf(ana)).toHaveLength(1);
    expect(await optionsOf(ana)).toHaveLength(3);
  });

  it('refuses the token of another account’s event, storing nothing and naming no account', async () => {
    const ana = await storeAccount();
    const bea = await storeAccount();
    const token = newCapabilityToken();
    const first = (await createAs(ana, cena, token)).body as EventCreated;

    const taken = await createAs(bea, { ...cena, organizerName: 'Bea' }, token);

    expect(taken.status).toBe(400);
    expect(taken.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The event was rejected',
        details: [{ code: 'MANAGEMENT_TOKEN_TAKEN' }],
      },
    });
    expect(await eventsOf(bea)).toEqual([]);
    expect(await nameOf(bea)).toBe('');
    expect(await eventsOf(ana)).toMatchObject([{ publicId: first.participationId }]);
  });

  it('stores one event for two accounts sending the same token at once, refusing the other', async () => {
    const ana = await storeAccount();
    const bea = await storeAccount();
    const token = newCapabilityToken();

    const answers = await Promise.all([createAs(ana, cena, token), createAs(bea, cena, token)]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([201, 400]);
    const stored = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.managementTokenHash, hashCapabilityToken(token)));
    expect(stored).toHaveLength(1);
  });

  it.each([
    ['61 options', { options: daysFromJuly(61) }],
    ['a date beyond twelve months', { options: [wholeDay('2027-07-01')] }],
    ['a date before today', { options: [wholeDay('2026-06-14')] }],
    ['minutes off the quarters', { options: [onTheSixth({ kind: 'single', at: '18:10' })] }],
    ['two equal options', { options: [wholeDay('2026-07-06'), wholeDay('2026-07-06')] }],
    [
      'a time range that ends first',
      { options: [onTheSixth({ kind: 'range', start: '20:00', end: '19:00' })] },
    ],
    [
      'a time range within one clock hour',
      { options: [onTheSixth({ kind: 'range', start: '20:00', end: '20:30' })] },
    ],
    ['a deadline before today', { deadline: '2026-06-14' }],
    ['no title', { title: ' ' }],
    ['a note too long', { note: 'a'.repeat(151) }],
    ['a body that breaks the contract', { timeZone: 'Europe/Atlantis' }],
  ])('stores nothing for an event with %s, and names no account', async (_name, change) => {
    const ana = await storeAccount();

    const response = await createAs(ana, { ...cena, ...change });

    expect(response.status).toBe(400);
    expect(await eventsOf(ana)).toEqual([]);
    expect(await nameOf(ana)).toBe('');
  });

  describe('for an assistant, which sends no token (createOnce)', () => {
    const rules = { sameWithinMs: 10 * 60_000, atMost: { count: 10, withinMs: 60 * 60_000 } };
    const minute = 60_000;

    /** The event as the domain checked it, with what is said changed. */
    const checked = (changes: Partial<typeof cena> = {}): NewEvent => {
      const validation = validateNewEvent({ ...cena, ...changes }, morning);
      if (!validation.ok) throw new Error('The event of the test breaks a rule');
      return validation.event;
    };

    /** The repository on a clock of its own, from 10:00 in Madrid on 15 June 2026. */
    const onAClock = () => {
      const clock = movingClock(morning);
      return { clock, newEvents: createNewEvents(db, clock.now) };
    };

    it('stores the event with a management token of its own, stamped at the clock’s time, queues its emails and answers its links', async () => {
      const ana = await storeAccount('Ana');
      const { clock, newEvents } = onAClock();
      clock.advance(minute);

      const links = await newEvents.createOnce(ana, checked(), rules);

      const [stored] = await eventsOf(ana);
      expect(links).toEqual({ participationId: stored?.publicId, resultsId: stored?.resultsId });
      expect(stored?.createdAt).toEqual(clock.now());
      expect(stored?.managementTokenHash).toMatch(/^.{20,}$/);
      expect((await emailsOf(ana)).map(({ type }) => type).sort()).toEqual([
        'summary',
        'voting_closed',
      ]);
      expect(await optionsOf(ana)).toHaveLength(3);
    });

    it('stamps an event sent with a token at the clock’s time too', async () => {
      const ana = await storeAccount('Ana');
      const { clock, newEvents } = onAClock();
      clock.advance(minute);

      await newEvents.create(ana, newCapabilityToken(), checked());

      expect((await eventsOf(ana)).map(({ createdAt }) => createdAt)).toEqual([clock.now()]);
    });

    it('answers the same event again within 10 minutes with the first one, storing and queuing nothing more', async () => {
      const ana = await storeAccount('Ana');
      const { clock, newEvents } = onAClock();
      const first = await newEvents.createOnce(ana, checked(), rules);
      clock.advance(10 * minute - 1);

      const again = await newEvents.createOnce(ana, checked(), rules);

      expect(again).toEqual(first);
      expect(await eventsOf(ana)).toHaveLength(1);
      expect(await emailsOf(ana)).toHaveLength(2);
    });

    it('answers the same event without a note again with the first one', async () => {
      const ana = await storeAccount('Ana');
      const { newEvents } = onAClock();
      const first = await newEvents.createOnce(ana, checked({ note: '' }), rules);

      expect(await newEvents.createOnce(ana, checked({ note: '' }), rules)).toEqual(first);
      expect(await eventsOf(ana)).toHaveLength(1);
    });

    it('stores the same event again from 10 minutes on', async () => {
      const ana = await storeAccount('Ana');
      const { clock, newEvents } = onAClock();
      const first = await newEvents.createOnce(ana, checked(), rules);
      clock.advance(10 * minute);

      const again = await newEvents.createOnce(ana, checked(), rules);

      expect(again).not.toEqual(first);
      expect(await eventsOf(ana)).toHaveLength(2);
    });

    it.each([
      ['another title', { title: 'Cena de otoño' }],
      ['another deadline', { deadline: '2026-07-02' }],
      ['one option less', { options: cena.options.slice(1) }],
      [
        'another time',
        { options: [onTheSixth({ kind: 'single', at: '18:15' }), ...cena.options.slice(1)] },
      ],
      // Its days and times are read in another zone: other moments, and another closing.
      ['another time zone', { timeZone: 'America/New_York' }],
      ['voting without names', { anonymous: true }],
      ['another note', { note: 'Otra nota.' }],
      ['no note', { note: '' }],
      ['another organizer name', { organizerName: 'Ana G.' }],
    ])('stores an event with %s as a new one', async (_case, changes) => {
      const ana = await storeAccount('Ana');
      const { newEvents } = onAClock();
      const first = await newEvents.createOnce(ana, checked(), rules);

      const other = await newEvents.createOnce(ana, checked(changes), rules);

      expect(other).not.toEqual(first);
      expect(await eventsOf(ana)).toHaveLength(2);
    });

    it('answers the same event created in the web with its links', async () => {
      const ana = await storeAccount('Ana');
      const { newEvents } = onAClock();
      const fromTheWeb = await newEvents.create(ana, newCapabilityToken(), checked());

      expect(await newEvents.createOnce(ana, checked(), rules)).toEqual(fromTheWeb);
      expect(await eventsOf(ana)).toHaveLength(1);
    });

    it('never answers another account’s event', async () => {
      const ana = await storeAccount('Ana');
      const bea = await storeAccount('Bea');
      const { newEvents } = onAClock();
      const anas = await newEvents.createOnce(ana, checked(), rules);

      expect(await newEvents.createOnce(bea, checked(), rules)).not.toEqual(anas);
      expect(await eventsOf(bea)).toHaveLength(1);
    });

    it('stores one event for two calls at once', async () => {
      const ana = await storeAccount('Ana');
      const { newEvents } = onAClock();

      const [one, other] = await Promise.all([
        newEvents.createOnce(ana, checked(), rules),
        newEvents.createOnce(ana, checked(), rules),
      ]);

      expect(other).toEqual(one);
      expect(await eventsOf(ana)).toHaveLength(1);
      expect(await emailsOf(ana)).toHaveLength(2);
    });

    it('stores nothing once the account created 10 events in the last hour, whatever created them, and answers when the first leaves the hour', async () => {
      const ana = await storeAccount('Ana');
      const { clock, newEvents } = onAClock();
      const firstAt = clock.now();
      await newEvents.create(ana, newCapabilityToken(), checked({ title: 'Evento 1' }));
      for (let number = 2; number <= 10; number += 1) {
        clock.advance(minute);
        await newEvents.createOnce(ana, checked({ title: `Evento ${String(number)}` }), rules);
      }
      clock.advance(minute);

      const refused = await newEvents.createOnce(ana, checked({ title: 'Evento 11' }), rules);

      expect(refused).toEqual({ retryAt: new Date(firstAt.getTime() + 60 * minute) });
      expect(await eventsOf(ana)).toHaveLength(10);
      expect(await emailsOf(ana)).toHaveLength(20);
    });

    it('stores the next event once the first of the 10 has left the hour, and still answers the same event within the hour', async () => {
      const ana = await storeAccount('Ana');
      const { clock, newEvents } = onAClock();
      const tenth = { title: 'Evento 10' };
      for (let number = 1; number <= 10; number += 1) {
        await newEvents.createOnce(ana, checked({ title: `Evento ${String(number)}` }), rules);
        if (number < 10) clock.advance(5 * minute);
      }
      const lastLinks = (await eventsOf(ana)).find(({ title }) => title === tenth.title);
      clock.advance(minute);

      expect(await newEvents.createOnce(ana, checked(tenth), rules)).toEqual({
        participationId: lastLinks?.publicId,
        resultsId: lastLinks?.resultsId,
      });
      clock.advance(60 * minute - 46 * minute - 1);
      expect(
        await newEvents.createOnce(ana, checked({ title: 'Evento 11' }), rules),
      ).toHaveProperty('retryAt');
      clock.advance(1);
      expect(
        await newEvents.createOnce(ana, checked({ title: 'Evento 11' }), rules),
      ).toHaveProperty('participationId');
      expect(await eventsOf(ana)).toHaveLength(11);
    });
  });

  describe('the name of the account’s last event (lastOrganizerName)', () => {
    it('answers none for an account without events', async () => {
      const ana = await storeAccount('Ana');

      expect(await createNewEvents(db, () => morning).lastOrganizerName(ana)).toBeUndefined();
    });

    it('answers the organizer name of the account’s most recently created event, never another account’s', async () => {
      const ana = await storeAccount();
      const bea = await storeAccount();
      const clock = movingClock(morning);
      const newEvents = createNewEvents(db, clock.now);
      const named = (organizerName: string, title: string) => {
        const validation = validateNewEvent({ ...cena, organizerName, title }, morning);
        if (!validation.ok) throw new Error('The event of the test breaks a rule');
        return validation.event;
      };
      await newEvents.create(ana, newCapabilityToken(), named('Ana', 'Primero'));
      clock.advance(60_000);
      await newEvents.create(ana, newCapabilityToken(), named('Ana G.', 'Segundo'));
      clock.advance(60_000);
      await newEvents.create(bea, newCapabilityToken(), named('Bea', 'Tercero'));

      expect(await newEvents.lastOrganizerName(ana)).toBe('Ana G.');
    });
  });

  describe('when a step of the transaction fails', () => {
    const valid: NewEvent = {
      organizerName: 'Ana',
      title: 'Cena de verano',
      note: null,
      timeZone: 'Europe/Madrid',
      deadline: '2026-07-01',
      closesAt: closingInstant('2026-07-01', 'Europe/Madrid'),
      anonymous: false,
      options: [{ dates: { kind: 'single', date: '2026-07-06' }, time: null }],
    };

    it('stores no event, queues no email and leaves the account unnamed when its options cannot be stored', async () => {
      const ana = await storeAccount();
      // Past the domain, an option the database refuses: a time range that ends first.
      const broken: NewEvent = {
        ...valid,
        options: [
          ...valid.options,
          {
            dates: { kind: 'single', date: '2026-07-10' },
            time: { kind: 'range', start: '22:00', end: '20:00' },
          },
        ],
      };

      await expect(
        createNewEvents(db, () => morning).create(ana, newCapabilityToken(), broken),
      ).rejects.toThrow();

      expect(await eventsOf(ana)).toEqual([]);
      expect(await optionsOf(ana)).toEqual([]);
      expect(await nameOf(ana)).toBe('');
      expect(
        await db
          .select()
          .from(notifications)
          .where(eq(notifications.recipient, `${ana}@example.com`)),
      ).toEqual([]);
    });

    it('stores nothing for an account that no longer exists, from the web or an assistant', async () => {
      const gone = randomUUID();
      const newEvents = createNewEvents(db, () => morning);
      const noAccount = 'The account of the session no longer exists';

      await expect(newEvents.create(gone, newCapabilityToken(), valid)).rejects.toThrow(noAccount);
      await expect(
        newEvents.createOnce(gone, valid, {
          sameWithinMs: 600_000,
          atMost: { count: 10, withinMs: 3_600_000 },
        }),
      ).rejects.toThrow(noAccount);

      expect(await eventsOf(gone)).toEqual([]);
    });
  });
});

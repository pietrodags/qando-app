import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFreshDatabase, type FreshDatabase } from '../test/fresh-database.js';
import { runMigrations } from './migrate.js';
import * as schema from './schema.js';
import { events, options, participations, votes } from './schema.js';

describe('database schema', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: NodePgDatabase<typeof schema>;

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    db = drizzle({ client: pool, schema });
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  const token = () => randomBytes(16).toString('base64url');

  async function insertEvent(values: Partial<typeof events.$inferInsert> = {}) {
    const [event] = await db
      .insert(events)
      .values({
        publicId: token(),
        resultsId: token(),
        managementTokenHash: token(),
        organizerName: 'Ana',
        organizerEmail: 'ana@example.com',
        title: 'Cena de equipo',
        timeZone: 'Europe/Madrid',
        deadline: '2026-12-01',
        closesAt: new Date('2026-12-01T22:59:59Z'),
        anonymous: false,
        ...values,
      })
      .returning();
    return event!;
  }

  async function insertOption(
    eventId: string,
    values: Partial<typeof options.$inferInsert> & { position: number },
  ) {
    const [option] = await db
      .insert(options)
      .values({ eventId, startDate: '2026-12-10', ...values })
      .returning();
    return option!;
  }

  async function insertParticipation(eventId: string, name: string | null = 'Bea') {
    const [participation] = await db
      .insert(participations)
      .values({ eventId, name, editTokenHash: token() })
      .returning();
    return participation!;
  }

  /** Runs `write` and expects PostgreSQL to refuse it with `constraint`. */
  async function expectRefusedBy(constraint: string, write: () => Promise<unknown>) {
    const error: unknown = await write().then(
      () => undefined,
      (refusal: unknown) => refusal,
    );
    expect(error, `expected ${constraint} to refuse the write`).toBeInstanceOf(Error);
    expect((error as Error).cause).toMatchObject({ constraint });
  }

  it('stores an event with its options, a participation and its votes, and reads them back', async () => {
    const event = await insertEvent({ note: 'En el sitio de siempre' });
    const wholeDay = await insertOption(event.id, { position: 0, startDate: '2026-12-10' });
    const range = await insertOption(event.id, {
      position: 1,
      startDate: '2026-12-12',
      endDate: '2026-12-14',
    });
    const evening = await insertOption(event.id, {
      position: 2,
      startDate: '2026-12-11',
      startTime: '20:00',
      endTime: '23:30',
    });
    const participation = await insertParticipation(event.id);
    await db.insert(votes).values([
      {
        participationId: participation.id,
        optionId: wholeDay.id,
        eventId: event.id,
        state: 'available',
      },
      {
        participationId: participation.id,
        optionId: range.id,
        eventId: event.id,
        state: 'preferred',
      },
      {
        participationId: participation.id,
        optionId: evening.id,
        eventId: event.id,
        state: 'unavailable',
      },
    ]);

    const stored = await db.query.events.findFirst({
      where: eq(events.id, event.id),
      with: {
        options: { orderBy: options.position },
        participations: { with: { votes: true } },
      },
    });

    expect(stored).toMatchObject({
      title: 'Cena de equipo',
      note: 'En el sitio de siempre',
      deadline: '2026-12-01',
      closesAt: new Date('2026-12-01T22:59:59Z'),
      state: 'open',
      options: [
        { startDate: '2026-12-10', endDate: null, startTime: null, endTime: null },
        { startDate: '2026-12-12', endDate: '2026-12-14', startTime: null, endTime: null },
        { startDate: '2026-12-11', endDate: null, startTime: '20:00:00', endTime: '23:30:00' },
      ],
      participations: [{ name: 'Bea' }],
    });
    expect(stored?.createdAt).toBeInstanceOf(Date);
    expect(stored?.participations[0]?.updatedAt).toBeInstanceOf(Date);
    expect(
      Object.fromEntries(
        stored!.participations[0]!.votes.map((vote) => [vote.optionId, vote.state]),
      ),
    ).toEqual({ [wholeDay.id]: 'available', [range.id]: 'preferred', [evening.id]: 'unavailable' });
  });

  it('stores an anonymous participation without a name', async () => {
    const event = await insertEvent({ anonymous: true });

    const participation = await insertParticipation(event.id, null);

    expect(participation.name).toBeNull();
  });

  describe('capability links and tokens are unique', () => {
    it.each([
      ['events_public_id_unique', 'publicId'],
      ['events_results_id_unique', 'resultsId'],
      ['events_management_token_hash_unique', 'managementTokenHash'],
    ] as const)('%s', async (constraint, column) => {
      const event = await insertEvent();

      await expectRefusedBy(constraint, () => insertEvent({ [column]: event[column] }));
    });

    it('participations_edit_token_hash_unique', async () => {
      const event = await insertEvent();
      const participation = await insertParticipation(event.id);

      await expectRefusedBy('participations_edit_token_hash_unique', () =>
        db
          .insert(participations)
          .values({ eventId: event.id, name: 'Carla', editTokenHash: participation.editTokenHash }),
      );
    });
  });

  describe('options', () => {
    it.each([
      [
        'a date range that does not end after it starts',
        { endDate: '2026-12-10' },
        'options_date_range',
      ],
      [
        'an end time that is not after the start time',
        { startTime: '20:00', endTime: '20:00' },
        'options_time_range',
      ],
      ['an end time without a start time', { endTime: '20:00' }, 'options_time_range'],
      [
        'times on a date range',
        { endDate: '2026-12-12', startTime: '20:00' },
        'options_times_on_single_date',
      ],
    ] as const)('refuses %s', async (_case, values, constraint) => {
      const event = await insertEvent();

      await expectRefusedBy(constraint, () =>
        insertOption(event.id, { position: 0, startDate: '2026-12-10', ...values }),
      );
    });

    it.each([
      ['a whole day', {}],
      ['a date range', { endDate: '2026-12-12' }],
      ['a start time', { startTime: '20:00' }],
      ['a time range', { startTime: '20:00', endTime: '22:00' }],
    ] as const)('refuses the same %s twice in one event', async (_case, values) => {
      const event = await insertEvent();
      await insertOption(event.id, { position: 0, ...values });

      await expectRefusedBy('options_unique_slot', () =>
        insertOption(event.id, { position: 1, ...values }),
      );
    });

    it('accepts the same date in two events, and different times on one date', async () => {
      const first = await insertEvent();
      const second = await insertEvent();

      await insertOption(first.id, { position: 0 });
      await insertOption(second.id, { position: 0 });
      await insertOption(first.id, { position: 1, startTime: '10:00' });
      await insertOption(first.id, { position: 2, startTime: '10:00', endTime: '12:00' });

      const stored = await db.select().from(options).where(eq(options.eventId, first.id));
      expect(stored).toHaveLength(3);
    });

    it('refuses two options in the same position', async () => {
      const event = await insertEvent();
      await insertOption(event.id, { position: 0 });

      await expectRefusedBy('options_unique_position', () =>
        insertOption(event.id, { position: 0, startDate: '2026-12-11' }),
      );
    });
  });

  describe('votes', () => {
    it('refuses a vote for an option of another event', async () => {
      const event = await insertEvent();
      const other = await insertEvent();
      const foreignOption = await insertOption(other.id, { position: 0 });
      const participation = await insertParticipation(event.id);

      await expectRefusedBy('votes_option_same_event_fk', () =>
        db.insert(votes).values({
          participationId: participation.id,
          optionId: foreignOption.id,
          eventId: event.id,
          state: 'available',
        }),
      );
      await expectRefusedBy('votes_participation_same_event_fk', () =>
        db.insert(votes).values({
          participationId: participation.id,
          optionId: foreignOption.id,
          eventId: other.id,
          state: 'available',
        }),
      );
    });

    it('refuses a second answer to the same option', async () => {
      const event = await insertEvent();
      const option = await insertOption(event.id, { position: 0 });
      const participation = await insertParticipation(event.id);
      const vote = { participationId: participation.id, optionId: option.id, eventId: event.id };
      await db.insert(votes).values({ ...vote, state: 'available' });

      await expectRefusedBy('votes_pkey', () =>
        db.insert(votes).values({ ...vote, state: 'unavailable' }),
      );
    });

    it('accepts one preferred option per participation, never two', async () => {
      const event = await insertEvent();
      const first = await insertOption(event.id, { position: 0 });
      const second = await insertOption(event.id, { position: 1, startDate: '2026-12-11' });
      const bea = await insertParticipation(event.id, 'Bea');
      const carla = await insertParticipation(event.id, 'Carla');
      const preferred = (participationId: string, optionId: string) => ({
        participationId,
        optionId,
        eventId: event.id,
        state: 'preferred' as const,
      });

      await db.insert(votes).values([preferred(bea.id, first.id), preferred(carla.id, first.id)]);

      await expectRefusedBy('votes_one_preferred', () =>
        db.insert(votes).values(preferred(bea.id, second.id)),
      );
    });
  });

  it('deleting an event deletes its options, participations and votes', async () => {
    const event = await insertEvent();
    const kept = await insertEvent();
    const option = await insertOption(event.id, { position: 0 });
    const keptOption = await insertOption(kept.id, { position: 0 });
    const participation = await insertParticipation(event.id);
    await db.insert(votes).values({
      participationId: participation.id,
      optionId: option.id,
      eventId: event.id,
      state: 'available',
    });

    await db.delete(events).where(eq(events.id, event.id));

    expect(await db.select().from(options).where(eq(options.eventId, event.id))).toEqual([]);
    expect(
      await db.select().from(participations).where(eq(participations.eventId, event.id)),
    ).toEqual([]);
    expect(await db.select().from(votes).where(eq(votes.eventId, event.id))).toEqual([]);
    expect(await db.select().from(options).where(eq(options.id, keptOption.id))).toHaveLength(1);
  });
});

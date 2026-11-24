import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/database.js';
import { runMigrations } from '../db/migrate.js';
import { cancelledEvents, events, users } from '../db/schema.js';
import { seedEvent, type EventSeed } from '../seed/seed-event.js';
import { storedRows } from '../seed/stored-rows.js';
import { storedVotes } from '../seed/stored-votes.js';
import { createFreshDatabase, type FreshDatabase } from '../test/fresh-database.js';
import { deleteParticipant } from './participant-deletion.js';

const anyDate: unknown = expect.any(Date);

/** Ana's "Cena de verano", confirmed for Saturday 18 July 2026, with three votes. */
const cena: EventSeed = {
  title: 'Cena de verano',
  options: ['2026-07-11', '2026-07-18'],
  deadline: '2026-06-30',
  votes: [
    { name: 'Luis', states: ['available', 'preferred'] },
    { name: 'Marta López', states: ['unavailable', 'available'] },
    { name: 'Pablo', states: ['available', 'available'] },
  ],
  outcome: { confirmed: 1 },
};

/** An anonymous event: its votes have no name. */
const cafe: EventSeed = {
  title: 'Café',
  options: ['2026-07-02'],
  deadline: '2026-07-01',
  anonymous: true,
  votes: [{ states: ['available'] }, { states: ['unavailable'] }],
};

describe('deleting one participant from one event, against PostgreSQL', () => {
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

  beforeEach(async () => {
    await db.delete(events);
    await db.delete(cancelledEvents);
    await db.delete(users);
  });

  // The votes of one seed are cast at the same instant, so they are read in no fixed order.
  const byName = async (publicId: string) =>
    (await storedVotes(db, publicId)).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const names = async (publicId: string) => (await byName(publicId)).map(({ name }) => name);

  describe('by the edit link', () => {
    it('says the vote it holds and deletes nothing without the confirmation', async () => {
      const seeded = await seedEvent(db, cena);
      const marta = seeded.votes[1]!;

      const deletion = await deleteParticipant(
        db,
        { publicId: seeded.publicId, token: marta.token },
        false,
      );

      expect(deletion).toEqual({
        outcome: 'found',
        title: 'Cena de verano',
        vote: { name: 'Marta López', castAt: anyDate },
      });
      expect(await names(seeded.publicId)).toEqual(['Luis', 'Marta López', 'Pablo']);
    });

    it('deletes that vote with its answers, and nothing else of the event', async () => {
      const seeded = await seedEvent(db, cena);
      const marta = seeded.votes[1]!;

      const deletion = await deleteParticipant(
        db,
        { publicId: seeded.publicId, token: marta.token },
        true,
      );

      expect(deletion).toEqual({
        outcome: 'deleted',
        title: 'Cena de verano',
        vote: { name: 'Marta López', castAt: anyDate },
      });
      expect(await byName(seeded.publicId)).toEqual([
        { name: 'Luis', states: ['available', 'preferred'] },
        { name: 'Pablo', states: ['available', 'available'] },
      ]);
      expect(await storedRows(db, seeded.eventId!)).toEqual({
        options: 2,
        participations: 2,
        votes: 4,
        confirmations: 1,
        emails: 0,
      });
    });

    it('says when the vote was cast', async () => {
      const before = new Date();
      const seeded = await seedEvent(db, cena);
      const after = new Date();

      const deletion = await deleteParticipant(
        db,
        { publicId: seeded.publicId, token: seeded.votes[0]!.token },
        false,
      );

      const castAt = deletion.outcome === 'found' ? deletion.vote.castAt.getTime() : NaN;
      expect(castAt).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(castAt).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it('deletes a vote of an anonymous event, which has no name', async () => {
      const seeded = await seedEvent(db, cafe);

      const deletion = await deleteParticipant(
        db,
        { publicId: seeded.publicId, token: seeded.votes[0]!.token },
        true,
      );

      expect(deletion).toEqual({
        outcome: 'deleted',
        title: 'Café',
        vote: { name: null, castAt: anyDate },
      });
      expect(await storedVotes(db, seeded.publicId)).toEqual([{ states: ['unavailable'] }]);
    });

    it('finds no vote for a token of another event, nor for a vote already deleted', async () => {
      const seeded = await seedEvent(db, cena);
      const other = await seedEvent(db, { ...cena, title: 'Comida' });
      const marta = { publicId: seeded.publicId, token: seeded.votes[1]!.token };
      await deleteParticipant(db, marta, true);

      expect(
        await deleteParticipant(
          db,
          { publicId: seeded.publicId, token: other.votes[1]!.token },
          true,
        ),
      ).toEqual({ outcome: 'no vote', title: 'Cena de verano' });
      expect(await deleteParticipant(db, marta, true)).toEqual({
        outcome: 'no vote',
        title: 'Cena de verano',
      });
      expect(await names(other.publicId)).toEqual(['Luis', 'Marta López', 'Pablo']);
    });
  });

  describe('by the name', () => {
    it('deletes the one vote of that name, whatever the case and the spaces', async () => {
      const seeded = await seedEvent(db, cena);

      const found = await deleteParticipant(
        db,
        { publicId: seeded.publicId, name: '  marta   LÓPEZ ' },
        false,
      );
      const deleted = await deleteParticipant(
        db,
        { publicId: seeded.publicId, name: '  marta   LÓPEZ ' },
        true,
      );

      expect(found).toEqual({
        outcome: 'found',
        title: 'Cena de verano',
        vote: { name: 'Marta López', castAt: anyDate },
      });
      expect(deleted).toEqual({
        outcome: 'deleted',
        title: 'Cena de verano',
        vote: { name: 'Marta López', castAt: anyDate },
      });
      expect(await names(seeded.publicId)).toEqual(['Luis', 'Pablo']);
    });

    it('needs the same letters and accents', async () => {
      const seeded = await seedEvent(db, cena);

      expect(
        await deleteParticipant(db, { publicId: seeded.publicId, name: 'Marta Lopez' }, true),
      ).toEqual({ outcome: 'no vote', title: 'Cena de verano' });
      expect(await names(seeded.publicId)).toEqual(['Luis', 'Marta López', 'Pablo']);
    });

    it('deletes none when several votes have that name', async () => {
      const seeded = await seedEvent(db, {
        ...cena,
        votes: [
          { name: 'Marta', states: ['available', 'preferred'] },
          { name: 'Luis', states: ['available', 'available'] },
          { name: 'marta', states: ['unavailable', 'available'] },
        ],
      });

      expect(
        await deleteParticipant(db, { publicId: seeded.publicId, name: 'Marta' }, true),
      ).toEqual({ outcome: 'several', title: 'Cena de verano', count: 2 });
      expect(await names(seeded.publicId)).toEqual(['Luis', 'marta', 'Marta']);
    });

    it('identifies no vote of an anonymous event', async () => {
      const seeded = await seedEvent(db, cafe);

      expect(
        await deleteParticipant(db, { publicId: seeded.publicId, name: 'Marta' }, true),
      ).toEqual({ outcome: 'anonymous', title: 'Café' });
      expect(await storedRows(db, seeded.eventId!)).toMatchObject({ participations: 2 });
    });
  });

  it('says a cancelled event has no votes left', async () => {
    const seeded = await seedEvent(db, { ...cena, outcome: 'cancelled' });

    expect(
      await deleteParticipant(db, { publicId: seeded.publicId, name: 'Marta López' }, true),
    ).toEqual({ outcome: 'cancelled', title: 'Cena de verano' });
    // Its votes went with it, and so did their tokens: any edit link answers the same.
    expect(
      await deleteParticipant(
        db,
        { publicId: seeded.publicId, token: 'Hy4mQ7vZ2xT9bLm4Np0RsA' },
        true,
      ),
    ).toEqual({ outcome: 'cancelled', title: 'Cena de verano' });
  });

  it('says no event has a link that leads nowhere', async () => {
    await seedEvent(db, cena);

    expect(
      await deleteParticipant(
        db,
        { publicId: 'k3JdQ9vZ2xT9bLm4Np0Rs8', name: 'Marta López' },
        true,
      ),
    ).toEqual({ outcome: 'no event' });
  });
});

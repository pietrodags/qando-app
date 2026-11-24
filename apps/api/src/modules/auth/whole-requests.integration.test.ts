import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { accounts, sessions, users, verifications } from '../../db/schema.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { wholeRequests, type Queries, type WholeRequests } from './whole-requests.js';

// One connection in the pool, so a request that kept its own while it waited, or needed a second
// one, would wait for ever: these tests also say what a request holds.
describe('requests whose writes are kept whole or not at all, against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: Database;
  let whole: WholeRequests;
  /**
   * The sign-in library's adapter on qando's tables, as `createAuth` sets it up: what a request
   * gives or takes is a code.
   */
  let library: ReturnType<ReturnType<WholeRequests['adapter']>>;

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url, max: 1 });
    await runMigrations(pool);
    db = createDatabase(pool);
    whole = wholeRequests(db);
    library = whole.adapter(
      (queries) =>
        drizzleAdapter(queries, {
          provider: 'pg',
          schema: { users, sessions, accounts, verifications },
          usePlural: true,
          transaction: true,
        }),
      ['verification'],
    )({});
  });

  afterEach(async () => {
    await pool.query(`
      DROP TRIGGER IF EXISTS refused_at_commit ON users;
      DROP FUNCTION IF EXISTS refuse();
      DELETE FROM verifications;
      DELETE FROM users`);
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  /** Stores an account under the name, as a request of the test writes it. */
  const store = (name: string) => (queries: Queries) =>
    queries.insert(users).values({ id: name, name, email: `${name}@example.com` });

  /** The names stored, as any other request sees them: read through the pool. */
  const stored = async () =>
    (await db.select({ name: users.name }).from(users)).map(({ name }) => name).sort();

  /** Stores an account under the name, as the sign-in library writes it. */
  const account = (name: string) => ({
    model: 'user',
    data: { id: name, name, email: `${name}@example.com`, emailVerified: true },
    forceAllowId: true,
  });

  /** Reads a code, as a request does that is about to give or take something for it. */
  const readACode = () =>
    library.findOne({ model: 'verification', where: [{ field: 'identifier', value: 'a code' }] });

  /** Runs the work as a request that answers the status once it is done. */
  const asked = (status: number, work: () => Promise<unknown>) =>
    whole.asOne(async () => {
      await work();
      return new Response(null, { status });
    })(new Request('http://localhost/'));

  /** Runs the work as a request that has read its code, so all it writes is whole. */
  const request = (status: number, work: () => Promise<unknown>) =>
    asked(status, async () => {
      await readACode();
      await work();
    });

  /** Makes the database refuse, when a transaction commits, the accounts it stored. */
  const refuseAtCommit = () =>
    pool.query(`
      CREATE FUNCTION refuse() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'refused by the test'; END $$;
      CREATE CONSTRAINT TRIGGER refused_at_commit AFTER INSERT ON users
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION refuse()`);

  describe('until a request reads or writes what it gives or takes', () => {
    it('is as any other request: what it writes is kept at once, though it then fails', async () => {
      let seenMeanwhile: string[] = [];

      const answer = await asked(500, async () => {
        await whole.write(store('ana'));
        await library.create(account('bea'));
        // Kept already, and the pool's only connection is free: the request holds none.
        seenMeanwhile = await stored();
      });

      expect(answer.status).toBe(500);
      expect(seenMeanwhile).toEqual(['ana', 'bea']);
      expect(await stored()).toEqual(['ana', 'bea']);
    });

    it('keeps at once a transaction of the library, though the request then fails', async () => {
      let seenMeanwhile: string[] = [];

      await asked(500, async () => {
        await library.transaction(async (transaction) => {
          await transaction.create(account('ana'));
        });
        seenMeanwhile = await stored();
      });

      expect(seenMeanwhile).toEqual(['ana']);
      expect(await stored()).toEqual(['ana']);
    });

    it('is whole from the read of its code on: what it writes afterwards is undone if it fails, what it wrote before stays', async () => {
      await asked(500, async () => {
        await whole.write(store('ana'));
        await readACode();
        await whole.write(store('bea'));
        await library.create(account('carla'));
        await library.transaction(async (transaction) => {
          await transaction.create(account('dora'));
        });
      });

      expect(await stored()).toEqual(['ana']);
    });

    it('is whole from a write of a code too, which is undone with the rest if it fails', async () => {
      await asked(500, async () => {
        await library.create({
          model: 'verification',
          data: { identifier: 'a code', value: 'given', expiresAt: new Date('2030-01-01') },
        });
        await whole.write(store('ana'));
      });

      const codes = await pool.query('SELECT count(*)::int AS kept FROM verifications');
      expect(codes.rows).toEqual([{ kept: 0 }]);
      expect(await stored()).toEqual([]);
    });
  });

  it('keeps nothing of a request until it is answered, and then all of it', async () => {
    let seenMeanwhile: unknown[] = [];
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();

    const answer = await request(200, async () => {
      await whole.write(store('ana'));
      await whole.write(store('bea'));
      seenMeanwhile = (await client.query('SELECT name FROM users')).rows;
    });
    await client.end();

    expect(answer.status).toBe(200);
    expect(seenMeanwhile).toEqual([]);
    expect(await stored()).toEqual(['ana', 'bea']);
  });

  it('keeps what a refused request wrote: a refusal is an answer', async () => {
    await request(400, () => whole.write(store('ana')));

    expect(await stored()).toEqual(['ana']);
  });

  it('undoes all a request wrote when it answers a fault', async () => {
    const answer = await request(500, async () => {
      await whole.write(store('ana'));
      await whole.write(store('bea'));
    });

    expect(answer.status).toBe(500);
    expect(await stored()).toEqual([]);
  });

  it('undoes all a request wrote when it fails, and fails as it did', async () => {
    const failed = request(200, async () => {
      await whole.write(store('ana'));
      throw new Error('failed midway');
    });

    await expect(failed).rejects.toThrow('failed midway');
    expect(await stored()).toEqual([]);
  });

  it('undoes only the write that fails: the request goes on and keeps the others', async () => {
    let refused: unknown;

    await request(200, async () => {
      await whole.write(store('ana'));
      refused = await whole.write(store('ana')).catch((error: unknown) => error);
      await whole.write(store('bea'));
    });

    expect(refused).toBeInstanceOf(Error);
    expect(await stored()).toEqual(['ana', 'bea']);
  });

  it('takes the writes a request sends at once one at a time, each undone on its own', async () => {
    let outcomes: PromiseSettledResult<unknown>[] = [];

    await request(200, async () => {
      await whole.write(store('ana'));
      outcomes = await Promise.allSettled([
        whole.write(store('bea')),
        whole.write(store('ana')),
        whole.write(store('carla')),
      ]);
    });

    expect(outcomes.map(({ status }) => status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(await stored()).toEqual(['ana', 'bea', 'carla']);
  });

  it('fails a request whose writes cannot be committed, whatever it answered, and keeps none', async () => {
    await refuseAtCommit();

    const failed = request(200, () => whole.write(store('ana')));

    await expect(failed).rejects.toThrow('Failed query: commit');
    expect(await stored()).toEqual([]);
  });

  it('writes straight to the database outside a request', async () => {
    await whole.write(store('ana'));

    expect(await stored()).toEqual(['ana']);
  });

  describe('a wait for another server', () => {
    it('commits first what the request wrote and holds no connection meanwhile', async () => {
      let seenMeanwhile: string[] = [];

      await request(500, async () => {
        await whole.write(store('ana'));
        // The pool's only connection answers: the request gave its own back before waiting.
        await whole.waiting(async () => {
          seenMeanwhile = await stored();
        });
        await whole.write(store('bea'));
      });

      expect(seenMeanwhile).toEqual(['ana']);
      // What was written after the wait is undone with the fault; what came before is kept.
      expect(await stored()).toEqual(['ana']);
    });

    it('answers what the wait answers, and waits at once when nothing was written', async () => {
      let waited: string | undefined;

      await request(200, async () => {
        waited = await whole.waiting(() => Promise.resolve('the document'));
      });

      expect(waited).toBe('the document');
      expect(await whole.waiting(() => Promise.resolve('outside a request'))).toBe(
        'outside a request',
      );
    });

    it('refuses a wait asked from inside a write, which would hold the request’s connection through it', async () => {
      let refused: unknown;

      await request(200, () =>
        whole.write(async (queries) => {
          await store('ana')(queries);
          refused = await whole
            .waiting(() => Promise.resolve('never asked'))
            .catch((error: unknown) => error);
        }),
      );

      expect(refused).toBeInstanceOf(Error);
      expect(await stored()).toEqual(['ana']);
    });

    it('fails the request when what it wrote cannot be committed before the wait, even if it then answers', async () => {
      await refuseAtCommit();
      let waiting: unknown;

      const failed = request(200, async () => {
        await whole.write(store('ana'));
        waiting = await whole
          .waiting(() => Promise.resolve('never asked'))
          .catch((error: unknown) => error);
      });

      await expect(failed).rejects.toThrow('Failed query: commit');
      expect(waiting).toBeInstanceOf(Error);
      expect(await stored()).toEqual([]);
    });
  });

  describe('what a request still does after its answer', () => {
    /** A request that answers the status and, once it is over, writes an account. */
    async function writingLate(status: number): Promise<PromiseSettledResult<unknown>> {
      let answered = (): void => undefined;
      const over = new Promise<void>((resolve) => {
        answered = resolve;
      });
      let late: Promise<unknown> = Promise.resolve();
      await request(status, async () => {
        await whole.write(store('ana'));
        late = over.then(() => whole.write(store('late')));
      });
      answered();
      return (await Promise.allSettled([late]))[0];
    }

    it('refuses a write of a request that was undone: nothing of it is ever kept', async () => {
      const late = await writingLate(500);

      expect(late.status).toBe('rejected');
      expect(await stored()).toEqual([]);
    });

    it('lets a write of a request that was kept through, on a connection of the pool', async () => {
      const late = await writingLate(200);

      expect(late.status).toBe('fulfilled');
      expect(await stored()).toEqual(['ana', 'late']);
    });
  });

  describe('as the sign-in library’s database', () => {
    it('reads through the pool until the request writes, and from then on sees its own writes', async () => {
      let before: unknown[] = [];
      let after = -1;

      await request(500, async () => {
        before = [
          await library.count({ model: 'user' }),
          await library.findMany({ model: 'user' }),
          await library.findOne({ model: 'user', where: [{ field: 'id', value: 'ana' }] }),
          // The pool's only connection is free: no read made the request hold one.
          await stored(),
        ];
        await library.create(account('ana'));
        after = await library.count({ model: 'user' });
      });

      expect(before).toEqual([0, [], null, []]);
      expect(after).toBe(1);
      expect(await stored()).toEqual([]);
    });

    it('takes a transaction of the library as part of the request’s, and a call made inside it without waiting for it', async () => {
      let inside = -1;

      await request(500, async () => {
        await library.create(account('ana'));
        await library.transaction(async (transaction) => {
          await transaction.create(account('bea'));
          // Asked of the adapter itself, as the library's code does, not of its transaction.
          inside = await library.count({ model: 'user' });
        });
      });

      expect(inside).toBe(2);
      expect(await stored()).toEqual([]);
    });

    it('undoes only a transaction of the library that fails', async () => {
      await request(200, async () => {
        await library.create(account('ana'));
        await library
          .transaction(async (transaction) => {
            await transaction.create(account('bea'));
            await transaction.create(account('ana'));
          })
          .catch(() => undefined);
        await library.create(account('carla'));
      });

      expect(await stored()).toEqual(['ana', 'carla']);
    });

    it('is the library’s own adapter outside a request', async () => {
      await library.create(account('ana'));

      expect(library.id).toBe('drizzle');
      expect(await library.count({ model: 'user' })).toBe(1);
    });
  });
});

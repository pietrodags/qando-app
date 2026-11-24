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

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url, max: 1 });
    await runMigrations(pool);
    db = createDatabase(pool);
    whole = wholeRequests(db);
  });

  afterEach(async () => {
    await pool.query(`
      DROP TRIGGER IF EXISTS refused_at_commit ON users;
      DROP FUNCTION IF EXISTS refuse();
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

  /** Runs the work as a request that answers the status once it is done. */
  const request = (status: number, work: () => Promise<unknown>) =>
    whole.asOne(async () => {
      await work();
      return new Response(null, { status });
    })(new Request('http://localhost/'));

  /** Makes the database refuse, when a transaction commits, the accounts it stored. */
  const refuseAtCommit = () =>
    pool.query(`
      CREATE FUNCTION refuse() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'refused by the test'; END $$;
      CREATE CONSTRAINT TRIGGER refused_at_commit AFTER INSERT ON users
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION refuse()`);

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
      return (await Promise.allSettled([late]))[0]!;
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
    /** The library's adapter on qando's tables, as `createAuth` sets it up. */
    const adapter = () =>
      whole.adapter((queries) =>
        drizzleAdapter(queries, {
          provider: 'pg',
          schema: { users, sessions, accounts, verifications },
          usePlural: true,
          transaction: true,
        }),
      )({});

    const account = (name: string) => ({
      model: 'user',
      data: { id: name, name, email: `${name}@example.com`, emailVerified: true },
      forceAllowId: true,
    });

    it('reads through the pool until the request writes, and from then on sees its own writes', async () => {
      const library = adapter();
      let before = -1;
      let after = -1;

      await request(500, async () => {
        before = await library.count({ model: 'user' });
        await library.create(account('ana'));
        after = await library.count({ model: 'user' });
      });

      expect([before, after]).toEqual([0, 1]);
      expect(await stored()).toEqual([]);
    });

    it('takes a transaction of the library as part of the request’s, and a call made inside it without waiting for it', async () => {
      const library = adapter();
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
      const library = adapter();

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
      const library = adapter();

      await library.create(account('ana'));

      expect(library.id).toBe('drizzle');
      expect(await library.count({ model: 'user' })).toBe(1);
    });
  });
});

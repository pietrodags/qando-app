import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
  /** The sign-in library's own adapter on qando's tables. */
  const onQandoTables = (queries: Queries) =>
    drizzleAdapter(queries, {
      provider: 'pg',
      schema: { users, sessions, accounts, verifications },
      usePlural: true,
      transaction: true,
    });

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url, max: 1 });
    await runMigrations(pool);
    db = createDatabase(pool);
    whole = wholeRequests(db);
    library = whole.adapter(onQandoTables, [{ model: 'verification' }])({});
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

  /** Stores a code with the value, as the sign-in library writes one. */
  const storeACode = (value: string) =>
    library.create({
      model: 'verification',
      data: { identifier: 'a code', value, expiresAt: new Date('2030-01-01') },
    });

  /** The values of the codes stored, as any other request sees them. */
  const codesStored = async () =>
    (await pool.query<{ value: string }>('SELECT value FROM verifications')).rows.map(
      ({ value }) => value,
    );

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

  /** Resolves once that many requests wait in the database for another one to be over. */
  const waitingInTheDatabase = (requests: number) =>
    vi.waitFor(
      async () => {
        const { rows } = await pool.query(
          `SELECT count(*)::int AS waiting FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`,
        );
        expect(rows).toEqual([{ waiting: requests }]);
      },
      { timeout: 5000, interval: 20 },
    );

  /** Something a request waits at until the test opens it. */
  function gate() {
    let open = (): void => undefined;
    const opened = new Promise<void>((resolve) => {
      open = resolve;
    });
    return {
      open: () => {
        open();
      },
      opened,
    };
  }

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

  describe('a request that answers a fault after a call of its own failed', () => {
    /** A write the database refuses for a reason of its own: a division by zero. */
    const divideByZero = (queries: Queries) => queries.execute(sql`select 1/0`);

    it('fails as the call did, a call of the library too: the handler caught why, and nothing is kept', async () => {
      const failed = request(500, async () => {
        await whole.write(store('ana'));
        await library.create(account('ana')).catch(() => undefined);
      });

      // PostgreSQL's code for a row stored already, on what the database driver failed with.
      await expect(failed).rejects.toMatchObject({ cause: { code: '23505' } });
      expect(await stored()).toEqual([]);
    });

    it('fails as the last of its calls that failed, before it is whole too: what it wrote until then stays', async () => {
      const failed = asked(503, async () => {
        await whole.write(store('ana'));
        await whole.write(store('ana')).catch(() => undefined);
        await whole.write(divideByZero).catch(() => undefined);
      });

      await expect(failed).rejects.toMatchObject({ cause: { code: '22012' } });
      expect(await stored()).toEqual(['ana']);
    });

    it('answers what it answered when that is no fault: a failure the request got over is none of the request', async () => {
      const answer = await request(409, async () => {
        await whole.write(divideByZero).catch(() => undefined);
        await whole.write(store('ana'));
      });

      expect(answer.status).toBe(409);
      expect(await stored()).toEqual(['ana']);
    });
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

    it('undoes what the request writes after a wait whose commit failed: the request fails whole', async () => {
      await refuseAtCommit();

      const failed = request(200, async () => {
        await whole.write(store('ana'));
        await whole.waiting(() => Promise.resolve('never asked')).catch(() => undefined);
        await storeACode('after the wait');
      });

      await expect(failed).rejects.toThrow('Failed query: commit');
      expect(await codesStored()).toEqual([]);
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

    it('refuses a write of a request whose commit failed: nothing of it is ever kept', async () => {
      await refuseAtCommit();
      const later = gate();
      let late: Promise<unknown> = Promise.resolve();

      const failed = await request(200, async () => {
        await whole.write(store('ana'));
        late = later.opened.then(() => storeACode('late'));
      }).catch((error: unknown) => error);
      later.open();
      const refused = await late.catch((error: unknown) => error);

      expect(failed).toBeInstanceOf(Error);
      expect(refused).toBeInstanceOf(Error);
      expect(await codesStored()).toEqual([]);
    });

    it('lets a write of a request that was kept through, on a connection of the pool', async () => {
      const late = await writingLate(200);

      expect(late.status).toBe('fulfilled');
      expect(await stored()).toEqual(['ana', 'late']);
    });
  });

  describe('as the sign-in library’s database', () => {
    it('reads through the pool until the request reads what it gives or takes, and from that read on holds its connection and sees its own writes', async () => {
      let before: unknown[] = [];
      let after = -1;
      const seen: string[] = [];
      let outside = Promise.resolve();

      await asked(500, async () => {
        before = [
          await library.count({ model: 'user' }),
          await library.findMany({ model: 'user' }),
          await library.findOne({ model: 'user', where: [{ field: 'id', value: 'ana' }] }),
          // The pool's only connection is free: no read made the request hold one.
          await stored(),
        ];
        await readACode();
        // Through the pool's only connection, which the request holds from its code on.
        outside = stored().then(() => {
          seen.push('read outside the request');
        });
        await library.create(account('ana'));
        after = await library.count({ model: 'user' });
        seen.push('request over');
      });
      await outside;

      expect(before).toEqual([0, [], null, []]);
      expect(after).toBe(1);
      expect(seen).toEqual(['request over', 'read outside the request']);
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

  describe('a row held back until its request is whole', () => {
    /** What the caller makes a call fail with when its row is stored already. */
    const presentedTwice = new Error('presented twice');
    /** What the caller answers a request whose row is stored already. */
    const refused = { status: 409, body: { refused: 'presented twice' } };
    /**
     * The library's adapter where what a request gives or takes is a code, and an account stands
     * for what it presents on its way there (a proof of who sends it), stored once.
     */
    let proofs: ReturnType<ReturnType<WholeRequests['adapter']>>;

    beforeAll(() => {
      proofs = whole.adapter(onQandoTables, [{ model: 'verification' }], {
        model: 'user',
        storedAlready: () => presentedTwice,
        refusal: () => Response.json(refused.body, { status: refused.status }),
      })({});
    });

    /** Presents the row, as a request does on its way to its code. */
    const present = (name: string) => proofs.create(account(name));

    /** Reads a code through this adapter: where a request becomes whole. */
    const reachTheCode = () =>
      proofs.findOne({ model: 'verification', where: [{ field: 'identifier', value: 'a code' }] });

    /** What a call failed with, or `undefined` if it did not fail. */
    const failureOf = (call: Promise<unknown>) =>
      call.then(
        () => undefined,
        (error: unknown) => error,
      );

    /** The status and the body a request was answered with. */
    const answered = async (answer: Response) => ({
      status: answer.status,
      body: await answer.json(),
    });

    it('is not stored on the way there, through a wait for another server too: a request answered before it becomes whole stores it as it ends', async () => {
      let seenOnTheWay: string[] = ['not read'];
      let seenAfterAWait: string[] = ['not read'];

      await asked(200, async () => {
        await present('ana');
        // Read through the pool's only connection: the request holds none.
        seenOnTheWay = await stored();
        await whole.waiting(() => Promise.resolve());
        seenAfterAWait = await stored();
      });

      expect(seenOnTheWay).toEqual([]);
      expect(seenAfterAWait).toEqual([]);
      expect(await stored()).toEqual(['ana']);
    });

    it('is never stored by a request that ends in a fault before it becomes whole, answered or thrown', async () => {
      await asked(500, () => present('ana'));
      const failed = asked(200, async () => {
        await present('bea');
        throw new Error('failed on the way');
      });

      await expect(failed).rejects.toThrow('failed on the way');
      expect(await stored()).toEqual([]);
    });

    it.each([200, 400, 500])(
      'answers a request whose row is found stored already as it ends, before it becomes whole, with the caller’s refusal, whatever it answered (%i)',
      async (status) => {
        await present('ana');

        const answer = await asked(status, () => present('ana'));

        expect(await answered(answer)).toEqual(refused);
        expect(await stored()).toEqual(['ana']);
      },
    );

    it('stores the other rows of a request refused as it ends, as with any refusal: only a fault undoes them', async () => {
      await present('ana');

      await asked(200, async () => {
        await present('ana');
        await present('bea');
      });
      await asked(500, async () => {
        await present('ana');
        await present('carla');
      });

      expect(await stored()).toEqual(['ana', 'bea']);
    });

    it('fails a request that cannot store the row as it ends for another reason, whatever it answered', async () => {
      const failed = asked(200, () =>
        // No account is stored without its email.
        proofs.create({
          model: 'user',
          data: { id: 'ana', name: 'ana', email: null, emailVerified: true },
          forceAllowId: true,
        }),
      );

      await expect(failed).rejects.toThrow('Failed query');
      expect(await stored()).toEqual([]);
    });

    it('answers the row as it was given', async () => {
      let answered: unknown;

      await asked(200, async () => {
        answered = await present('ana');
      });

      expect(answered).toEqual(account('ana').data);
    });

    it('is stored as the request becomes whole: only the request sees it until its answer, and it is kept with it', async () => {
      let seenByOthers: unknown[] = ['not read'];
      let seenByTheRequest: unknown;
      const client = new pg.Client({ connectionString: database.url });
      await client.connect();

      await asked(200, async () => {
        await present('ana');
        await reachTheCode();
        seenByOthers = (await client.query('SELECT name FROM users')).rows;
        seenByTheRequest = await proofs.findOne({
          model: 'user',
          where: [{ field: 'id', value: 'ana' }],
        });
      });
      await client.end();

      expect(seenByOthers).toEqual([]);
      expect(seenByTheRequest).toMatchObject({ name: 'ana' });
      expect(await stored()).toEqual(['ana']);
    });

    it('is undone with its request: the same row can be presented again, and is then kept', async () => {
      await asked(500, async () => {
        await present('ana');
        await reachTheCode();
      });
      const undone = await stored();

      await asked(200, async () => {
        await present('ana');
        await reachTheCode();
      });

      expect(undone).toEqual([]);
      expect(await stored()).toEqual(['ana']);
    });

    it('fails the call that makes the request whole when the row is stored already, with what the caller makes of it: the request does nothing more', async () => {
      await asked(200, async () => {
        await present('ana');
        await reachTheCode();
      });
      const failures: unknown[] = [];

      await asked(400, async () => {
        await present('ana');
        failures.push(await failureOf(reachTheCode()));
        failures.push(await failureOf(whole.write(store('bea'))));
        failures.push(await failureOf(proofs.findOne({ model: 'user', where: [] })));
      });

      expect(failures).toEqual([presentedTwice, presentedTwice, presentedTwice]);
      expect(await stored()).toEqual(['ana']);
    });

    it.each([200, 400, 500])(
      'answers a request whose row is found stored already as it becomes whole with the caller’s refusal, whatever its handler made of the call that failed and answered (%i)',
      async (status) => {
        await present('ana');

        const answer = await asked(status, async () => {
          await present('ana');
          await failureOf(reachTheCode());
        });

        expect(await answered(answer)).toEqual(refused);
        expect(await stored()).toEqual(['ana']);
      },
    );

    it('answers each request refused so with a refusal of its own', async () => {
      await present('ana');

      const first = await asked(200, () => present('ana'));
      const second = await asked(200, () => present('ana'));

      expect(await answered(first)).toEqual(refused);
      expect(await answered(second)).toEqual(refused);
    });

    it('refuses a request whose row was found stored already as it became whole, though the row is gone by the time it ends', async () => {
      await present('ana');
      const other = new pg.Client({ connectionString: database.url });
      await other.connect();

      const answer = await asked(200, async () => {
        await present('ana');
        await failureOf(reachTheCode());
        // Another request's doing, on a connection of its own: this one holds the pool's.
        await other.query('DELETE FROM users');
      });
      await other.end();

      expect(await answered(answer)).toEqual(refused);
    });

    it('fails a request whose handler fails as the handler did, though its row was found stored already', async () => {
      await present('ana');

      const failed = asked(200, async () => {
        await present('ana');
        await failureOf(reachTheCode());
        throw new Error('failed after it was refused');
      });

      await expect(failed).rejects.toThrow('failed after it was refused');
      expect(await stored()).toEqual(['ana']);
    });

    it('fails as the database did when the row cannot be stored for another reason, and the request does nothing more', async () => {
      const failures: unknown[] = [];

      const failed = asked(400, async () => {
        // No account is stored without its email.
        await proofs.create({
          model: 'user',
          data: { id: 'ana', name: 'ana', email: null, emailVerified: true },
          forceAllowId: true,
        });
        failures.push(await failureOf(reachTheCode()));
        failures.push(await failureOf(whole.write(store('bea'))));
      });

      // Whatever the request answers, it fails as it ends: its row still cannot be stored.
      await expect(failed).rejects.toThrow('Failed query');
      expect(failures).toEqual([expect.any(Error), expect.any(Error)]);
      expect(failures).not.toContain(presentedTwice);
      expect(await stored()).toEqual([]);
    });

    it('holds the row still when the call that would store it fails for a reason of its own: the request’s next call stores it', async () => {
      let failure: unknown;

      await asked(200, async () => {
        await present('ana');
        // No code is stored without its value: this write fails, and the row is undone with it.
        failure = await failureOf(
          proofs.create({
            model: 'verification',
            data: { identifier: 'a code', value: null, expiresAt: new Date('2030-01-01') },
          }),
        );
        await reachTheCode();
      });

      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBe(presentedTwice);
      expect(await stored()).toEqual(['ana']);
    });

    it('stores every row a request held back, and with them what it writes as it becomes whole', async () => {
      await asked(200, async () => {
        await present('ana');
        await present('bea');
        await proofs.create({
          model: 'verification',
          data: { identifier: 'a code', value: 'given', expiresAt: new Date('2030-01-01') },
        });
      });

      const codes = await pool.query('SELECT count(*)::int AS kept FROM verifications');
      expect(await stored()).toEqual(['ana', 'bea']);
      expect(codes.rows).toEqual([{ kept: 1 }]);
    });

    it('is written as any other row outside a request, where a second one fails as the database refuses it', async () => {
      await present('ana');
      const second = await failureOf(present('ana'));

      expect(second).toBeInstanceOf(Error);
      expect(second).not.toBe(presentedTwice);
      expect(await stored()).toEqual(['ana']);
    });

    it('is written as any other row by a request that is whole already, undone alone when the database refuses it', async () => {
      let second: unknown;

      await asked(200, async () => {
        await reachTheCode();
        await present('ana');
        second = await failureOf(present('ana'));
        await present('bea');
      });

      expect(second).toBeInstanceOf(Error);
      expect(second).not.toBe(presentedTwice);
      expect(await stored()).toEqual(['ana', 'bea']);
    });

    it('is undone with a request that was whole already when it fails, as all it wrote', async () => {
      await asked(500, async () => {
        await reachTheCode();
        await present('ana');
      });

      expect(await stored()).toEqual([]);
    });

    it('holds back only the rows a request creates of that model: its other calls on it are made at once', async () => {
      await present('ana');
      let read: unknown;

      await asked(500, async () => {
        read = await proofs.findOne({ model: 'user', where: [{ field: 'id', value: 'ana' }] });
        await proofs.update({
          model: 'user',
          where: [{ field: 'id', value: 'ana' }],
          update: { name: 'renamed' },
        });
      });

      expect(read).toMatchObject({ name: 'ana' });
      expect(await stored()).toEqual(['renamed']);
    });
  });

  // A pool of several connections here: a request that waits for another holds its own.
  describe('requests that take the same row', () => {
    let roomy: pg.Pool;
    let turns: WholeRequests;
    /**
     * The library's adapter where requests take in turns a code, asked for by its `identifier`,
     * and an account, asked for by its `id`.
     */
    let codes: ReturnType<ReturnType<WholeRequests['adapter']>>;

    beforeAll(() => {
      roomy = new pg.Pool({ connectionString: database.url, max: 4 });
      turns = wholeRequests(createDatabase(roomy));
      codes = turns.adapter(onQandoTables, [
        { model: 'verification', inTurnsBy: 'identifier' },
        { model: 'user', inTurnsBy: 'id' },
      ])({});
    });

    afterAll(async () => {
      await roomy.end();
    });

    /** Runs the work as a request that answers the status once it is done. */
    const asked = (status: number, work: () => Promise<unknown>) =>
      turns.asOne(async () => {
        await work();
        return new Response(null, { status });
      })(new Request('http://localhost/'));

    /** Looks the code up, as a request does that is about to take it. */
    const take = (code: string) =>
      codes.findOne<{ value: string }>({
        model: 'verification',
        where: [{ field: 'identifier', value: code }],
      });

    /** Stores under the code what a request leaves of it. */
    const leave = (code: string, value: string) =>
      codes.create({
        model: 'verification',
        data: { identifier: code, value, expiresAt: new Date(Date.now() + 60_000) },
      });

    /**
     * A request that has taken the code and goes on with `then` once the test calls `goOn`;
     * `over` settles when the request does.
     */
    async function holding(code: string, status: number, then: () => Promise<unknown>) {
      const taken = gate();
      const held = gate();
      const over = asked(status, async () => {
        await take(code);
        taken.open();
        await held.opened;
        await then();
      });
      await taken.opened;
      return { goOn: held.open, over };
    }

    it('makes the second wait, before it reads the row, until the first is over: it reads what the first left', async () => {
      const first = await holding('a code', 200, () => leave('a code', 'left by the first'));
      let read: unknown;
      const second = asked(200, async () => {
        read = await take('a code');
      });
      try {
        await waitingInTheDatabase(1);
      } finally {
        first.goOn();
        await Promise.all([first.over, second]);
      }

      expect(read).toMatchObject({ value: 'left by the first' });
    });

    it('ends a turn with its request though it is undone: the next reads nothing of it', async () => {
      const first = await holding('a code', 500, () => leave('a code', 'undone with the first'));
      let read: unknown = 'not read';
      const second = asked(200, async () => {
        read = await take('a code');
      });
      try {
        await waitingInTheDatabase(1);
      } finally {
        first.goOn();
        await Promise.all([first.over, second]);
      }

      expect(read).toBeNull();
    });

    describe('and hold back the same row', () => {
      const presentedTwice = new Error('presented twice');
      /** The library's adapter where codes are taken in turns and an account is held back. */
      let proofs: ReturnType<ReturnType<WholeRequests['adapter']>>;

      beforeAll(() => {
        proofs = turns.adapter(
          onQandoTables,
          [{ model: 'verification', inTurnsBy: 'identifier' }],
          {
            model: 'user',
            storedAlready: () => presentedTwice,
            refusal: () => new Response(null, { status: 409 }),
          },
        )({});
      });

      /** A request that presents the account and takes the code, then waits at `until`. */
      const presenting = (status: number, code: string, until?: Promise<void>, name = 'ana') => {
        const whole = gate();
        const over = asked(status, async () => {
          await proofs.create(account(name));
          await proofs.findOne({
            model: 'verification',
            where: [{ field: 'identifier', value: code }],
          });
          whole.open();
          await until;
        });
        return { whole: whole.opened, over };
      };

      it('makes the second wait for the first, which stored the row and is not over: undone, it leaves the row to the second', async () => {
        const held = gate();
        const first = presenting(500, 'a code', held.opened);
        await first.whole;
        // Another code: it is the row itself that the second waits for.
        const second = presenting(200, 'another code');
        try {
          await waitingInTheDatabase(1);
        } finally {
          held.open();
          await Promise.allSettled([first.over, second.over]);
        }

        expect((await second.over).status).toBe(200);
        const kept = await roomy.query('SELECT name FROM users');
        expect(kept.rows).toEqual([{ name: 'ana' }]);
      });

      it('fails the second with what the caller makes once the first is kept, after its turn', async () => {
        const held = gate();
        const first = presenting(200, 'a code', held.opened);
        await first.whole;
        const second = presenting(200, 'a code');
        try {
          await waitingInTheDatabase(1);
        } finally {
          held.open();
          await Promise.allSettled([first.over, second.over]);
        }

        await expect(second.over).rejects.toBe(presentedTwice);
        expect((await first.over).status).toBe(200);
      });

      it('is stored only after its request’s turn: one that waits for its turn holds up no other that presents the same row', async () => {
        const held = gate();
        const first = presenting(200, 'a code', held.opened);
        await first.whole;
        const second = presenting(200, 'a code', undefined, 'bea');
        let third: Response | undefined;
        try {
          await waitingInTheDatabase(1);
          // Over while the second still waits for its turn: it has not stored its row yet.
          third = await presenting(200, 'another code', undefined, 'bea').over;
        } finally {
          held.open();
          await Promise.allSettled([first.over, second.over]);
        }

        expect(third.status).toBe(200);
        await expect(second.over).rejects.toBe(presentedTwice);
      });
    });

    it('makes no other call wait: for another row, for no row by that field, for a row of another model, or outside a request', async () => {
      const first = await holding('a code', 200, () => Promise.resolve());
      try {
        // Each is answered while the first request still holds its turn.
        await asked(200, () => take('another code'));
        await asked(200, () =>
          codes.findMany({ model: 'verification', where: [{ field: 'value', value: 'a code' }] }),
        );
        await asked(200, () =>
          codes.findOne({ model: 'user', where: [{ field: 'id', value: 'a code' }] }),
        );
        await take('a code');
      } finally {
        first.goOn();
        await first.over;
      }
    });

    it('gives its turn up while it waits for another server, as it gives its connection back', async () => {
      const waiting = gate();
      const answered = gate();
      const first = asked(200, async () => {
        await take('a code');
        await turns.waiting(() => {
          waiting.open();
          return answered.opened;
        });
      });
      await waiting.opened;
      try {
        // Over while the first still waits for the other server.
        await asked(200, () => take('a code'));
      } finally {
        answered.open();
        await first;
      }
    });
  });

  describe('work of our own in a turn', () => {
    it('makes all the work does one transaction on one connection, kept once it answers: the library’s calls, our writes and its own queries', async () => {
      const answer = await whole.inTurn('a turn', async (queries) => {
        await library.create(account('ana'));
        await library.transaction(async (transaction) => {
          await transaction.create(account('bea'));
        });
        await whole.write(store('carla'));
        await store('dora')(queries);
        return 'done';
      });

      expect(answer).toBe('done');
      expect(await stored()).toEqual(['ana', 'bea', 'carla', 'dora']);
    });

    it('undoes all of it when the work fails, and fails as the work did', async () => {
      const failure = new Error('The work failed');

      const failed = await whole
        .inTurn('a turn', async (queries) => {
          await library.create(account('ana'));
          await whole.write(store('bea'));
          await store('carla')(queries);
          throw failure;
        })
        .catch((error: unknown) => error);

      expect(failed).toBe(failure);
      expect(await stored()).toEqual([]);
    });

    it('refuses what the work still writes once it has failed: none of it is ever kept', async () => {
      const later = gate();
      let late: Promise<unknown> = Promise.resolve();

      const failed = await whole
        .inTurn('a turn', () => {
          late = later.opened.then(() => library.create(account('ana')));
          return Promise.reject(new Error('The work failed'));
        })
        .catch((error: unknown) => error);
      later.open();
      const refused = await late.catch((error: unknown) => error);

      expect(failed).toBeInstanceOf(Error);
      expect(refused).toBeInstanceOf(Error);
      expect(await stored()).toEqual([]);
    });

    it('refuses what the work still writes once its commit has failed: none of it is ever kept', async () => {
      await refuseAtCommit();
      const later = gate();
      let late: Promise<unknown> = Promise.resolve();

      const failed = await whole
        .inTurn('a turn', async (queries) => {
          await store('ana')(queries);
          late = later.opened.then(() => storeACode('late'));
        })
        .catch((error: unknown) => error);
      later.open();
      const refused = await late.catch((error: unknown) => error);

      expect(failed).toBeInstanceOf(Error);
      expect(refused).toBeInstanceOf(Error);
      expect(await codesStored()).toEqual([]);
    });

    it('fails when what the work did cannot be committed, and keeps none of it', async () => {
      await refuseAtCommit();

      const failed = await whole
        .inTurn('a turn', (queries) => store('ana')(queries))
        .catch((error: unknown) => error);

      expect(failed).toBeInstanceOf(Error);
      expect(await stored()).toEqual([]);
    });

    it('refuses a wait for another server inside it, which would hold its connection through it', async () => {
      let refused: unknown;

      await whole.inTurn('a turn', async () => {
        refused = await whole
          .waiting(() => Promise.resolve('never asked'))
          .catch((error: unknown) => error);
      });

      expect(refused).toBeInstanceOf(Error);
    });

    describe('asked by two processes over the same database', () => {
      let pools: pg.Pool[];
      /** Each process's own pool, as the database it reads. */
      let dbs: Database[];
      let processes: WholeRequests[];

      beforeAll(() => {
        pools = [1, 2].map(() => new pg.Pool({ connectionString: database.url, max: 2 }));
        dbs = pools.map((own) => createDatabase(own));
        processes = dbs.map((own) => wholeRequests(own));
      });

      afterAll(async () => {
        await Promise.all(pools.map((own) => own.end()));
      });

      /** Work in the turn that stores the name and goes on once the test calls `goOn`. */
      async function holding(turn: string, name: string) {
        const stored = gate();
        const held = gate();
        const over = processes[0]!.inTurn(turn, async (queries) => {
          await store(name)(queries);
          stored.open();
          await held.opened;
        });
        await stored.opened;
        return { goOn: held.open, over };
      }

      /** The names stored, as the work reads them. */
      const names = async (queries: Queries) =>
        (await queries.select({ name: users.name }).from(users)).map(({ name }) => name);

      it('makes work in the same turn wait until the first is over: it reads what the first left', async () => {
        const first = await holding('a turn', 'ana');
        let read: string[] | undefined;
        const second = processes[1]!.inTurn('a turn', async (queries) => {
          read = await names(queries);
        });
        await waitingInTheDatabase(1);

        expect(await names(dbs[1]!)).toEqual([]);
        expect(read).toBeUndefined();
        first.goOn();
        await Promise.all([first.over, second]);
        expect(read).toEqual(['ana']);
      });

      it('makes no work in another turn wait', async () => {
        const first = await holding('a turn', 'ana');
        try {
          await processes[1]!.inTurn('another turn', (queries) => store('bea')(queries));
          expect(await names(dbs[1]!)).toEqual(['bea']);
        } finally {
          first.goOn();
          await first.over;
        }
      });
    });
  });
});

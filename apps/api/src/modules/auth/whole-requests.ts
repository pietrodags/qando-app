// Better Auth writes what a request changes one statement at a time, each kept as soon as it is
// made: a request that fails midway leaves the first half done (a refresh token used up and no
// new one in its place), and two requests that take the same thing at once both find it there to
// take. Here its database is one where what a request gives and takes is kept whole or not at
// all, by one request at a time, without holding a connection while the request waits for
// another server.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { DBAdapter } from '@better-auth/core/db/adapter';
import type { BetterAuthOptions } from 'better-auth';
import { sql } from 'drizzle-orm';
import type { Database } from '../../db/database.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** The database as a query is sent to it: the pool, or a request's transaction. */
export type Queries = Database | Transaction;

type Adapter = DBAdapter;
type AdapterFactory = (options: BetterAuthOptions) => Adapter;
type Handler = (request: Request) => Promise<Response>;

/**
 * A database for Better Auth in which a request is whole from the moment it reaches what it
 * gives or takes (its code, its refresh token). Until then it is as any other request, each
 * write kept as soon as it is made: Better Auth remembers in memory what it stored on the way
 * there (an application's document) and never stores it again, so it must stay stored whatever
 * becomes of the request. From then on, starting at its first write, all the request does in
 * the database is one transaction on one connection, one call at a time, committed before the
 * request is answered; until that write it reads through the pool. A write that fails undoes
 * only itself, as it would on its own, so code that catches a refused write and goes on behaves
 * the same.
 *
 * Where a model's rows are taken in turns, two requests that ask for the same row are whole one
 * after the other: the second waits, before it reads the row, until the first is over, and so
 * reads what the first left of it. A turn is a lock the request's transaction holds in the
 * database: a request that took one after it wrote, or took two, could wait for a request
 * that waits for it, which PostgreSQL ends by failing one of the two.
 */
export interface WholeRequests {
  /**
   * What Better Auth is given as its `database`: `over` makes its adapter on the pool or on a
   * request's transaction, and `taken` names the models a request gives or takes: its first
   * call on one of them, a read or a write, is where it becomes whole. Its reads are `findOne`,
   * `findMany` and `count`; anything else writes. A model with `inTurnsBy` names the field its
   * rows are asked for by: a request's call that names a value for that field takes its turn
   * on that row first, its transaction open from then on, and keeps the turn until the request
   * is over or waits for another server.
   */
  adapter(
    over: (queries: Queries) => AdapterFactory,
    taken: readonly { readonly model: string; readonly inTurnsBy?: string }[],
  ): AdapterFactory;
  /**
   * The handler with each request whole: what it wrote since it reached what it gives or takes
   * is committed before its answer is returned, and undone when the answer is a fault of the
   * server (`5xx`) or the handler fails. A refusal (`4xx`) is an answer: what it wrote stays.
   * If the commit fails, so does the request. Once it is over, what it still writes is refused
   * if it was undone, and otherwise written through the pool.
   */
  asOne(handler: Handler): Handler;
  /**
   * A write of our own: part of the request it is made in once that request is whole; made at
   * once before that, and outside a request.
   */
  write<T>(work: (queries: Queries) => Promise<T>): Promise<T>;
  /**
   * A wait for another server. No request holds a connection through it: what the request wrote
   * so far is committed first, its turn given up with it, and what it writes afterwards is
   * another transaction.
   */
  waiting<T>(wait: () => Promise<T>): Promise<T>;
}

/** A request's transaction while it is open, on the connection it holds. */
interface Open {
  readonly tx: Transaction;
  /** Set as soon as it is asked to end: nothing more may be sent on its connection. */
  over: boolean;
  /** Commits it or undoes it, and gives its connection back; fails if the commit does. */
  end(keep: boolean): Promise<void>;
}

/** What one request does in the database. */
interface RequestWrites {
  /** Whether it has reached what it gives or takes: until then it is as any other request. */
  whole: boolean;
  /** A read: through the pool until the request writes, then in turn on its connection. */
  read<T>(step: (queries: Queries) => Promise<T>): Promise<T>;
  /**
   * A write, in turn on the request's connection, which opens its transaction if none is; a
   * savepoint of its own, so one that fails is undone alone.
   */
  write<T>(step: (queries: Queries) => Promise<T>): Promise<T>;
  /** Commits what was written so far and gives the connection back. */
  settle(): Promise<void>;
  /** Commits or undoes what is left; fails if this or an earlier commit did. */
  end(keep: boolean): Promise<void>;
}

/** Where a call is made: in which request, and inside which of its writes if in one. */
interface Place {
  readonly request: RequestWrites;
  readonly inside?: { readonly transaction: Open; readonly savepoint: Transaction };
}

/** What drizzle's transaction is ended with to undo it; never seen outside this module. */
const undone = new Error('Undone with its request');

/** What a call of Better Auth's adapter is first given, as far as it is read here. */
interface Asked {
  readonly model?: unknown;
  readonly where?: readonly { readonly field: string; readonly value: unknown }[];
}

/** The methods of Better Auth's adapter that only read; any other is taken as a write. */
const readingMethods: ReadonlySet<PropertyKey> = new Set(['findOne', 'findMany', 'count']);

export function wholeRequests(db: Database): WholeRequests {
  const places = new AsyncLocalStorage<Place>();

  /** Opens a transaction that stays open, on its connection, until it is told how to end. */
  const begin = (): Promise<Open> =>
    new Promise<Open>((opened, failed) => {
      const ending = Promise.withResolvers<boolean>();
      const closed: Promise<void> = db.transaction(async (tx) => {
        const open: Open = {
          tx,
          over: false,
          end: async (keep) => {
            open.over = true;
            ending.resolve(keep);
            await closed.catch((error: unknown) => {
              if (error !== undone) throw error;
            });
          },
        };
        opened(open);
        if (!(await ending.promise)) throw undone;
      });
      closed.catch(failed);
    });

  const requestWrites = (): RequestWrites => {
    let open: Promise<Open> | undefined;
    /** The request's last call on its connection, which the next one waits for. */
    let last: Promise<unknown> = Promise.resolve();
    let ended: 'kept' | 'undone' | undefined;
    /** The failure of a commit made before the end, which fails the request whatever it answers. */
    let lost: { readonly error: unknown } | undefined;

    const inTurn = <T>(step: () => Promise<T>): Promise<T> => {
      const turn = last.then(step);
      last = turn.catch(() => undefined);
      return turn;
    };
    const close = async (keep: boolean): Promise<void> => {
      const closing = open;
      open = undefined;
      // One that never opened has nothing to end: the write that asked for it has failed.
      await (await closing?.catch(() => undefined))?.end(keep);
    };

    const request: RequestWrites = {
      whole: false,
      read: (step) =>
        open === undefined
          ? step(db)
          : inTurn(async () => step(open === undefined ? db : (await open).tx)),
      write: (step) => {
        if (ended === 'undone') {
          return Promise.reject(new Error('A write of a request that was undone'));
        }
        if (ended === 'kept') return step(db);
        return inTurn(async () => {
          const transaction = await (open ??= begin());
          return transaction.tx.transaction((savepoint) =>
            places.run({ request, inside: { transaction, savepoint } }, () => step(savepoint)),
          );
        });
      },
      settle: () =>
        inTurn(() => close(true)).catch((error: unknown) => {
          lost = { error };
          throw error;
        }),
      end: (keep) => {
        ended = keep && lost === undefined ? 'kept' : 'undone';
        return inTurn(async () => {
          await close(ended === 'kept');
          if (lost !== undefined) throw lost.error;
        });
      },
    };
    return request;
  };

  /** Runs a call where it belongs; one that `reaches` what its request gives or takes makes it whole. */
  const route = <T>(
    reads: boolean,
    call: (queries: Queries) => Promise<T>,
    reaches = false,
    turn?: string,
  ): Promise<T> => {
    const place = places.getStore();
    if (place === undefined) return call(db);
    // Made from inside a write of the request (a transaction of the library's, say): part of
    // it, on its connection, or it would wait for the write it is made in.
    if (place.inside?.transaction.over === false) return call(place.inside.savepoint);
    const { request } = place;
    if (reaches) request.whole = true;
    if (!request.whole) return call(db);
    if (turn === undefined) return reads ? request.read(call) : request.write(call);
    // Made as a write, so in the request's transaction, which it opens if none is: there it
    // waits for the lock that every request asking for this row takes, a lock PostgreSQL keeps
    // until the transaction ends, however it ends.
    return request.write(async (queries) => {
      await queries.execute(sql`select pg_advisory_xact_lock(hashtextextended(${turn}, 0))`);
      return call(queries);
    });
  };

  return {
    adapter: (over, taken) => (options) => {
      const pooled = over(db)(options);
      // An adapter for each place a call runs in: making one costs less than the call.
      const on = (queries: Queries) => (queries === db ? pooled : over(queries)(options));
      /** The models a request gives or takes, each with the field its rows are taken in turns by. */
      const models: ReadonlyMap<unknown, string | undefined> = new Map(
        taken.map(({ model, inTurnsBy }) => [model, inTurnsBy]),
      );
      /** The turn a call waits for: that of the row it asks for by the field its model names. */
      const turnOf = ({ model, where }: Asked): string | undefined => {
        const by = models.get(model);
        const row = where?.find(({ field }) => field === by);
        return row && JSON.stringify([model, row.value]);
      };
      return new Proxy(pooled, {
        get: (_, member: keyof Adapter) => {
          if (typeof pooled[member] !== 'function') return pooled[member];
          return (...asked: unknown[]) => {
            // A call names its model first, and the rows it is about by their fields.
            const first = asked[0] as Asked;
            return route(
              readingMethods.has(member),
              (queries) =>
                (on(queries)[member] as (...asked: unknown[]) => Promise<unknown>)(...asked),
              models.has(first.model),
              turnOf(first),
            );
          };
        },
      });
    },
    asOne: (handler) => async (asked) => {
      const request = requestWrites();
      let answer: Response;
      try {
        answer = await places.run({ request }, () => handler(asked));
      } catch (error) {
        await request.end(false);
        throw error;
      }
      await request.end(answer.status < 500);
      return answer;
    },
    write: (work) => route(false, work),
    waiting: async (wait) => {
      const place = places.getStore();
      if (place?.inside?.transaction.over === false) {
        throw new Error('A wait for another server inside a write, which holds a connection');
      }
      await place?.request.settle();
      return wait();
    },
  };
}

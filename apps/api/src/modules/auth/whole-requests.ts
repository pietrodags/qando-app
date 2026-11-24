// Better Auth writes what a request changes one statement at a time, each kept as soon as it is
// made: a request that fails midway leaves the first half done (a refresh token used up and no
// new one in its place). Here its database is one where what a request writes is kept whole or
// not at all, without holding a connection while the request waits for another server.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { DBAdapter } from '@better-auth/core/db/adapter';
import type { BetterAuthOptions } from 'better-auth';
import type { Database } from '../../db/database.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** The database as a query is sent to it: the pool, or a request's transaction. */
export type Queries = Database | Transaction;

type Adapter = DBAdapter<BetterAuthOptions>;
type AdapterFactory = (options: BetterAuthOptions) => Adapter;
type Handler = (request: Request) => Promise<Response>;

/**
 * A database for Better Auth in which a request is whole. From its first write on, all a request
 * does in the database is one transaction on one connection, one call at a time, committed
 * before the request is answered; until then it reads through the pool, as any request. A write
 * that fails undoes only itself, as it would on its own, so code that catches a refused write
 * and goes on behaves the same.
 */
export interface WholeRequests {
  /**
   * What Better Auth is given as its `database`: `over` makes its adapter on the pool or on a
   * request's transaction. Its reads are `findOne`, `findMany` and `count`; anything else writes.
   */
  adapter(over: (queries: Queries) => AdapterFactory): AdapterFactory;
  /**
   * The handler with each request whole: what it wrote is committed before its answer is
   * returned, and undone when the answer is a fault of the server (`5xx`) or the handler fails.
   * A refusal (`4xx`) is an answer: what it wrote stays. If the commit fails, so does the
   * request. Once it is over, what it still writes is refused if it was undone, and otherwise
   * written through the pool.
   */
  asOne(handler: Handler): Handler;
  /** A write of our own: part of the request it is made in, or made at once outside one. */
  write<T>(work: (queries: Queries) => Promise<T>): Promise<T>;
  /**
   * A wait for another server. No request holds a connection through it: what the request wrote
   * so far is committed first, and what it writes afterwards is another transaction.
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
  /** A read: through the pool until the request writes, then in turn on its connection. */
  read<T>(step: (queries: Queries) => Promise<T>): Promise<T>;
  /**
   * A write, in turn on the request's connection, which opens its transaction if none is. One
   * that fails is undone alone, unless it `undoesItself` (a transaction of the library's).
   */
  write<T>(step: (queries: Queries) => Promise<T>, undoesItself?: boolean): Promise<T>;
  /** Commits what was written so far and gives the connection back. */
  settle(): Promise<void>;
  /** Commits or undoes what is left; fails if this or an earlier commit did. */
  end(keep: boolean): Promise<void>;
}

/** Where a call is made: in which request, and inside which of its writes if in one. */
interface Place {
  readonly request: RequestWrites;
  readonly inside?: Open;
}

/** What drizzle's transaction is ended with to undo it; never seen outside this module. */
const undone = new Error('Undone with its request');

const reads: ReadonlySet<PropertyKey> = new Set(['findOne', 'findMany', 'count']);

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
      read: (step) =>
        open === undefined
          ? step(db)
          : inTurn(async () => step(open === undefined ? db : (await open).tx)),
      write: (step, undoesItself = false) => {
        if (ended === 'undone') {
          return Promise.reject(new Error('A write of a request that was undone'));
        }
        if (ended === 'kept') return step(db);
        return inTurn(async () => {
          const current = await (open ??= begin());
          const write = () => step(current.tx);
          return places.run({ request, inside: current }, () =>
            undoesItself ? write() : current.tx.transaction(write),
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

  /** Runs a call where it belongs; `own` is a write that undoes itself when it fails. */
  const route = <T>(
    kind: 'read' | 'write' | 'own',
    call: (queries: Queries) => Promise<T>,
  ): Promise<T> => {
    const place = places.getStore();
    if (place === undefined) return call(db);
    // Made from inside a write of the request (a transaction of the library's, say): part of
    // it, on its connection, or it would wait for the write it is made in.
    if (place.inside?.over === false) return call(place.inside.tx);
    return kind === 'read' ? place.request.read(call) : place.request.write(call, kind === 'own');
  };

  return {
    adapter: (over) => (options) => {
      const adapters = new WeakMap<Queries, Adapter>();
      const on = (queries: Queries): Adapter => {
        const made = adapters.get(queries) ?? over(queries)(options);
        adapters.set(queries, made);
        return made;
      };
      const pooled = on(db);
      return new Proxy(pooled, {
        get: (_, member: keyof Adapter) => {
          if (typeof pooled[member] !== 'function') return pooled[member];
          // A transaction of the library's is a savepoint of its own inside the request's.
          const kind = reads.has(member) ? 'read' : member === 'transaction' ? 'own' : 'write';
          return (...asked: unknown[]) =>
            route(kind, (queries) =>
              (on(queries)[member] as (...asked: unknown[]) => Promise<unknown>)(...asked),
            );
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
    write: (work) => route('write', work),
    waiting: async (wait) => {
      const place = places.getStore();
      if (place?.inside?.over === false) {
        throw new Error('A wait for another server inside a write, which holds a connection');
      }
      await place?.request.settle();
      return wait();
    },
  };
}

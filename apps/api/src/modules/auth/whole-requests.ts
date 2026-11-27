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
import { refusedAsStored } from '../../db/refused-as-stored.js';

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
 * becomes of the request. From then on, starting at that call, a read too, all the request does
 * in the database is one transaction on one connection, one call at a time, committed before the
 * request is answered: what it reads of what it gives or takes, and a lock taken with that read,
 * is held until it is over. A write that fails undoes only itself, as it would on its own, so
 * code that catches a refused write and goes on behaves the same.
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
   *
   * `heldBack` names a model whose rows a request stores on its way there, each of them once
   * (the proof of who sends it, which no request may present again). A row the request creates
   * before it is whole is held back, answered as it was given, and stored as the request
   * becomes whole: after its turn and in the same write as the call that made it whole, so the
   * row is kept or undone with the request. While the row could not be stored, every call of
   * the request fails and nothing it does is kept. A request answered while it still holds a
   * row back stores it as it ends, kept unless the answer is a fault; one that cannot be stored
   * then fails the request.
   *
   * A request whose row the database refuses as stored already is refused: it is answered with
   * what `refusal` makes, wherever the row was found so (as the request became whole or as it
   * ended) and whatever its handler answered. Found as the request becomes whole, the call that
   * would store it fails with what `storedAlready` makes, which is how the handler is stopped:
   * a handler may catch that and answer something else, and the refusal is not left to it.
   */
  adapter(
    over: (queries: Queries) => AdapterFactory,
    taken: readonly { readonly model: string; readonly inTurnsBy?: string }[],
    heldBack?: { readonly model: string } & StoredAlready,
  ): AdapterFactory;
  /**
   * The handler with each request whole: what it wrote since it reached what it gives or takes
   * is committed before its answer is returned, and undone when the answer is a fault of the
   * server (`5xx`) or the handler fails. A refusal (`4xx`) is an answer: what it wrote stays.
   * If the commit fails, so does the request, undone. Once it is over, what it still writes is
   * refused if it was undone, and otherwise written through the pool once it is kept.
   *
   * A handler that answers a fault after a call of the request failed has caught that failure
   * and says nothing of it: the request fails with what the last such call failed with, as if
   * the handler had let it through, so whoever answers for the handler knows what failed.
   *
   * A request refused for a row stored already (`adapter`) is answered with that refusal in
   * place of the handler's answer; a handler that fails still fails the request.
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
  /**
   * Work of our own, whole and in its turn from its start: one transaction on one connection,
   * which first waits until no other work holds the turn named `turn`, in any process over the
   * same database, and holds it until the work is over. Every call the work makes on the
   * library's database, every write of ours (`write`) and every query on the `queries` it is
   * given is part of it: kept when the work answers, undone when it fails; if the commit fails,
   * so does the work. Once it is over, what it still writes is refused if it was undone, and
   * otherwise written through the pool. It holds its connection throughout, so no wait for
   * another server is made in it (`waiting` throws), and it is asked outside a request. A
   * function of its own, which can be handed on alone.
   */
  readonly inTurn: <T>(turn: string, work: (queries: Queries) => Promise<T>) => Promise<T>;
}

/** What a row held back comes to when the database refuses it as stored already. */
interface StoredAlready {
  /** Makes what the call that would store the row fails with. */
  readonly storedAlready: () => unknown;
  /** Makes what the row's request is answered. */
  readonly refusal: () => Response;
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
  /** The rows it holds back until one of its writes has stored them. */
  held: Held[];
  /** What the last of its calls that failed failed with. */
  failed?: { readonly error: unknown };
  /** Makes what it is answered, once a row it held back was found stored already. */
  refusal?: () => Response;
  /**
   * A read: in turn on the request's connection while its transaction is open, and through the
   * pool once a wait for another server has ended it, until its next write.
   */
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
  readonly data?: unknown;
}

/** A row held back: the call that stores it, and what it comes to when it is stored already. */
interface Held extends StoredAlready {
  readonly store: (queries: Queries) => Promise<unknown>;
}

/** A call on the database, and what decides where it runs. */
interface Call<T> {
  /** Makes it, on the pool or on its request's connection. */
  readonly make: (queries: Queries) => Promise<T>;
  /** Whether it only reads. */
  readonly reads: boolean;
  /** Whether it is on what its request gives or takes, which makes the request whole. */
  readonly reaches?: boolean;
  /** The turn it takes first. */
  readonly turn?: string | undefined;
  /**
   * Of a row to hold back until its request is whole: the row, which the call answers
   * meanwhile, and what it comes to when it is stored already.
   */
  readonly held?: StoredAlready & { readonly row: T };
}

/** The methods of Better Auth's adapter that only read; any other is taken as a write. */
const readingMethods: ReadonlySet<PropertyKey> = new Set(['findOne', 'findMany', 'count']);

/**
 * Waits until no other transaction holds the turn and takes it: a lock PostgreSQL keeps until
 * the transaction `queries` is part of ends, however it ends, which every process over the same
 * database asks for alike.
 */
const takeTurn = (queries: Queries, turn: string) =>
  queries.execute(sql`select pg_advisory_xact_lock(hashtextextended(${turn}, 0))`);

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
    /**
     * Once the request is asked to end: whether what it wrote was kept, known once it has ended.
     * A commit that fails undoes it.
     */
    let ended: Promise<boolean> | undefined;
    /** The failure of a commit made before the end, which fails the request whatever it answers. */
    let lost: { readonly error: unknown } | undefined;

    const inOrder = <T>(step: () => Promise<T>): Promise<T> => {
      const call = last.then(step);
      last = call.catch(() => undefined);
      return call;
    };
    const close = async (keep: boolean): Promise<void> => {
      const closing = open;
      open = undefined;
      // One that never opened has nothing to end: the write that asked for it has failed.
      await (await closing?.catch(() => undefined))?.end(keep);
    };

    const request: RequestWrites = {
      whole: false,
      held: [],
      read: (step) =>
        open === undefined
          ? step(db)
          : inOrder(async () => step(open === undefined ? db : (await open).tx)),
      write: (step) => {
        // After its end: through the pool once what it wrote is kept, and refused if undone.
        if (ended !== undefined) {
          return ended.then((kept) =>
            kept ? step(db) : Promise.reject(new Error('A write of a request that was undone')),
          );
        }
        return inOrder(async () => {
          const transaction = await (open ??= begin());
          return transaction.tx.transaction((savepoint) =>
            places.run({ request, inside: { transaction, savepoint } }, () => step(savepoint)),
          );
        });
      },
      settle: () =>
        inOrder(() => close(true)).catch((error: unknown) => {
          lost = { error };
          throw error;
        }),
      end: (keep) => {
        const ending = inOrder(async () => {
          await close(keep && lost === undefined);
          if (lost !== undefined) throw lost.error;
        });
        ended = ending.then(
          () => keep,
          () => false,
        );
        return ending;
      },
    };
    return request;
  };

  /** Runs a request's call; one that `reaches` what the request gives or takes makes it whole. */
  const within = <T>(
    place: Place,
    { make, reads, reaches = false, turn, held }: Call<T>,
  ): Promise<T> => {
    // Made from inside a write of the request (a transaction of the library's, say): part of
    // it, on its connection, or it would wait for the write it is made in.
    if (place.inside?.transaction.over === false) return make(place.inside.savepoint);
    const { request } = place;
    if (reaches) request.whole = true;
    if (!request.whole) {
      if (held === undefined) return make(db);
      request.held.push({ ...held, store: make });
      return Promise.resolve(held.row);
    }
    // A call on what the request gives or takes, a read too, is made in the request's
    // transaction, which it opens if none is: what it reads there and any lock taken with it
    // last until the request is over.
    if (turn === undefined && request.held.length === 0) {
      return reads && !reaches ? request.read(make) : request.write(make);
    }
    // Made as a write, so in the request's transaction, which it opens if none is: there it
    // waits for the turn that every request asking for this row takes. The rows the request
    // held back are stored in this same write, after the turn: if the write fails they are
    // undone with it and held still, so the request's next call stores them first or fails as
    // this one did.
    return request.write(async (queries) => {
      if (turn !== undefined) await takeTurn(queries, turn);
      for (const { store, storedAlready, refusal } of request.held) {
        await store(queries).catch((error: unknown) => {
          if (!refusedAsStored(error)) throw error;
          request.refusal = refusal;
          throw storedAlready();
        });
      }
      const answer = await make(queries);
      request.held = [];
      return answer;
    });
  };

  /** Runs a call where it belongs, and leaves with its request what it failed with. */
  const route = <T>(call: Call<T>): Promise<T> => {
    const place = places.getStore();
    if (place === undefined) return call.make(db);
    return within(place, call).catch((error: unknown) => {
      place.request.failed = { error };
      throw error;
    });
  };

  return {
    adapter: (over, taken, heldBack) => (options) => {
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
            const make = (queries: Queries) =>
              (on(queries)[member] as (...asked: unknown[]) => Promise<unknown>)(...asked);
            if (heldBack === undefined || member !== 'create' || heldBack.model !== first.model) {
              return route({
                make,
                reads: readingMethods.has(member),
                reaches: models.has(first.model),
                turn: turnOf(first),
              });
            }
            return route({ make, reads: false, held: { ...heldBack, row: first.data } });
          };
        },
      });
    },
    asOne: (handler) => async (asked) => {
      const request = requestWrites();
      let answer: Response;
      try {
        answer = await places.run({ request }, () => handler(asked));
        // What it still holds back is stored as it ends, each row in a write of its own, so
        // one stored already, which refuses the request, undoes no other.
        for (const { store, refusal } of request.held) {
          await request.write(store).catch((error: unknown) => {
            if (!refusedAsStored(error)) throw error;
            request.refusal = refusal;
          });
        }
      } catch (error) {
        await request.end(false);
        throw error;
      }
      const kept = answer.status < 500;
      await request.end(kept);
      if (request.refusal !== undefined) return request.refusal();
      if (!kept && request.failed !== undefined) throw request.failed.error;
      return answer;
    },
    write: (work) => route({ make: work, reads: false }),
    waiting: async (wait) => {
      const place = places.getStore();
      if (place?.inside?.transaction.over === false) {
        throw new Error('A wait for another server inside a write, which holds a connection');
      }
      await place?.request.settle();
      return wait();
    },
    // One write of a request of its own, whole from its start: every call made inside a write
    // joins it, a wait for another server inside one throws, and what the work still writes
    // once it is over is refused if it was undone, as for any request that was whole.
    inTurn: async (turn, work) => {
      const request = requestWrites();
      request.whole = true;
      const answer = await request
        .write(async (queries) => {
          await takeTurn(queries, turn);
          return work(queries);
        })
        .catch(async (error: unknown) => {
          await request.end(false);
          throw error;
        });
      await request.end(true);
      return answer;
    },
  };
}

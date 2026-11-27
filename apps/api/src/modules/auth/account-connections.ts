// An application (an AI assistant) is connected to an account while the account's consent to it
// is stored: the row Better Auth writes when the account presses "Permitir". The connector takes
// an access token only while that row is there (`connectorAccessOf`), and here the same row is
// what "Apps conectadas" lists and what "Desconectar" withdraws, with the refresh tokens the
// application renews its access with.
//
// Better Auth itself never looks at the consent again once it has given a code: neither when the
// code is exchanged for tokens nor when a refresh token is renewed. So a renewal on its way while
// the account disconnects would store a new refresh token the disconnection does not see, and a
// code given before the disconnection would be exchanged after it, or after the same application
// was connected again: tokens of a connection that was withdrawn, which would work again the day
// the account connects the same application again. Here Better Auth's database finds a refresh
// token only while the consent is there, and a code only while the consent is there since the
// code was given, and holds the consent while the request goes on; the disconnection deletes the
// consent first, so it waits for a request that holds it, and one that arrives later finds none.
import type { ConnectedApplication } from '@qando/contracts';
import type { BetterAuthOptions } from 'better-auth';
import { and, desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../../db/database.js';
import {
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  users,
} from '../../db/schema.js';
import { applicationShown } from './application-shown.js';
import type { ConnectedApplications } from './connected-applications.js';
import type { Queries } from './whole-requests.js';

/**
 * What is read here of Better Auth's database: how it finds rows. It asks for a refresh token
 * with `findOne` and for a code with `findMany` (the newest under its identifier).
 */
interface Calls {
  findOne(asked: { model: string }): Promise<unknown>;
  findMany(asked: { model: string }): Promise<unknown[]>;
}

/** Better Auth's names for a refresh token, and for the rows a code given is kept in. */
const refreshTokenModel = 'oauthRefreshToken';
const codeModel = 'verification';

/**
 * A code given to an application, as Better Auth keeps it in a verification's `value` (1.7.27):
 * JSON with the account it was given for and the request it answers, which names the
 * application. Any other verification (a sign-in code) is none.
 */
const givenCode = z.object({
  type: z.literal('authorization_code'),
  userId: z.string(),
  query: z.object({ client_id: z.string() }),
});

/** The code a verification's `value` keeps, if it keeps one. */
function codeIn(value: string): z.infer<typeof givenCode> | undefined {
  try {
    const read = givenCode.safeParse(JSON.parse(value));
    return read.success ? read.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Better Auth's database made by `factory` on `queries`, in which a refresh token is found only
 * while its account's consent to its application is stored, and a code given to an application
 * only while that consent is stored since the code was given: one given before a disconnection
 * stays unknown once the application is connected again. Better Auth answers a refresh token or
 * a code it does not find as one it never gave (`invalid_grant`). Every other call is the
 * database's own.
 *
 * Finding one holds the account's row and then a share of the consent's until the transaction of
 * `queries` ends (the request's, once it is whole: `wholeRequests`), so neither can be deleted
 * meanwhile. The account's row is held as writing it holds it (`FOR NO KEY UPDATE`): the request
 * goes on to record the account's last use, and a weaker hold made stronger then could wait for
 * a deletion that waits for it. The consent's share (`FOR KEY SHARE`) leaves it free to be
 * written over by another answer of the consent page. That is where a renewal, or the exchange
 * of a code, first reads what it takes, before it writes anything, and in the order a deletion
 * takes them: the account's deletion (`deleteAccount`, and the scheduled one) holds the account
 * before its consents go, and a disconnection deletes the consent before any token. Neither waits
 * for a request that waits for it.
 */
export function onlyWhileConnected<Adapter extends Calls>(
  queries: Queries,
  factory: (options: BetterAuthOptions) => Adapter,
): (options: BetterAuthOptions) => Adapter {
  /**
   * Whether the account allows the application, since `since` when it is given: the consent's
   * date is stamped by the library in milliseconds and a code's in whole seconds.
   */
  const connected = async (account: string, application: string, since?: Date) => {
    await queries.select().from(users).where(eq(users.id, account)).for('no key update');
    const consents = await queries
      .select()
      .from(oauthConsents)
      .where(
        and(
          eq(oauthConsents.userId, account),
          eq(oauthConsents.clientId, application),
          since && lt(oauthConsents.createdAt, new Date(since.getTime() + 1000)),
        ),
      )
      .for('key share');
    return consents.length > 0;
  };
  return (options) => {
    const adapter = factory(options);
    const findOne: Calls['findOne'] = async (asked) => {
      const found = await adapter.findOne(asked);
      if (asked.model !== refreshTokenModel || found === null) return found;
      const { userId, clientId } = found as { userId: string; clientId: string };
      return (await connected(userId, clientId)) ? found : null;
    };
    /** Whether a verification is kept: any but a code whose connection is not the one it was given in. */
    const kept = async (row: unknown) => {
      const { value, createdAt } = row as { value: string; createdAt: Date };
      const code = codeIn(value);
      return code === undefined || (await connected(code.userId, code.query.client_id, createdAt));
    };
    const findMany: Calls['findMany'] = async (asked) => {
      const found = await adapter.findMany(asked);
      if (asked.model !== codeModel) return found;
      const keeping = await Promise.all(found.map(kept));
      return found.filter((_row, at) => keeping[at]);
    };
    const replaced: Partial<Record<PropertyKey, unknown>> = { findOne, findMany };
    return new Proxy(adapter, {
      get: (target, member, receiver) => replaced[member] ?? Reflect.get(target, member, receiver),
    });
  };
}

/**
 * The account's connections as the database holds them. A consent with no date is none: no
 * token is ever taken with it (`connectorAccessOf` compares the two dates). Disconnecting is one
 * transaction that deletes the consent first and then every refresh token (and any access token
 * stored) of the account and the application.
 */
export function connectedApplicationsOf(db: Database): ConnectedApplications {
  return {
    of: async (accountId) => {
      const rows = await db
        .select({
          id: oauthConsents.id,
          address: oauthConsents.clientId,
          name: oauthClients.name,
          connectedAt: oauthConsents.createdAt,
        })
        .from(oauthConsents)
        .innerJoin(oauthClients, eq(oauthClients.clientId, oauthConsents.clientId))
        .where(eq(oauthConsents.userId, accountId))
        .orderBy(desc(oauthConsents.createdAt), oauthConsents.id);
      return rows.flatMap(({ id, address, name, connectedAt }): ConnectedApplication[] => {
        if (connectedAt === null) return [];
        return [{ id, ...applicationShown(address, name), connectedAt: connectedAt.toISOString() }];
      });
    },
    disconnect: (accountId, connectionId) =>
      db.transaction(async (queries) => {
        const [withdrawn] = await queries
          .delete(oauthConsents)
          .where(and(eq(oauthConsents.id, connectionId), eq(oauthConsents.userId, accountId)))
          .returning({ address: oauthConsents.clientId });
        if (withdrawn === undefined) return false;
        await queries
          .delete(oauthRefreshTokens)
          .where(
            and(
              eq(oauthRefreshTokens.userId, accountId),
              eq(oauthRefreshTokens.clientId, withdrawn.address),
            ),
          );
        await queries
          .delete(oauthAccessTokens)
          .where(
            and(
              eq(oauthAccessTokens.userId, accountId),
              eq(oauthAccessTokens.clientId, withdrawn.address),
            ),
          );
        return true;
      }),
  };
}

// An application (an AI assistant) is connected to an account while the account's consent to it
// is stored: the row Better Auth writes when the account presses "Permitir". The connector takes
// an access token only while that row is there (`connectorAccessOf`), and here the same row is
// what "Apps conectadas" lists and what "Desconectar" withdraws, with the refresh tokens the
// application renews its access with.
//
// Better Auth itself never looks at the consent again once it has given a code: neither when the
// code is exchanged for tokens nor when a refresh token is renewed. So a renewal on its way while
// the account disconnects would store a new refresh token the disconnection does not see, and a
// code given a moment before would be exchanged after: tokens of an application no longer
// connected, which would work again the day the account connects the same application again.
// Here Better Auth's database finds a refresh token, and stores one, only while the consent is
// there, and holds the consent while the request goes on; the disconnection deletes the consent
// first, so it waits for a request that holds it, and one that arrives later finds none.
import type { ConnectedApplication } from '@qando/contracts';
import type { BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import {
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
} from '../../db/schema.js';
import type { ConnectedApplications } from './connected-applications.js';
import type { Queries } from './whole-requests.js';

/** What is read here of Better Auth's database: how it finds a row and how it creates one. */
interface Calls {
  findOne(asked: { model: string }): Promise<unknown>;
  create(asked: { model: string; data: Record<string, unknown> }): Promise<unknown>;
}

/** Better Auth's name for a refresh token. */
const refreshTokenModel = 'oauthRefreshToken';

/** What the token route answers a request whose application is no longer connected. */
const notConnected = {
  error: 'invalid_grant',
  error_description: 'The application is not connected to the account',
};

/**
 * Better Auth's database made by `factory` on `queries`, in which a refresh token is found, and
 * created, only while its account's consent to its application is stored. Finding it, or
 * creating it, takes a share of the consent's row until the transaction of `queries` ends (the
 * request's, once it is whole: `wholeRequests`), so the consent cannot be deleted meanwhile; it
 * leaves the row free to be written over by another answer of the consent page. A refresh token
 * of an application no longer connected is not found, which Better Auth answers as it answers
 * one it never gave (`invalid_grant`); one it would create for it fails the request with the
 * same error. Every other call is the database's own.
 *
 * The share is taken where a renewal first reads its refresh token, before it writes any: a
 * renewal never holds a token the disconnection deletes while it waits for the consent, and the
 * disconnection holds the consent before it deletes any token. Neither can wait for the other.
 */
export function onlyWhileConnected<Adapter extends Calls>(
  queries: Queries,
  factory: (options: BetterAuthOptions) => Adapter,
): (options: BetterAuthOptions) => Adapter {
  const connected = async (account: unknown, application: unknown) =>
    typeof account === 'string' &&
    typeof application === 'string' &&
    (
      await queries
        .select({ id: oauthConsents.id })
        .from(oauthConsents)
        .where(and(eq(oauthConsents.userId, account), eq(oauthConsents.clientId, application)))
        .for('key share')
    ).length > 0;
  return (options) => {
    const adapter = factory(options);
    const findOne: Calls['findOne'] = async (asked) => {
      const found = await adapter.findOne(asked);
      if (asked.model !== refreshTokenModel || found === null) return found;
      const { userId, clientId } = found as { userId?: unknown; clientId?: unknown };
      return (await connected(userId, clientId)) ? found : null;
    };
    const create: Calls['create'] = async (asked) => {
      if (
        asked.model === refreshTokenModel &&
        !(await connected(asked.data.userId, asked.data.clientId))
      ) {
        throw new APIError('BAD_REQUEST', notConnected);
      }
      return await adapter.create(asked);
    };
    const replaced: Partial<Record<PropertyKey, unknown>> = { findOne, create };
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
        // The application's address is the one its document is published at, as the consent
        // page names it.
        const { host } = new URL(address);
        return [{ id, name: name ?? host, host, connectedAt: connectedAt.toISOString() }];
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

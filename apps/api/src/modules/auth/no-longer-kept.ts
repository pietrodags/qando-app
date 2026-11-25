// What the sign-in no longer keeps: Better Auth's tables are written only from this module, so
// the scheduled deletion (`apps/api/src/retention`) deletes accounts, codes, sessions and what
// applications were given here.
import { and, eq, inArray, isNotNull, lt, notExists, sql } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import {
  cancelledEvents,
  events,
  oauthAccessTokens,
  oauthClientAssertions,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  sessions,
  users,
  verifications,
} from '../../db/schema.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * How long an application nobody is connected to is kept after its document was last read. One
 * being connected was read within the last hour and ten minutes: Better Auth reads the document
 * again at each step once it is an hour old (`createAuth`), and the consent page must be
 * answered within 10 minutes of the step that sent the account there.
 */
const applicationKeptFor = 24 * 60 * 60 * 1000;

/**
 * Deletes, in the caller's transaction, the accounts that own no event and were last used more
 * than 6 months before `now` (a session created or renewed, or a token given to an application
 * or renewed by it), their sessions, what they allowed applications to do (consents and tokens,
 * whose keys to the account cascade) and what is left of the events they cancelled with them;
 * the sign-in codes and sessions expired by `now`, as a code holds the email it was asked for;
 * and what applications were given that can no longer be used (`deleteUsedUpAccess`). Answers
 * how many accounts it deleted.
 */
export async function deleteNoLongerKept(
  queries: Database | Transaction,
  now: Date,
): Promise<number> {
  const deleted = await queries
    .delete(users)
    .where(
      and(
        // 6 months by the calendar in UTC, whatever the database's time zone.
        lt(
          users.lastSeenAt,
          sql`(${now}::timestamptz at time zone 'UTC' - interval '6 months') at time zone 'UTC'`,
        ),
        notExists(
          queries
            .select({ owner: events.ownerId })
            .from(events)
            .where(eq(events.ownerId, users.id)),
        ),
      ),
    )
    .returning({ id: users.id });
  // An account with no event left has no cancellation under way, so no tombstone comes after.
  await queries.delete(cancelledEvents).where(
    inArray(
      cancelledEvents.ownerId,
      deleted.map(({ id }) => id),
    ),
  );
  await queries.delete(verifications).where(lt(verifications.expiresAt, now));
  await queries.delete(sessions).where(lt(sessions.expiresAt, now));
  await deleteUsedUpAccess(queries, now);
  return deleted.length;
}

/**
 * Deletes what applications were given and Better Auth can no longer take, so that it answers
 * every request as it would with the rows still stored:
 * - the refresh tokens past their expiry, replaced or not, with the access tokens issued with
 *   them: Better Auth refuses an expired one before anything else it checks. Until then a
 *   replaced one stays, as presenting it again takes back every token the application holds for
 *   the account, and a deleted one would only be refused;
 * - the access tokens stored past their expiry (only a token issued for no address is stored);
 * - the applications read from their document, last read more than a day ago, that no account
 *   allowed and that hold no token (once the tokens above are gone, so in the same run): Better
 *   Auth reads the document again for one it does not find, so connecting it again stores it;
 * - the proofs of signed requests past their expiry, by when the statement they recorded is
 *   refused as expired. The proofs that a token is bound to a key are sign-in codes' rows
 *   (`verifications`), deleted with the codes.
 */
async function deleteUsedUpAccess(queries: Database | Transaction, now: Date): Promise<void> {
  await queries.delete(oauthRefreshTokens).where(lt(oauthRefreshTokens.expiresAt, now));
  await queries.delete(oauthAccessTokens).where(lt(oauthAccessTokens.expiresAt, now));
  await queries
    .delete(oauthClients)
    .where(
      and(
        isNotNull(oauthClients.clientDiscoveryId),
        lt(oauthClients.updatedAt, new Date(now.getTime() - applicationKeptFor)),
        notExists(
          queries
            .select({ id: oauthConsents.id })
            .from(oauthConsents)
            .where(eq(oauthConsents.clientId, oauthClients.clientId)),
        ),
        notExists(
          queries
            .select({ id: oauthRefreshTokens.id })
            .from(oauthRefreshTokens)
            .where(eq(oauthRefreshTokens.clientId, oauthClients.clientId)),
        ),
        notExists(
          queries
            .select({ id: oauthAccessTokens.id })
            .from(oauthAccessTokens)
            .where(eq(oauthAccessTokens.clientId, oauthClients.clientId)),
        ),
      ),
    );
  await queries.delete(oauthClientAssertions).where(lt(oauthClientAssertions.expiresAt, now));
}

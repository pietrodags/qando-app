// The accounts qando no longer keeps: Better Auth's tables are written only from this module, so
// the scheduled deletion (`apps/api/src/retention`) deletes accounts, codes and sessions here.
import { and, eq, lt, notExists, sql } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import { events, sessions, users, verifications } from '../../db/schema.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Deletes, in the caller's transaction, the accounts that own no event and were last used more
 * than 6 months before `now` (a session created or renewed), their sessions with them; and the
 * sign-in codes and sessions expired by `now`, as a code holds the email it was asked for.
 * Answers how many accounts it deleted.
 */
export async function deleteUnusedAccounts(
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
  await queries.delete(verifications).where(lt(verifications.expiresAt, now));
  await queries.delete(sessions).where(lt(sessions.expiresAt, now));
  return deleted.length;
}

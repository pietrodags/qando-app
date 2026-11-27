import { eq } from 'drizzle-orm';
import {
  cancelledEvents,
  events,
  oauthConsents,
  oauthRefreshTokens,
  users,
  verifications,
} from '../../db/schema.js';
import type { Queries } from './whole-requests.js';

/**
 * Deletes, in one transaction (part of the one `queries` is in, if any), the account with
 * everything it owns: its events with everything under them (their keys cascade), what is left
 * of the events it cancelled, its sessions and what it allowed applications to do (its consents
 * and the tokens given for it), and the stored code under `codeIdentifier`, used up. What is not
 * deleted by name goes by the cascade of its key to the account. Answers how many of its events it deleted; an account already gone
 * deletes nothing.
 */
export async function deleteAccount(
  queries: Queries,
  accountId: string,
  codeIdentifier: string,
): Promise<number> {
  return queries.transaction(async (tx) => {
    // The account is held first: an event being created for it waits, then finds no account to
    // own it, so no event is left behind, and none can stop the account's deletion.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, accountId)).for('update');
    const deleted = await tx
      .delete(events)
      .where(eq(events.ownerId, accountId))
      .returning({ id: events.id });
    // After the events: a cancellation the deletion waited for has written its tombstone.
    await tx.delete(cancelledEvents).where(eq(cancelledEvents.ownerId, accountId));
    // The consents before the refresh tokens, as a disconnection takes them
    // (`connectedApplicationsOf`): neither of the two at once waits for the other while the
    // other waits for it. Left to the keys' cascade, the order would be the one PostgreSQL
    // follows them in, by the names it gave them, which a key declared again changes.
    await tx.delete(oauthConsents).where(eq(oauthConsents.userId, accountId));
    await tx.delete(oauthRefreshTokens).where(eq(oauthRefreshTokens.userId, accountId));
    await tx.delete(users).where(eq(users.id, accountId));
    await tx.delete(verifications).where(eq(verifications.identifier, codeIdentifier));
    return deleted.length;
  });
}

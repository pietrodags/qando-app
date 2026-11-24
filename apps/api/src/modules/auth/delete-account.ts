import { eq } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import { cancelledEvents, events, users, verifications } from '../../db/schema.js';

/**
 * Deletes, in one transaction, the account with everything it owns: its events with everything
 * under them (their keys cascade), what is left of the events it cancelled, its sessions, and
 * the stored code under `codeIdentifier`, used up. An account already gone deletes nothing.
 */
export async function deleteAccount(
  db: Database,
  accountId: string,
  codeIdentifier: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    // The account is held first: an event being created for it waits, then finds no account to
    // own it, so no event is left behind, and none can stop the account's deletion.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, accountId)).for('update');
    await tx.delete(events).where(eq(events.ownerId, accountId));
    // After the events: a cancellation the deletion waited for has written its tombstone.
    await tx.delete(cancelledEvents).where(eq(cancelledEvents.ownerId, accountId));
    await tx.delete(users).where(eq(users.id, accountId));
    await tx.delete(verifications).where(eq(verifications.identifier, codeIdentifier));
  });
}

import { closingNow } from '@qando/domain';
import { changeManagedEvent } from './change-managed-event.js';
import type { ManagedEvents, ManagementCredentials } from './managed-events.js';
import type { ManagedEventReading } from './read-managed-event.js';

/**
 * What closing voting amounts to: the event as it is now, or why nothing closed; besides the
 * refusals of every management request, a date is confirmed, which closed voting already.
 */
export type VotingClosure = ManagedEventReading | { readonly status: 'already-confirmed' };

/**
 * The use case behind "Cerrar votación", free of HTTP like `readManagedEvent`: voting closes now,
 * the deadline becomes today and the "voting closed" email is due at once. On an event already
 * closed (by its deadline, another tab, a retry) it answers as the first time and changes
 * nothing, so the closing stays the real one and no other email goes. Checked and stored with
 * the event locked, so the votes being stored finish first and none is stored after it.
 */
export async function closeVoting(
  managedEvents: ManagedEvents,
  participationId: string,
  credentials: ManagementCredentials,
  now: () => Date,
): Promise<VotingClosure> {
  return changeManagedEvent(
    managedEvents,
    participationId,
    credentials,
    now,
    async (event, change, organizer) => {
      if (event.confirmedOptionId !== null) return { status: 'already-confirmed' } as const;
      const closing = closingNow(event, now());
      if (closing) await change.setClosing(organizer, closing);
      return undefined;
    },
  );
}

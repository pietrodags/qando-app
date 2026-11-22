import { closingNow } from '@qando/domain';
import {
  actingOrganizer,
  type ManagedEvents,
  type ManagementCredentials,
} from './managed-events.js';
import { managedEventFor, type ManagedEventReading } from './read-managed-event.js';

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
  const access = await actingOrganizer(managedEvents, participationId, credentials);
  if (access.status !== 'granted') return access;
  const { organizer } = access;

  const refusal = await managedEvents.change(async (change) => {
    const event = await change.lock(organizer);
    if (!event) return { status: 'forbidden' } as const;
    if (event.confirmedOptionId !== null) return { status: 'already-confirmed' } as const;
    const closing = closingNow(event, now());
    if (closing) await change.setClosing(organizer, closing);
    return undefined;
  });
  return refusal ?? managedEventFor(managedEvents, organizer, now);
}

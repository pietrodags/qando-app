import {
  actingOrganizer,
  type ManagedEvents,
  type ManagementCredentials,
} from './managed-events.js';
import { managedEventFor, type ManagedEventReading } from './read-managed-event.js';

/**
 * What confirming an option amounts to: the event as it is now, or why nothing was confirmed;
 * besides the refusals of every management request, another option is confirmed already, or the
 * option is not one of the event's.
 */
export type Confirmation =
  | ManagedEventReading
  | { readonly status: 'already-confirmed' }
  | { readonly status: 'not-an-option'; readonly optionId: string };

/**
 * The use case behind confirming the final option, free of HTTP like `readManagedEvent`. Allowed
 * before or after the deadline; a confirmation is final, but the confirmed option sent again (a
 * retry after a lost answer) answers the event as the first time and changes nothing. Checked
 * and stored with the event locked, so two confirmations at once cannot both win and no vote is
 * stored after voting closed. Removing the pending "voting closed" email joins this transaction
 * when emails exist.
 */
export async function confirmOption(
  managedEvents: ManagedEvents,
  participationId: string,
  credentials: ManagementCredentials,
  optionId: string,
  now: () => Date,
): Promise<Confirmation> {
  const access = await actingOrganizer(managedEvents, participationId, credentials);
  if (access.status !== 'granted') return access;
  const { organizer } = access;

  const refusal = await managedEvents.change(async (change) => {
    const event = await change.lock(organizer);
    if (!event) return { status: 'forbidden' } as const;
    if (event.confirmedOptionId !== null) {
      return event.confirmedOptionId === optionId
        ? undefined
        : ({ status: 'already-confirmed' } as const);
    }
    if (!event.optionIds.includes(optionId)) return { status: 'not-an-option', optionId } as const;
    await change.confirm(organizer, optionId);
    return undefined;
  });
  return refusal ?? managedEventFor(managedEvents, organizer, now);
}

import { changeManagedEvent } from './change-managed-event.js';
import type { ManagedEvents, ManagementCredentials } from './managed-events.js';
import type { ManagedEventReading } from './read-managed-event.js';

/**
 * What confirming an option amounts to: the event as it is now, or why nothing was confirmed;
 * besides the refusals of every management request, another option is confirmed already, or the
 * option is not one of the event's now (the page that sent it shows options replaced since).
 */
export type Confirmation =
  | ManagedEventReading
  | { readonly status: 'already-confirmed' }
  | { readonly status: 'options-changed' };

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
  // A UUID's letters may come in either case; the stored IDs are lower case.
  const chosen = optionId.toLowerCase();
  return changeManagedEvent(
    managedEvents,
    participationId,
    credentials,
    now,
    async (event, change, organizer) => {
      if (event.confirmedOptionId !== null) {
        return event.confirmedOptionId === chosen
          ? undefined
          : ({ status: 'already-confirmed' } as const);
      }
      if (!event.optionIds.includes(chosen)) return { status: 'options-changed' } as const;
      await change.confirm(organizer, chosen);
      return undefined;
    },
  );
}

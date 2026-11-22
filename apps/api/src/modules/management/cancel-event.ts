import {
  actingOrganizer,
  type ManagedEvents,
  type ManagementCredentials,
  type ManagementRefusal,
} from './managed-events.js';

/**
 * What cancelling an event amounts to: its title, once it is deleted, or why nothing was
 * cancelled; an event cancelled before (a repeat) is the refusal of every management request.
 */
export type EventCancellation =
  { readonly status: 'deleted'; readonly title: string } | ManagementRefusal;

/**
 * The use case behind "Cancelar evento", free of HTTP like `readManagedEvent`: allowed in any
 * state, it deletes the event and everything under it, keeping only its title behind its links.
 * The page writes the text to forward from the title.
 */
export async function cancelEvent(
  managedEvents: ManagedEvents,
  participationId: string,
  credentials: ManagementCredentials,
): Promise<EventCancellation> {
  const access = await actingOrganizer(managedEvents, participationId, credentials);
  if (access.status !== 'granted') return access;
  const title = await managedEvents.cancel(access.organizer);
  // Only cancelling deletes an event: another request cancelled it since the check (a second
  // tab, an agent's retry), so it is answered as that repeat would be.
  return title === undefined
    ? cancelEvent(managedEvents, participationId, credentials)
    : { status: 'deleted', title };
}

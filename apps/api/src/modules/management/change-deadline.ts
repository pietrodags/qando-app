import { deadlineClosing, type DeadlineProblem } from '@qando/domain';
import {
  actingOrganizer,
  refusalSinceTheCheck,
  type ManagedEvents,
  type ManagementCredentials,
} from './managed-events.js';
import { readManagedEvent, type ManagedEventReading } from './read-managed-event.js';

/**
 * What changing the deadline amounts to: the event as it is now, or why nothing changed; besides
 * the refusals of every management request, a date is confirmed (a confirmation is final), or
 * the day cannot be chosen.
 */
export type DeadlineChange =
  | ManagedEventReading
  | { readonly status: 'already-confirmed' }
  | { readonly status: 'deadline-refused'; readonly problem: DeadlineProblem };

/**
 * The use case behind the management page's deadline, free of HTTP like `readManagedEvent`: any
 * day from today to twelve months ahead, earlier than the current one too. Voting is open until
 * the end of the new day, so a closed event reopens, and the "voting closed" email follows the
 * new closing. Checked and stored with the event locked, so a confirmation sent meanwhile either
 * comes first and refuses it, or waits for it.
 */
export async function changeDeadline(
  managedEvents: ManagedEvents,
  participationId: string,
  credentials: ManagementCredentials,
  deadline: string,
  now: () => Date,
): Promise<DeadlineChange> {
  const access = await actingOrganizer(managedEvents, participationId, credentials);
  if (access.status !== 'granted') return access;
  const { organizer } = access;

  const refusal = await managedEvents.change(async (change) => {
    const event = await change.lock(organizer);
    // Cancelled by another request since the check (a second tab): answered as a repeat would be.
    if (!event) return { status: 'gone' } as const;
    if (event.confirmedOptionId !== null) return { status: 'already-confirmed' } as const;
    const chosen = deadlineClosing(deadline, event.timeZone, now());
    if (!chosen.ok) return { status: 'deadline-refused', problem: chosen.problem } as const;
    await change.setClosing(organizer, chosen.closing);
    return undefined;
  });
  if (refusal?.status === 'gone') {
    return refusalSinceTheCheck(managedEvents, participationId, credentials);
  }
  return refusal ?? readManagedEvent(managedEvents, participationId, credentials, now);
}

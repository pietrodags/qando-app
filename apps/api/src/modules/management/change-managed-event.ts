import {
  actingOrganizer,
  refusalSinceTheCheck,
  type ActingOrganizer,
  type EventChange,
  type LockedEvent,
  type ManagedEvents,
  type ManagementCredentials,
} from './managed-events.js';
import { readManagedEvent, type ManagedEventReading } from './read-managed-event.js';

/** Marks an event that was gone when its lock was taken. */
const gone: unique symbol = Symbol();

/**
 * What a use case decides about the locked event: a refusal of its own, or nothing when it is
 * done (changed, or nothing to change), its changes made through `change` in the same
 * transaction.
 */
type ManagedEventDecision<Refusal> = (
  event: LockedEvent,
  change: EventChange,
  organizer: ActingOrganizer,
) => Promise<Refusal | undefined>;

/**
 * Every use case that changes a managed event goes through here, so each keeps only its own
 * rules (`decide`): who is acting is checked first, then the event is locked and decided in one
 * transaction, and with nothing refused the answer is the event as it is now. An event gone
 * when the lock is taken, or before it is read, was cancelled by another request since the
 * check (a second tab): it is answered as any later request is, `cancelled` with the title.
 */
export async function changeManagedEvent<Refusal>(
  managedEvents: ManagedEvents,
  participationId: string,
  credentials: ManagementCredentials,
  now: () => Date,
  decide: ManagedEventDecision<Refusal>,
): Promise<ManagedEventReading | Refusal> {
  const access = await actingOrganizer(managedEvents, participationId, credentials);
  if (access.status !== 'granted') return access;
  const { organizer } = access;

  const refusal = await managedEvents.change(async (change) => {
    const event = await change.lock(organizer);
    return event ? decide(event, change, organizer) : gone;
  });
  if (refusal === gone) return refusalSinceTheCheck(managedEvents, participationId, credentials);
  return refusal ?? readManagedEvent(managedEvents, participationId, credentials, now);
}

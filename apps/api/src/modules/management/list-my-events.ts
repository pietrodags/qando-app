import type { MyEvent } from '@qando/contracts';
import { currentState } from '@qando/domain';
import type { ManagedEvents } from './managed-events.js';

/**
 * The use case behind "Mis eventos", free of HTTP so every adapter (the API's route, later the
 * organizers' MCP connector) lists the same: the events the account owns, newest first, each in
 * its state at the time `now` answers.
 */
export async function listMyEvents(
  managedEvents: ManagedEvents,
  accountId: string,
  now: () => Date,
): Promise<MyEvent[]> {
  const owned = await managedEvents.ownedBy(accountId);
  const at = now();
  return owned.map(({ participationId, title, deadline, state, closesAt, createdAt }) => ({
    id: participationId,
    title,
    deadline,
    state: currentState({ state, closesAt }, at),
    createdAt: createdAt.toISOString(),
  }));
}

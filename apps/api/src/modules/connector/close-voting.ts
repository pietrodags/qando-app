import { z } from 'zod';
import { closeVoting } from '../management/close-voting.js';
import type { ManagedEvents } from '../management/managed-events.js';
import { refusalOf, undecidedEvent } from './account-event.js';
import { texts } from './texts.js';
import type { Caller, Refused, Said, Tool } from './tool.js';

/** What a call gives: the event. */
function askedSchema() {
  return z.object({
    id: z.string().min(1).meta({ description: texts.tools.closeVoting.input.id }),
  });
}

/**
 * An event's voting as the data of "Cerrar la votación" and "Cambiar el plazo" gives it once
 * either is done: open or closed, and its last day to vote (`YYYY-MM-DD`).
 */
export function votingSchema() {
  return z.object({
    id: z.string(),
    state: z.enum(['open', 'closed']),
    deadline: z.string(),
  });
}

type Asked = z.infer<ReturnType<typeof askedSchema>>;
type Voting = z.infer<ReturnType<typeof votingSchema>>;

/**
 * "Cerrar la votación", the tool `close_voting`: voting on one of the account's events closes
 * now, as on the management page (`closeVoting`), in one call, as it can be undone: a new
 * deadline reopens it, which the answer says. The "voting closed" email goes to the organizer
 * at once. Voting closed before the call (by its deadline, or by a call before) changes nothing
 * and is answered with the day it closed. An event whose date is confirmed is answered with that
 * date, also when it is confirmed while voting closes; another organizer's event as one that
 * does not exist, a cancelled one as cancelled.
 */
export function closeVotingTool(
  managedEvents: ManagedEvents,
  now: () => Date,
): Tool<Asked, Voting> {
  async function answer(caller: Caller, { id }: Asked): Promise<Said<Voting> | Refused> {
    const { accountId } = caller;
    const event = await undecidedEvent(managedEvents, accountId, id, now);
    if ('refused' in event) return event;
    if (event.state === 'closed') {
      const { title, deadline } = event;
      return {
        text: texts.close.already(title, deadline),
        data: { id, state: 'closed', deadline },
      };
    }
    const closure = await closeVoting(managedEvents, id, { accountId }, now);
    // Confirmed since it was read: answered from the event as it is now, with its date.
    if (closure.status === 'already-confirmed') return answer(caller, { id });
    if (closure.status !== 'found') return refusalOf(closure);
    const { title, deadline } = closure.event;
    return { text: texts.close.done(title), data: { id, state: 'closed', deadline } };
  }

  return {
    name: 'close_voting',
    title: texts.tools.closeVoting.title,
    description: texts.tools.closeVoting.description,
    effect: 'changes',
    input: askedSchema(),
    data: votingSchema(),
    answer,
  };
}

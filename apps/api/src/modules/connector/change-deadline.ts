import { changeDeadlineBodySchema } from '@qando/contracts';
import type { DeadlineProblem } from '@qando/domain';
import { z } from 'zod';
import { changeDeadline } from '../management/change-deadline.js';
import type { ManagedEvents } from '../management/managed-events.js';
import { refusalOf, undecidedEvent } from './account-event.js';
import { votingSchema } from './close-voting.js';
import { texts } from './texts.js';
import type { Caller, Refused, Said, Tool } from './tool.js';

const described = texts.tools.changeDeadline.input;

/** What a call gives: the event, and its new last day to vote. */
const askedSchema = z.object({
  id: z.string().min(1).meta({ description: described.id }),
  deadline: changeDeadlineBodySchema.shape.deadline.meta({ description: described.deadline }),
});

type Asked = z.infer<typeof askedSchema>;
type Voting = z.infer<typeof votingSchema>;

/**
 * "Cambiar el plazo", the tool `change_deadline`: the last day to vote on one of the account's
 * events, as on the management page (`changeDeadline`), in one call, as it can be changed again:
 * any day from today to 12 months ahead in the event's time zone, earlier than the current one
 * too. Voting closed reopens until the end of that day, and the answer says it reopened. A day
 * that cannot be chosen is refused in words that say why; an event whose date is confirmed is
 * answered with that date, also when it is confirmed while the deadline changes; another
 * organizer's event as one that does not exist, a cancelled one as cancelled.
 */
export function changeDeadlineTool(
  managedEvents: ManagedEvents,
  now: () => Date,
): Tool<Asked, Voting> {
  async function answer(caller: Caller, asked: Asked): Promise<Said<Voting> | Refused> {
    const { accountId } = caller;
    const { id, deadline } = asked;
    const event = await undecidedEvent(managedEvents, accountId, id, now);
    if ('refused' in event) return event;
    const change = await changeDeadline(managedEvents, id, { accountId }, deadline, now);
    // Confirmed since it was read: answered from the event as it is now, with its date.
    if (change.status === 'already-confirmed') return answer(caller, asked);
    if (change.status === 'deadline-refused')
      return { refused: refusalSaid(change.problem, deadline) };
    if (change.status !== 'found') return refusalOf(change);
    const said = event.state === 'closed' ? texts.deadline.reopened : texts.deadline.changed;
    const changed = change.event;
    return {
      text: said(changed.title, changed.deadline),
      data: { id, state: 'open', deadline: changed.deadline },
    };
  }

  return {
    name: 'change_deadline',
    title: texts.tools.changeDeadline.title,
    description: texts.tools.changeDeadline.description,
    effect: 'changes',
    input: askedSchema,
    data: votingSchema,
    answer,
  };
}

/** Why the day asked cannot be the deadline, in words. */
function refusalSaid({ code }: DeadlineProblem, deadline: string): string {
  return code === 'DEADLINE_PAST' ? texts.deadline.past(deadline) : texts.deadline.tooFar;
}

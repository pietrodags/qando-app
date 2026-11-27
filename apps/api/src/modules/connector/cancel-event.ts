import { z } from 'zod';
import { cancelEvent } from '../management/cancel-event.js';
import type { ManagedEvents } from '../management/managed-events.js';
import { accountEvent, refusalOf } from './account-event.js';
import type { ConfirmationCodes } from './confirmation-code.js';
import { texts } from './texts.js';
import type { Caller, Refused, Said, Tool } from './tool.js';

const described = texts.tools.cancelEvent.input;

/** What a call gives: the event, and the code of the first call once the organizer said yes. */
function askedSchema() {
  return z.object({
    id: z.string().min(1).meta({ description: described.id }),
    code: z.string().optional().meta({ description: described.code }),
  });
}

/** The event asked, and whether it is now cancelled or waits for the code given with it. */
function cancellingSchema() {
  return z.object({
    id: z.string(),
    cancelled: z.boolean(),
    code: z.string().nullable(),
  });
}

type Asked = z.infer<ReturnType<typeof askedSchema>>;
type Cancelled = z.infer<ReturnType<typeof cancellingSchema>>;

/**
 * "Cancelar un evento", the tool `cancel_event`: one of the account's events, deleted for good
 * in any state, always in two calls, as confirming a date, since no assistant can be counted on
 * to ask the organizer first. Called without a code it deletes nothing: it answers what
 * cancelling does, in the words of the web's question before cancelling, that it is final, and a
 * code. Called again with that code it cancels the event as the management page does
 * (`cancelEvent`), and answers the message to forward to the group.
 *
 * The code holds for 10 minutes, for the account, the application and the event, and only for
 * cancelling: one given to confirm a date does not cancel. A code that does not hold, whatever
 * the reason, cancels nothing and is answered as a new first answer, which opens by saying so,
 * with a new code. An event cancelled already, also by a call before with the same code, is
 * answered as cancelled; another organizer's event as one that does not exist.
 */
export function cancelEventTool(
  managedEvents: ManagedEvents,
  codes: ConfirmationCodes,
  now: () => Date,
): Tool<Asked, Cancelled> {
  async function answer(caller: Caller, { id, code }: Asked): Promise<Said<Cancelled> | Refused> {
    const { accountId } = caller;
    const event = await accountEvent(managedEvents, accountId, id, now);
    if ('refused' in event) return event;
    const say = texts.cancel;
    const cancelling = { action: 'cancel', ...caller, eventId: id } as const;
    const at = now();
    if (code === undefined || !codes.holds(code, cancelling, at)) {
      const given = codes.give(cancelling, at);
      return {
        text: [
          code === undefined ? say.nothingYet : say.codeVoid,
          say.question(event.title),
          say.deletes,
          say.links,
          say.final,
          say.code(given),
        ].join('\n'),
        data: { id, cancelled: false, code: given },
      };
    }
    const cancellation = await cancelEvent(managedEvents, id, { accountId });
    if (cancellation.status !== 'deleted') return refusalOf(cancellation);
    return { text: say.done(cancellation.title), data: { id, cancelled: true, code: null } };
  }

  return {
    name: 'cancel_event',
    title: texts.tools.cancelEvent.title,
    description: texts.tools.cancelEvent.description,
    effect: 'changes',
    input: askedSchema(),
    data: cancellingSchema(),
    answer,
  };
}

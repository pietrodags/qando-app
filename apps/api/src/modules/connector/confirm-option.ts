import { proposedOptionSchema, type ManagedEvent, type Option } from '@qando/contracts';
import { confirmationNotes, sameOption, type DecisionFacts } from '@qando/domain';
import { z } from 'zod';
import { confirmAsAsked } from '../management/confirm-option.js';
import type { ManagedEvents } from '../management/managed-events.js';
import { readManagedEvent } from '../management/read-managed-event.js';
import type { ConfirmationCodes } from './confirmation-code.js';
import { texts } from './texts.js';
import type { Caller, Refused, Said, Tool } from './tool.js';

const described = texts.tools.confirmOption.input;

/**
 * A date as a call names it, and as the data gives it back: its days and its time, the shape
 * "Crear un evento" proposes options in, written out whole.
 */
const dateShape = z.object(proposedOptionSchema.shape);

/** What a call gives: the event, the date, and the code of the first call once the organizer said yes. */
const askedSchema = z.object({
  id: z.string().min(1).meta({ description: described.id }),
  option: dateShape.meta({ description: described.option }),
  code: z.string().optional().meta({ description: described.code }),
});

/** The date asked, and whether it is now confirmed or waits for the code given with it. */
const confirmingSchema = z.object({
  id: z.string(),
  option: dateShape,
  confirmed: z.boolean(),
  code: z.string().nullable(),
});

type Asked = z.infer<typeof askedSchema>;
type Answered = Said<z.infer<typeof confirmingSchema>> | Refused;

/**
 * "Confirmar la fecha", the tool `confirm_option`: the final date of one of the account's events,
 * always in two calls, as no assistant can be counted on to ask the organizer first. Called
 * without a code it changes nothing: it answers what confirming would do, with the notes of the
 * web's question before confirming that apply (nobody voted, nobody can attend, not the date
 * the results recommend, voting still open) and always that it is final, and a code. Called
 * again with that code it confirms the date, as the management page does (`confirmAsAsked`).
 *
 * The code holds for 10 minutes, for the account, the application, the event and the date it
 * was given for, while the facts its notes were said from are still the event's: read again
 * with the event locked, so a vote that arrives at the last moment counts too. A code that does
 * not hold, whatever the reason, confirms nothing and is answered as a new first answer, which
 * opens by saying so, with a new code.
 *
 * The date is named by its days and time, matched against the event's options; one that is no
 * option is said to be none. A date confirmed already is answered with that date; another
 * organizer's event as one that does not exist, a cancelled one as cancelled.
 */
export function confirmOptionTool(
  managedEvents: ManagedEvents,
  codes: ConfirmationCodes,
  now: () => Date,
): Tool<Asked, z.infer<typeof confirmingSchema>> {
  /** The answer to a call, from the event as it is now; `retried`, the code sent did not hold. */
  async function answer(caller: Caller, asked: Asked, retried: boolean): Promise<Answered> {
    const { accountId } = caller;
    const reading = await readManagedEvent(managedEvents, asked.id, { accountId }, now);
    if (reading.status === 'cancelled') return { refused: texts.answers.cancelled(reading.title) };
    if (reading.status !== 'found') return { refused: texts.answers.notFound };
    const { event } = reading;
    const say = texts.confirm;
    if (event.confirmedOption !== null) {
      const { dates, time } = event.confirmedOption;
      return { refused: say.already(event.title, dates, time) };
    }
    const option = event.options.find((offered) => sameOption(offered, asked.option));
    if (!option) return { refused: say.notAnOption(event.title) };
    const { state, voters, recommendedOptionIds } = event;
    const facts: DecisionFacts = { state, voters, recommendedOptionIds };
    const confirming = { ...caller, eventId: asked.id, optionId: option.id, facts };
    const at = now();
    if (asked.code === undefined || retried || !codes.holds(asked.code, confirming, at)) {
      const code = codes.give(confirming, at);
      return {
        text: [
          retried || asked.code !== undefined ? say.codeVoid : say.nothingYet,
          say.question(event.title, option.dates, option.time),
          ...notesOf(event, option),
          say.final,
          say.code(code),
        ].join('\n'),
        data: { id: asked.id, option: asked.option, confirmed: false, code },
      };
    }
    const confirmation = await confirmAsAsked(
      managedEvents,
      asked.id,
      { accountId },
      option.id,
      facts,
      now,
    );
    // Anything else changed since the event was read: answered from the event as it is now.
    if (confirmation.status !== 'found') return answer(caller, asked, true);
    return {
      text: say.done(event.title, option.dates, option.time),
      data: { id: asked.id, option: asked.option, confirmed: true, code: null },
    };
  }

  return {
    name: 'confirm_option',
    title: texts.tools.confirmOption.title,
    description: texts.tools.confirmOption.description,
    effect: 'changes',
    input: askedSchema,
    data: confirmingSchema,
    answer: (caller, asked) => answer(caller, asked, false),
  };
}

/**
 * The notes of the web's question before confirming that apply to the option, from the same
 * facts and in the same order, in the connector's words: not a date the results recommend says
 * those it recommends, in the event's order.
 */
function notesOf(event: ManagedEvent, option: Option): string[] {
  const say = texts.confirm;
  return confirmationNotes(event, option.id).map((note) => {
    switch (note) {
      case 'no-votes':
        return say.noVotes;
      case 'nobody-can-attend':
        return say.nobodyCanAttend;
      case 'not-recommended':
        return say.notRecommended(
          event.options.filter(({ id }) => event.recommendedOptionIds.includes(id)),
        );
      case 'open':
        return say.open;
      case 'open-no-votes':
        return say.openNoVotes;
    }
  });
}

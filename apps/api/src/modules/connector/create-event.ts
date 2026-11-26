import { createEventBodySchema, proposedOptionSchema } from '@qando/contracts';
import { onQuarter, type NewEventProblem, type ProposedOption } from '@qando/domain';
import { z } from 'zod';
import { createEventOnce, type NewEvents } from '../events/create-event.js';
import { texts } from './texts.js';
import type { Tool } from './tool.js';

const described = texts.tools.createEvent.input;
const body = createEventBodySchema.shape;

/**
 * What a call gives: the event as the wizard sends it, without the name, which is the last
 * event's when left out, nor voting without names, off when left out. Each option's shape is
 * written out whole: under the contract's name the published shape would point to a definition
 * an application has to follow.
 */
const askedSchema = z.object({
  title: body.title.meta({ description: described.title }),
  organizerName: body.organizerName.optional().meta({ description: described.organizerName }),
  note: body.note.meta({ description: described.note }),
  options: z.array(z.object(proposedOptionSchema.shape)).meta({ description: described.options }),
  deadline: body.deadline.meta({ description: described.deadline }),
  timeZone: body.timeZone.meta({ description: described.timeZone }),
  anonymous: body.anonymous.optional().meta({ description: described.anonymous }),
});

/** The event created: the identifier the other tools take it by, its title and its voting link. */
const createdSchema = z.object({ id: z.string(), title: z.string(), votingLink: z.url() });

/**
 * "Crear un evento", the tool `create_event`: the event created for the account, as the wizard
 * creates it, by an assistant that sends no token of its own (`createEventOnce`): the same event
 * sent again within 10 minutes is the first one, and an account creates at most 10 an hour. It
 * answers the voting link alone, never the results link nor the management link, which reaches
 * the organizer only in the summary email. An event the web would refuse is not created, and each
 * of its problems is said once; an account past its events of the hour is told how long to wait.
 */
export function createEventTool(
  newEvents: NewEvents,
  now: () => Date,
  website: string,
): Tool<z.infer<typeof askedSchema>, z.infer<typeof createdSchema>> {
  return {
    name: 'create_event',
    title: texts.tools.createEvent.title,
    description: texts.tools.createEvent.description,
    effect: 'adds',
    input: askedSchema,
    data: createdSchema,
    answer: async (accountId, { anonymous = false, ...event }) => {
      const creation = await createEventOnce(newEvents, accountId, { ...event, anonymous }, now());
      switch (creation.status) {
        case 'created': {
          const { title, links } = creation;
          const votingLink = new URL(`/vote/${links.participationId}`, website).href;
          return {
            text: texts.answers.created(title, votingLink),
            data: { id: links.participationId, title, votingLink },
          };
        }
        case 'rejected': {
          const said = toSay(creation.problems, event.options).map((problem) =>
            problemSaid(problem, event.options),
          );
          return { refused: texts.answers.notCreated([...new Set(said)]) };
        }
        case 'limited':
          return { refused: texts.limits.events(creation.retryAfterSeconds) };
      }
    },
  };
}

/**
 * The problems to say: a time range within a single clock hour is left out of an option that
 * starts off the quarters, as its way to the next hour, from that start ("20:10–21:00"), would be
 * off them too; once the start is on a quarter, the next call says it.
 */
function toSay(
  problems: readonly NewEventProblem[],
  options: readonly ProposedOption[],
): NewEventProblem[] {
  return problems.filter(
    (problem) =>
      problem.code !== 'TIME_RANGE_WITHIN_ONE_HOUR' ||
      onQuarter(endsOf(optionAt(options, problem.index).time)[0]),
  );
}

/** A problem in words; one of an option names it by the option at its place in the call. */
function problemSaid(problem: NewEventProblem, options: readonly ProposedOption[]): string {
  const say = texts.problems;
  switch (problem.code) {
    case 'NAME_MISSING':
      return say.nameMissing;
    case 'NAME_TOO_SHORT':
      return say.nameTooShort;
    case 'NAME_TOO_LONG':
      return say.nameTooLong;
    case 'TITLE_MISSING':
      return say.titleMissing;
    case 'TITLE_TOO_LONG':
      return say.titleTooLong;
    case 'NO_OPTIONS':
      return say.optionsMissing;
    case 'TOO_MANY_OPTIONS':
      return say.tooMany;
    case 'DEADLINE_PAST':
      return say.deadlinePast;
    case 'DEADLINE_TOO_FAR':
      return say.deadlineTooFar;
    case 'NOTE_TOO_LONG':
      return say.noteTooLong;
    case 'DATE_TOO_FAR':
      return say.horizon;
  }
  const { dates, time } = optionAt(options, problem.index);
  const day = dates.kind === 'single' ? dates.date : dates.start;
  switch (problem.code) {
    case 'DATE_PAST':
      return say.past(day);
    case 'DATE_RANGE_DEGENERATE':
      return dates.kind === 'range' && dates.end < dates.start
        ? say.dateRangeBackwards(dates)
        : say.dateRangeDegenerate(dates);
    case 'TIME_ON_DATE_RANGE':
      return say.timeOnDateRange(dates);
    case 'WHOLE_DAY_WITH_TIMES':
      return say.wholeDayWithTimes(day);
    case 'DUPLICATE':
      return say.duplicate(dates, time);
  }
  const [start, end] = endsOf(time);
  switch (problem.code) {
    case 'TIME_OFF_QUARTER':
      return say.offQuarter(onQuarter(start) ? end : start, day);
    case 'TIME_RANGE_DEGENERATE':
      return say.rangeDegenerate(start, end, day);
    case 'TIME_RANGE_WITHIN_ONE_HOUR':
      return say.rangeWithinHour(start, end);
  }
}

/** The option at a problem's place in the call. */
function optionAt(options: readonly ProposedOption[], index: number): ProposedOption {
  const option = options[index];
  // Stryker disable next-line all: the domain names only an option the call has; the check is for
  // the compiler.
  if (!option) throw new Error(`The call has no option ${String(index)}`);
  return option;
}

/** Where a time starts and ends: a single time at both ends. */
function endsOf(time: ProposedOption['time']): [string, string] {
  // Stryker disable next-line all: the domain finds a fault of a time only in an option that has
  // one; the check is for the compiler.
  if (!time) throw new Error('The option has no time');
  return time.kind === 'single' ? [time.at, time.at] : [time.start, time.end];
}

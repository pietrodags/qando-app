import {
  optionSchema,
  publicEventSchema,
  resultsOptionSchema,
  resultsSchema,
  type PublicEvent,
  type Results,
  type ResultsOption,
} from '@qando/contracts';
import { z } from 'zod';
import type { ManagedEvents } from '../management/managed-events.js';
import { readOrganizerEvent, type EventResults } from '../results/read-results.js';
import { texts } from './texts.js';
import { votingLinkOf, type Tool } from './tool.js';

/** What a call gives: the identifier of the event, the one "Ver mis eventos" answers. */
const askedSchema = z.object({
  id: z.string().min(1).meta({ description: texts.tools.readEvent.input.id }),
});

/*
 * The event as its voting page reads it and its results as the results page reads them, each
 * shape written out whole: under the contract's names the published shape would point to
 * definitions an application has to follow.
 */
const optionShape = z.object(optionSchema.shape);
const resultsOptionShape = z.object({
  ...resultsOptionSchema.shape,
  option: optionShape,
  names: z.object(resultsOptionSchema.shape.names.unwrap().shape).optional(),
});
const readSchema = z.object({
  id: z.string(),
  votingLink: z.url(),
  event: z.object({
    ...publicEventSchema.shape,
    options: z.array(optionShape),
    confirmedOption: optionShape.nullable(),
  }),
  results: z.object({
    ...resultsSchema.shape,
    winners: z.array(resultsOptionShape),
    alternatives: z.array(resultsOptionShape),
    confirmedOption: optionShape.nullable(),
  }),
});

/**
 * "Ver un evento", the tool `read_event`: one of the account's events by the identifier of its
 * voting link (`readOrganizerEvent`), in words a line each: its title, state and voters as the
 * list says them, its voting link (never the results link nor the management link), its note,
 * whether voting is anonymous, its options, its confirmed date, and its results in the words of
 * the results page, each date with how many answered it each way and who. Nobody having voted,
 * the first line says it all. Another organizer's event is answered as one that does not exist;
 * a cancelled one, that it was cancelled. The data beside the words is the event and its results
 * as the web's own routes answer them.
 */
export function readEventTool(
  managedEvents: ManagedEvents,
  eventResults: EventResults,
  now: () => Date,
  website: string,
): Tool<z.infer<typeof askedSchema>, z.infer<typeof readSchema>> {
  return {
    name: 'read_event',
    title: texts.tools.readEvent.title,
    description: texts.tools.readEvent.description,
    effect: 'reads',
    input: askedSchema,
    data: readSchema,
    answer: async (accountId, { id }) => {
      const reading = await readOrganizerEvent(managedEvents, eventResults, id, accountId, now);
      if (reading.status === 'cancelled')
        return { refused: texts.answers.cancelled(reading.title) };
      if (reading.status !== 'found') return { refused: texts.answers.notFound };
      const { event, results } = reading;
      const votingLink = votingLinkOf(website, id);
      return {
        text: eventSaid(event, results, votingLink),
        data: { id, votingLink, event, results },
      };
    },
  };
}

/** The event in words, a line each. */
function eventSaid(event: PublicEvent, results: Results, votingLink: string): string {
  const say = texts.event;
  const { confirmedOption: confirmed } = event;
  const timed = event.options.some(({ time }) => time !== null);
  return [
    say.heading(
      event.title,
      texts.state[event.state](event.deadline),
      texts.voters(results.voters),
    ),
    say.votingLink(votingLink),
    ...(event.note === null ? [] : [say.note(event.note)]),
    ...(event.anonymous ? [say.anonymous] : []),
    say.options(timed ? event.timeZone : null),
    ...event.options.map(({ dates, time }) => say.option(dates, time)),
    ...(confirmed === null ? [] : [say.confirmed(confirmed.dates, confirmed.time)]),
    ...resultsSaid(results),
  ].join('\n');
}

/**
 * The results in the words of the results page: the count of the votes, the sentence of their
 * outcome, every date that wins and every alternative. None while nobody has voted.
 */
function resultsSaid(results: Results): string[] {
  const { outcome, winners, alternatives, confirmedOption } = results;
  if (outcome === 'no-votes') return [];
  const say = texts.event;
  const sentence =
    outcome === 'one'
      ? // Stryker disable next-line OptionalChaining: one date wins, so the first is always there.
        say.sentence.one(winners[0]?.option.dates.kind === 'range', confirmedOption !== null)
      : say.sentence[outcome];
  const dateSaid = ({ option, preferred, available, unavailable, names }: ResultsOption) =>
    say.result(option.dates, option.time, { preferred, available, unavailable }, names);
  return [
    say.tally(results),
    sentence,
    ...winners.map(dateSaid),
    ...(alternatives.length === 0
      ? []
      : [say.alternatives(alternatives.length), ...alternatives.map(dateSaid)]),
  ];
}

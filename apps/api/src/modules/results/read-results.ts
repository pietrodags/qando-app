import type { Option, Results, ResultsOption } from '@qando/contracts';
import {
  currentState,
  resultsOf,
  type OptionTally,
  type StoredEventState,
  type VoteState,
} from '@qando/domain';

/** One participant's answer: a state per option ID; `name` is null on anonymous events. */
export interface StoredVote {
  readonly name: string | null;
  readonly votes: Readonly<Record<string, VoteState>>;
}

/** What the results are computed from: the event, its options in their order, and every vote. */
export type StoredResultsEvent = {
  readonly title: string;
  readonly timeZone: string;
  readonly anonymous: boolean;
  readonly options: readonly Option[];
  readonly confirmedOption: Option | null;
  /** In the order they were cast, so voters with the same name are told apart the same way. */
  readonly votes: readonly StoredVote[];
} & StoredEventState;

/**
 * What a results link leads to. The participation link of an event is told apart from an
 * unknown link: it is refused (`403`), never mistaken for an event that does not exist.
 */
export type ResultsLookup =
  | { readonly status: 'found'; readonly event: StoredResultsEvent }
  | { readonly status: 'cancelled'; readonly title: string }
  | { readonly status: 'participation-link' }
  | { readonly status: 'missing' };

/** Port to the stored events, looked up by the results ID of their link. */
export interface EventResults {
  find(resultsId: string): Promise<ResultsLookup>;
}

/** What reading a results link amounts to: the results, or why there are none. */
export type ResultsReading =
  | { readonly status: 'found'; readonly results: Results }
  | Exclude<ResultsLookup, { readonly status: 'found' }>;

/**
 * The use case behind the results link, free of HTTP so every adapter (the API's route, later
 * the organizers' MCP connector) reads the same results: the stored event's votes turned into
 * the results as the page shows them, at the time `now` answers.
 */
export async function readResults(
  eventResults: EventResults,
  resultsId: string,
  now: () => Date,
): Promise<ResultsReading> {
  const lookup = await eventResults.find(resultsId);
  return lookup.status === 'found'
    ? { status: 'found', results: resultsOfEvent(lookup.event, now()) }
    : lookup;
}

/** Spanish alphabetical order: accents and case aside, `ñ` after `n`. */
const spanish = new Intl.Collator('es');

/**
 * The event's results as the page shows them: the domain's tallies with each option in full and,
 * on named events, who answered it each way. They are final once voting is no longer open.
 */
function resultsOfEvent(event: StoredResultsEvent, at: Date): Results {
  const results = resultsOf(
    event.options.map(({ id }) => id),
    event.votes.map(({ votes }) => votes),
  );
  const labels = event.anonymous ? null : nameLabels(event.votes);
  const optionsById = new Map(event.options.map((option) => [option.id, option]));
  const optionOf = (optionId: string): Option => {
    const option = optionsById.get(optionId);
    // The tallies are of the event's own options, so each one is found.
    if (!option) throw new Error('A tally of an option the event does not have');
    return option;
  };

  const shown = ({ optionId, preferred, available, unavailable }: OptionTally): ResultsOption => ({
    option: optionOf(optionId),
    preferred,
    available,
    unavailable,
    ...(labels ? { names: namesOf(optionId, event.votes, labels) } : {}),
  });

  return {
    title: event.title,
    timeZone: event.timeZone,
    final: currentState(event, at) !== 'open',
    outcome: results.outcome,
    voters: results.voters,
    attending: results.attending,
    notAttending: results.notAttending,
    winnersListed: results.winnersListed,
    winners: results.winners.map(shown),
    alternatives: results.alternatives.map(shown),
    confirmedOption: event.confirmedOption,
  };
}

/**
 * The names of the voters who answered the option each way; unanswered counts as unavailable.
 * `labels` holds each vote's name as shown, in the order of the votes.
 */
function namesOf(
  optionId: string,
  votes: readonly StoredVote[],
  labels: readonly (string | null)[],
): Record<VoteState, string[]> {
  const names: Record<VoteState, string[]> = { preferred: [], available: [], unavailable: [] };
  votes.forEach(({ votes: states }, at) => {
    const label = labels[at];
    if (label) names[states[optionId] ?? 'unavailable'].push(label);
  });
  for (const list of Object.values(names)) list.sort(spanish.compare);
  return names;
}

/**
 * Each vote's name as the results show it: a name already taken by an earlier vote gets its
 * number, so two voters called Ana read "Ana" and "Ana (2)" on every option (OD-05).
 */
function nameLabels(votes: readonly StoredVote[]): (string | null)[] {
  const seen = new Map<string, number>();
  return votes.map(({ name }) => {
    if (name === null) return null;
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name} (${count})`;
  });
}

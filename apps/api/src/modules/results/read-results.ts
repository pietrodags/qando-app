import type { Option, PublicEvent, Results, ResultsOption } from '@qando/contracts';
import {
  currentState,
  resultsOf,
  type OptionTally,
  type StoredEventState,
  type VoteState,
} from '@qando/domain';
import {
  actingOrganizer,
  refusalSinceTheCheck,
  type ActingOrganizer,
  type ManagedEvents,
  type ManagementRefusal,
} from '../management/managed-events.js';

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

/**
 * An event as its organizer reads it: what its results are computed from, and what else its
 * voting page shows.
 */
export type StoredOrganizerEvent = StoredResultsEvent & {
  readonly organizerName: string;
  readonly note: string | null;
  /** Last day of voting, in `timeZone`. */
  readonly deadline: string;
};

/**
 * Port to the stored events, looked up by the results ID of their link, or for the organizer
 * who manages one.
 */
export interface EventResults {
  find(resultsId: string): Promise<ResultsLookup>;
  /** The event the organizer manages; undefined if it was deleted since the access check. */
  ofOrganizer(organizer: ActingOrganizer): Promise<StoredOrganizerEvent | undefined>;
}

/** What reading a results link amounts to: the results, or why there are none. */
export type ResultsReading =
  | { readonly status: 'found'; readonly results: Results }
  | Exclude<ResultsLookup, { readonly status: 'found' }>;

/**
 * The use case behind the results link, free of HTTP so every adapter reads the same results:
 * the stored event's votes turned into the results as the page shows them, at the time `now`
 * answers.
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

/** What an organizer's reading of one of their events amounts to: the event, or why it is refused. */
export type OrganizerEventReading =
  | { readonly status: 'found'; readonly event: PublicEvent; readonly results: Results }
  | ManagementRefusal;

/**
 * One of the account's events read by its organizer, free of HTTP (the organizers' MCP
 * connector reads it): whether the account manages the event of the participation ID is
 * checked first, then the event comes as its voting page shows it and with its results as the
 * results page shows them, both from one read, at the time `now` answers.
 */
export async function readOrganizerEvent(
  managedEvents: ManagedEvents,
  eventResults: EventResults,
  participationId: string,
  accountId: string,
  now: () => Date,
): Promise<OrganizerEventReading> {
  const access = await actingOrganizer(managedEvents, participationId, { accountId });
  if (access.status !== 'granted') return access;
  const stored = await eventResults.ofOrganizer(access.organizer);
  // Deleted since the check: answered as any later request is, cancelled with its title.
  if (!stored) return refusalSinceTheCheck(managedEvents, participationId, { accountId });
  const at = now();
  const { title, organizerName, note, deadline, timeZone, anonymous, options, confirmedOption } =
    stored;
  return {
    status: 'found',
    event: {
      title,
      organizerName,
      note,
      deadline,
      timeZone,
      anonymous,
      state: currentState(stored, at),
      options: [...options],
      confirmedOption,
    },
    results: resultsOfEvent(stored, at),
  };
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
 * Each vote's name as the results show it: a name already taken by an earlier vote gets the
 * first number that is nobody's name or label, so two voters called Ana stay two people, "Ana"
 * and "Ana (2)" on every option, and a third voter really called "Ana (2)" keeps it.
 */
function nameLabels(votes: readonly StoredVote[]): (string | null)[] {
  const names = new Set(votes.map(({ name }) => name));
  const taken = new Set<string>();
  const free = (label: string) => !names.has(label) && !taken.has(label);
  return votes.map(({ name }) => {
    if (name === null) return null;
    let label = name;
    for (let number = 2; taken.has(label); number += 1) {
      const numbered = `${name} (${number})`;
      if (free(numbered)) label = numbered;
    }
    taken.add(label);
    return label;
  });
}

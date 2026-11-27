// What confirming an event's final date is decided from: the facts the question before
// confirming is asked from, and the notes of that question that apply. The management page and
// the assistant's chat ask it alike, and a confirmation agreed to from facts no longer the
// event's is refused, so all of them read the facts and the notes from here.

import { currentState, type EventState, type StoredEventState } from './event-state.js';
import { resultsOf } from './results.js';
import type { VoteState } from './vote.js';

/**
 * What the question before confirming a date is asked from: whether voting is open, how many
 * voted and the dates the results recommend (their winners, in the event's order).
 */
export interface DecisionFacts {
  readonly state: EventState;
  readonly voters: number;
  readonly recommendedOptionIds: readonly string[];
}

/** The facts of a decision, from the event's options in their order and its votes, at `at`. */
export function decisionFacts(
  optionIds: readonly string[],
  votes: readonly Readonly<Record<string, VoteState>>[],
  stored: StoredEventState,
  at: Date,
): DecisionFacts {
  const { voters, winners } = resultsOf(optionIds, votes);
  return {
    state: currentState(stored, at),
    voters,
    recommendedOptionIds: winners.map(({ optionId }) => optionId),
  };
}

/**
 * The facts written as one text, the same for the same facts whatever the order of their keys
 * and whatever else the object carries: what tells whether a decision is still asked from the
 * facts it was agreed to from.
 */
export function factsWritten(facts: DecisionFacts): string {
  const { state, voters, recommendedOptionIds } = facts;
  // A fact added to `DecisionFacts` does not compile here until it is written too, so neither
  // what a confirmation code signs nor the check with the event locked can leave it out.
  return JSON.stringify({ state, voters, recommendedOptionIds } satisfies Record<
    keyof DecisionFacts,
    unknown
  >);
}

/**
 * A note of the question before confirming a date, which says what makes confirming it unusual:
 * - `no-votes`: nobody voted.
 * - `nobody-can-attend`: some voted, but nobody can attend any option.
 * - `not-recommended`: the date is not one the results recommend.
 * - `open`: voting is still open, and confirming closes it.
 * - `open-no-votes`: the same, when nobody voted yet.
 */
export type ConfirmationNote =
  'no-votes' | 'nobody-can-attend' | 'not-recommended' | 'open' | 'open-no-votes';

/**
 * The notes that apply to confirming the option, in the order the question says them: at most
 * one of what the votes say, then whether voting is open. None is the usual case (voting closed,
 * a recommended date, votes in), confirmed without a question.
 */
export function confirmationNotes(facts: DecisionFacts, optionId: string): ConfirmationNote[] {
  const { state, voters, recommendedOptionIds } = facts;
  const notes: ConfirmationNote[] = [];
  if (voters === 0) notes.push('no-votes');
  else if (recommendedOptionIds.length === 0) notes.push('nobody-can-attend');
  else if (!recommendedOptionIds.includes(optionId)) notes.push('not-recommended');
  if (state === 'open') notes.push(voters === 0 ? 'open-no-votes' : 'open');
  return notes;
}

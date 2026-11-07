// What the votes of an event amount to: how many answered each option each way, which options
// win, and how the results page says it. The API computes it for the results page and the emails,
// so every reader sees the same winner.

import type { VoteState } from './vote.js';

/** One option's answers. Its attendance is `preferred + available`. */
export interface OptionTally {
  readonly optionId: string;
  readonly preferred: number;
  readonly available: number;
  readonly unavailable: number;
}

/**
 * What the results say, which picks the page's sentence:
 * - `no-votes`, `nobody-can-attend` (nobody is available on any option): no winner.
 * - `one`: a single winner.
 * - `two`, `three`: that many winners, and other options left out.
 * - `several`: four or more winners, and other options left out.
 * - `all`: every option of the event wins (two or more).
 */
export type ResultsOutcome =
  'no-votes' | 'nobody-can-attend' | 'one' | 'two' | 'three' | 'several' | 'all';

export interface Results {
  readonly outcome: ResultsOutcome;
  readonly voters: number;
  /** Voters who can attend a winner; all winners share the number. 0 with no winner. */
  readonly attending: number;
  readonly notAttending: number;
  /** Whether the page lists the winners under its sentence: one to three winners. */
  readonly winnersListed: boolean;
  /** In the event's order. Empty with no winner. */
  readonly winners: readonly OptionTally[];
  /**
   * The options as well attended as the winners that lost on preferred, most preferred first,
   * then in the event's order. Options less attended are never shown.
   */
  readonly alternatives: readonly OptionTally[];
}

/** Up to this many winners are listed under the results sentence. */
const MOST_WINNERS_LISTED = 3;

/**
 * The results of an event's votes. `optionIds` are the event's options in its order (the
 * chronological order every page shows); each vote answers them by ID. The best attended options
 * win; among them, the most preferred. An option a vote leaves unanswered counts as unavailable,
 * and answers to other options are ignored, so any list of votes has results.
 */
export function resultsOf(
  optionIds: readonly string[],
  votes: readonly Readonly<Record<string, VoteState>>[],
): Results {
  const voters = votes.length;
  const tallies = optionIds.map((optionId) => tallyOf(optionId, votes));
  const bestAttendance = Math.max(0, ...tallies.map(attendance));
  if (bestAttendance === 0) {
    return {
      outcome: voters === 0 ? 'no-votes' : 'nobody-can-attend',
      voters,
      attending: 0,
      notAttending: voters,
      winnersListed: false,
      winners: [],
      alternatives: [],
    };
  }

  const tied = tallies.filter((tally) => attendance(tally) === bestAttendance);
  const mostPreferred = Math.max(...tied.map(({ preferred }) => preferred));
  const winners = tied.filter(({ preferred }) => preferred === mostPreferred);
  return {
    outcome: outcomeOf(winners.length, optionIds.length),
    voters,
    attending: bestAttendance,
    notAttending: voters - bestAttendance,
    winnersListed: winners.length <= MOST_WINNERS_LISTED,
    winners,
    // `filter` returns a new array, sorted in place; the sort is stable, so options with as many
    // preferred keep the event's order.
    alternatives: tied
      .filter(({ preferred }) => preferred < mostPreferred)
      .sort((a, b) => b.preferred - a.preferred),
  };
}

function tallyOf(
  optionId: string,
  votes: readonly Readonly<Record<string, VoteState>>[],
): OptionTally {
  const tally = { optionId, preferred: 0, available: 0, unavailable: 0 };
  for (const vote of votes) tally[vote[optionId] ?? 'unavailable'] += 1;
  return tally;
}

function attendance({ preferred, available }: OptionTally): number {
  return preferred + available;
}

/** Every option winning is said before how many win: two options both winning are "all". */
function outcomeOf(winners: number, options: number): ResultsOutcome {
  if (winners === 1) return 'one';
  if (winners === options) return 'all';
  if (winners === 2) return 'two';
  if (winners === 3) return 'three';
  return 'several';
}

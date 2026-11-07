import { describe, expect, it } from 'vitest';
import { resultsOf, type OptionTally, type Results } from './results.js';
import type { VoteState } from './vote.js';

const P = 'preferred';
const A = 'available';
const U = 'unavailable';

type Answers = Readonly<Record<string, VoteState>>;

/** A vote as the voting page sends it: every option answered, unavailable unless said otherwise. */
function vote(options: readonly string[], answers: Answers = {}): Answers {
  return Object.fromEntries(options.map((option) => [option, answers[option] ?? U]));
}

function tally(optionId: string, preferred: number, available: number, unavailable: number) {
  return { optionId, preferred, available, unavailable } satisfies OptionTally;
}

const nothing = { winnersListed: false, winners: [], alternatives: [] } as const;

interface ReferenceCase {
  readonly id: string;
  /** Option IDs in the event's (chronological) order: a date, a date range or a date and time. */
  readonly options: readonly string[];
  /** Only the answers that are not unavailable. */
  readonly votes: readonly Answers[];
  readonly expected: Results;
}

// Five dates, none consecutive.
const FIVE = ['2026-07-06', '2026-07-08', '2026-07-10', '2026-07-13', '2026-07-15'];
const [JUL06 = '', JUL08 = '', JUL10 = '', JUL13 = '', JUL15 = ''] = FIVE;
const allAvailable = (options: readonly string[]): Answers =>
  Object.fromEntries(options.map((option) => [option, A]));

// The reference case table: what the results page shows, as options and counts. The labels and
// sentences of each case are the web's (the results page checks them).
const REFERENCE_CASES: readonly ReferenceCase[] = [
  {
    id: 'no-votes',
    options: FIVE,
    votes: [],
    expected: { outcome: 'no-votes', voters: 0, attending: 0, notAttending: 0, ...nothing },
  },
  {
    id: 'nobody-can-attend',
    options: FIVE,
    votes: [{}, {}, {}],
    expected: {
      outcome: 'nobody-can-attend',
      voters: 3,
      attending: 0,
      notAttending: 3,
      ...nothing,
    },
  },
  {
    id: 'single-winner',
    options: FIVE,
    votes: [{ [JUL06]: A }],
    expected: {
      outcome: 'one',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: [tally(JUL06, 0, 1, 0)],
      alternatives: [],
    },
  },
  {
    id: 'counters-of-the-winner',
    options: FIVE,
    votes: [{ [JUL06]: A, [JUL08]: A }, { [JUL06]: P }, {}],
    expected: {
      outcome: 'one',
      voters: 3,
      attending: 2,
      notAttending: 1,
      winnersListed: true,
      winners: [tally(JUL06, 1, 1, 1)],
      alternatives: [],
    },
  },
  {
    id: 'two-way-tie',
    options: FIVE,
    votes: [allAvailable([JUL06, JUL08])],
    expected: {
      outcome: 'two',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: [tally(JUL06, 0, 1, 0), tally(JUL08, 0, 1, 0)],
      alternatives: [],
    },
  },
  {
    id: 'three-way-tie',
    options: FIVE,
    votes: [allAvailable([JUL06, JUL08, JUL10])],
    expected: {
      outcome: 'three',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: [tally(JUL06, 0, 1, 0), tally(JUL08, 0, 1, 0), tally(JUL10, 0, 1, 0)],
      alternatives: [],
    },
  },
  {
    id: 'four-way-tie',
    options: FIVE,
    votes: [allAvailable([JUL06, JUL08, JUL10, JUL13])],
    expected: {
      outcome: 'several',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: false,
      winners: [JUL06, JUL08, JUL10, JUL13].map((option) => tally(option, 0, 1, 0)),
      alternatives: [],
    },
  },
  {
    id: 'four-of-six-tied',
    options: [...FIVE, '2026-07-17'],
    votes: [allAvailable([JUL08, JUL10, JUL13, JUL15])],
    expected: {
      outcome: 'several',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: false,
      winners: [JUL08, JUL10, JUL13, JUL15].map((option) => tally(option, 0, 1, 0)),
      alternatives: [],
    },
  },
  {
    id: 'all-options-tied',
    options: FIVE,
    votes: [allAvailable(FIVE)],
    expected: {
      outcome: 'all',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: false,
      winners: FIVE.map((option) => tally(option, 0, 1, 0)),
      alternatives: [],
    },
  },
  {
    // BUG-046: every option tied, listed because they are two.
    id: 'all-tied-beats-two-way-tie',
    options: ['2026-07-06', '2026-07-10..2026-07-11'],
    votes: [allAvailable(['2026-07-06', '2026-07-10..2026-07-11'])],
    expected: {
      outcome: 'all',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-06', 0, 1, 0), tally('2026-07-10..2026-07-11', 0, 1, 0)],
      alternatives: [],
    },
  },
  {
    // BUG-046: every option tied, listed because they are three.
    id: 'all-tied-beats-three-way-tie',
    options: [JUL06, JUL08, JUL10],
    votes: [allAvailable([JUL06, JUL08, JUL10])],
    expected: {
      outcome: 'all',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: [tally(JUL06, 0, 1, 0), tally(JUL08, 0, 1, 0), tally(JUL10, 0, 1, 0)],
      alternatives: [],
    },
  },
  {
    id: 'tie-broken-by-preferred',
    options: FIVE,
    votes: [
      { [JUL06]: A, [JUL08]: P },
      { [JUL06]: A, [JUL08]: A },
    ],
    expected: {
      outcome: 'one',
      voters: 2,
      attending: 2,
      notAttending: 0,
      winnersListed: true,
      winners: [tally(JUL08, 1, 1, 0)],
      alternatives: [tally(JUL06, 0, 2, 0)],
    },
  },
  {
    id: 'tie-break-leaves-two-alternatives',
    options: FIVE,
    votes: [{ [JUL06]: A, [JUL08]: A, [JUL10]: P }, allAvailable([JUL06, JUL08, JUL10])],
    expected: {
      outcome: 'one',
      voters: 2,
      attending: 2,
      notAttending: 0,
      winnersListed: true,
      winners: [tally(JUL10, 1, 1, 0)],
      alternatives: [tally(JUL06, 0, 2, 0), tally(JUL08, 0, 2, 0)],
    },
  },
  {
    id: 'tie-break-leaves-a-two-way-tie',
    options: FIVE,
    votes: [
      { [JUL06]: P, [JUL08]: A, [JUL10]: A },
      { [JUL06]: A, [JUL08]: P, [JUL10]: A },
    ],
    expected: {
      outcome: 'two',
      voters: 2,
      attending: 2,
      notAttending: 0,
      winnersListed: true,
      winners: [tally(JUL06, 1, 1, 0), tally(JUL08, 1, 1, 0)],
      alternatives: [tally(JUL10, 0, 2, 0)],
    },
  },
  {
    id: 'attendance-beats-preferred',
    options: ['2026-07-08..2026-07-09', '2026-07-15'],
    votes: [
      { '2026-07-08..2026-07-09': P, '2026-07-15': A },
      { '2026-07-08..2026-07-09': U, '2026-07-15': A },
    ],
    expected: {
      outcome: 'one',
      voters: 2,
      attending: 2,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-15', 0, 2, 0)],
      alternatives: [],
    },
  },
  {
    id: 'date-group-wins',
    options: ['2026-07-06', '2026-07-08', '2026-07-10..2026-07-11'],
    votes: [{ '2026-07-10..2026-07-11': P }, { '2026-07-06': A, '2026-07-10..2026-07-11': A }],
    expected: {
      outcome: 'one',
      voters: 2,
      attending: 2,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-10..2026-07-11', 1, 1, 0)],
      alternatives: [],
    },
  },
  {
    id: 'consecutive-tied-dates-stay-apart',
    options: ['2026-07-09', '2026-07-10', '2026-07-15'],
    votes: [
      { '2026-07-09': A, '2026-07-10': A },
      { '2026-07-09': P, '2026-07-10': A },
      { '2026-07-09': A, '2026-07-10': P, '2026-07-15': A },
    ],
    expected: {
      outcome: 'two',
      voters: 3,
      attending: 3,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-09', 1, 2, 0), tally('2026-07-10', 1, 2, 0)],
      alternatives: [],
    },
  },
  {
    id: 'overlapping-options-count-apart',
    options: ['2026-07-06..2026-07-08', '2026-07-07'],
    votes: [
      { '2026-07-06..2026-07-08': A, '2026-07-07': P },
      { '2026-07-06..2026-07-08': A, '2026-07-07': U },
    ],
    expected: {
      outcome: 'one',
      voters: 2,
      attending: 2,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-06..2026-07-08', 0, 2, 0)],
      alternatives: [],
    },
  },
  {
    id: 'group-label-across-months',
    options: ['2026-07-06', '2026-07-30..2026-08-01'],
    votes: [{ '2026-07-30..2026-08-01': A }],
    expected: {
      outcome: 'one',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-30..2026-08-01', 0, 1, 0)],
      alternatives: [],
    },
  },
  {
    id: 'group-label-across-years',
    options: ['2026-07-06', '2026-12-31..2027-01-01'],
    votes: [{ '2026-12-31..2027-01-01': A }],
    expected: {
      outcome: 'one',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-12-31..2027-01-01', 0, 1, 0)],
      alternatives: [],
    },
  },
  {
    id: 'group-label-same-month-other-year',
    options: ['2026-06-30..2027-06-02', '2026-07-06'],
    votes: [{ '2026-06-30..2027-06-02': A }],
    expected: {
      outcome: 'one',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-06-30..2027-06-02', 0, 1, 0)],
      alternatives: [],
    },
  },
  {
    id: 'with-hours-whole-day-wins',
    options: ['2026-07-06 09:00-11:00', '2026-07-06 18:00', '2026-07-07', '2026-07-08 09:00'],
    votes: [
      { '2026-07-06 09:00-11:00': P, '2026-07-06 18:00': U, '2026-07-07': A },
      { '2026-07-07': P, '2026-07-08 09:00': A },
    ],
    expected: {
      outcome: 'one',
      voters: 2,
      attending: 2,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-07', 1, 1, 0)],
      alternatives: [],
    },
  },
  {
    // BUG-021: no option is derived from a vote, so both options tie.
    id: 'phantom-times-hide-all-tied',
    options: ['2026-07-06 09:00-11:00', '2026-07-06 18:00'],
    votes: [{ '2026-07-06 09:00-11:00': A, '2026-07-06 18:00': A }, {}],
    expected: {
      outcome: 'all',
      voters: 2,
      attending: 1,
      notAttending: 1,
      winnersListed: true,
      winners: [tally('2026-07-06 09:00-11:00', 0, 1, 1), tally('2026-07-06 18:00', 0, 1, 1)],
      alternatives: [],
    },
  },
  {
    // BUG-016: only the options offered count.
    id: 'invisible-whole-day-option-ties',
    options: ['2026-07-06 09:00-11:00', '2026-07-07 10:00'],
    votes: [{ '2026-07-06 09:00-11:00': A }, { '2026-07-07 10:00': A }],
    expected: {
      outcome: 'all',
      voters: 2,
      attending: 1,
      notAttending: 1,
      winnersListed: true,
      winners: [tally('2026-07-06 09:00-11:00', 0, 1, 1), tally('2026-07-07 10:00', 0, 1, 1)],
      alternatives: [],
    },
  },
  {
    // BUG-016: no whole-day option nobody was offered shows as the alternative.
    id: 'invisible-whole-day-option-is-the-alternative',
    options: ['2026-07-06 09:00-11:00', '2026-07-07 10:00'],
    votes: [{ '2026-07-06 09:00-11:00': A }, { '2026-07-06 09:00-11:00': P }],
    expected: {
      outcome: 'one',
      voters: 2,
      attending: 2,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-06 09:00-11:00', 1, 1, 0)],
      alternatives: [],
    },
  },
  {
    // OD-09: no results-display merging, the three options tie.
    id: 'consecutive-single-times-merged',
    options: ['2026-07-06 09:00', '2026-07-06 10:00', '2026-07-06 11:00', '2026-07-07 12:00'],
    votes: [allAvailable(['2026-07-06 09:00', '2026-07-06 10:00', '2026-07-06 11:00'])],
    expected: {
      outcome: 'three',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: ['2026-07-06 09:00', '2026-07-06 10:00', '2026-07-06 11:00'].map((option) =>
        tally(option, 0, 1, 0),
      ),
      alternatives: [],
    },
  },
  {
    // BUG-041: three tied options in time order.
    id: 'merged-times-sort-last',
    options: ['2026-07-06 09:00', '2026-07-06 10:00', '2026-07-06 18:00', '2026-07-07 12:00'],
    votes: [allAvailable(['2026-07-06 09:00', '2026-07-06 10:00', '2026-07-06 18:00'])],
    expected: {
      outcome: 'three',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: ['2026-07-06 09:00', '2026-07-06 10:00', '2026-07-06 18:00'].map((option) =>
        tally(option, 0, 1, 0),
      ),
      alternatives: [],
    },
  },
  {
    id: 'date-group-wins-with-hours',
    options: ['2026-07-06 18:00', '2026-07-10..2026-07-12'],
    votes: [
      { '2026-07-10..2026-07-12': P, '2026-07-06 18:00': A },
      { '2026-07-10..2026-07-12': A },
    ],
    expected: {
      outcome: 'one',
      voters: 2,
      attending: 2,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-10..2026-07-12', 1, 1, 0)],
      alternatives: [],
    },
  },
  {
    // BUG-045: the whole day inside the range is an option from the start; two of three tie.
    id: 'whole-day-inside-a-group-missing-until-voted',
    options: ['2026-07-06 18:00', '2026-07-10..2026-07-11', '2026-07-11'],
    votes: [{ '2026-07-10..2026-07-11': A, '2026-07-06 18:00': A }],
    expected: {
      outcome: 'two',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-06 18:00', 0, 1, 0), tally('2026-07-10..2026-07-11', 0, 1, 0)],
      alternatives: [],
    },
  },
  {
    // BUG-026: each range the organizer drags is one option, so the two tie.
    id: 'touching-ranges-are-one-option',
    options: ['2026-07-06 09:00-11:00', '2026-07-06 12:00-14:00', '2026-07-07 10:00'],
    votes: [allAvailable(['2026-07-06 09:00-11:00', '2026-07-06 12:00-14:00'])],
    expected: {
      outcome: 'two',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-06 09:00-11:00', 0, 1, 0), tally('2026-07-06 12:00-14:00', 0, 1, 0)],
      alternatives: [],
    },
  },
  {
    id: 'range-and-single-time-that-touch-stay-apart',
    options: ['2026-07-06 09:00-11:00', '2026-07-06 12:00', '2026-07-07 10:00'],
    votes: [allAvailable(['2026-07-06 09:00-11:00', '2026-07-06 12:00'])],
    expected: {
      outcome: 'two',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-06 09:00-11:00', 0, 1, 0), tally('2026-07-06 12:00', 0, 1, 0)],
      alternatives: [],
    },
  },
  {
    id: 'saved-and-live-time-in-one-hour',
    options: ['2026-07-06 09:00', '2026-07-06 09:30', '2026-07-07 10:00'],
    votes: [allAvailable(['2026-07-06 09:00', '2026-07-06 09:30'])],
    expected: {
      outcome: 'two',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-06 09:00', 0, 1, 0), tally('2026-07-06 09:30', 0, 1, 0)],
      alternatives: [],
    },
  },
  {
    id: 'time-inside-a-saved-range-counts-apart',
    options: ['2026-07-06 09:00-11:00', '2026-07-06 10:00', '2026-07-07 12:00'],
    votes: [
      { '2026-07-06 09:00-11:00': A, '2026-07-06 10:00': P },
      { '2026-07-06 09:00-11:00': A, '2026-07-06 10:00': U },
    ],
    expected: {
      outcome: 'one',
      voters: 2,
      attending: 2,
      notAttending: 0,
      winnersListed: true,
      winners: [tally('2026-07-06 09:00-11:00', 0, 2, 0)],
      alternatives: [],
    },
  },
];

describe('resultsOf', () => {
  describe('the reference cases', () => {
    it.each(REFERENCE_CASES)('$id', ({ options, votes, expected }) => {
      expect(
        resultsOf(
          options,
          votes.map((answers) => vote(options, answers)),
        ),
      ).toEqual(expected);
    });
  });

  it('counts an option a vote leaves unanswered as unavailable', () => {
    const results = resultsOf([JUL06, JUL08], [{ [JUL06]: A }, { [JUL06]: A, [JUL08]: P }]);
    expect(results.alternatives).toEqual([]);
    expect(results.winners).toEqual([tally(JUL06, 0, 2, 0)]);
    expect(resultsOf([JUL06, JUL08], [{ [JUL06]: A }, {}])).toMatchObject({
      winners: [tally(JUL06, 0, 1, 1)],
      notAttending: 1,
    });
  });

  it('ignores answers to options the event does not have', () => {
    expect(resultsOf([JUL06], [{ [JUL06]: A, [JUL08]: P }])).toEqual({
      outcome: 'one',
      voters: 1,
      attending: 1,
      notAttending: 0,
      winnersListed: true,
      winners: [tally(JUL06, 0, 1, 0)],
      alternatives: [],
    });
  });

  it('gives an event with one option and votes a single winner, never every option tied', () => {
    expect(resultsOf([JUL06], [{ [JUL06]: A }]).outcome).toBe('one');
  });

  it('finds nobody can attend when the event has no options', () => {
    expect(resultsOf([], [{}])).toEqual({
      outcome: 'nobody-can-attend',
      voters: 1,
      attending: 0,
      notAttending: 1,
      ...nothing,
    });
  });

  it('keeps the event order among options that tie on attendance and preferred', () => {
    // Given out of date order on purpose: the event's order is the one kept.
    const results = resultsOf([JUL10, JUL06, JUL08], [allAvailable([JUL06, JUL08, JUL10])]);
    expect(results.winners.map(({ optionId }) => optionId)).toEqual([JUL10, JUL06, JUL08]);
  });

  it('orders the alternatives by preferred first, then by the event order', () => {
    const options = [JUL06, JUL08, JUL10, JUL13];
    const results = resultsOf(options, [
      { [JUL06]: A, [JUL08]: A, [JUL10]: A, [JUL13]: P },
      { [JUL06]: A, [JUL08]: P, [JUL10]: A, [JUL13]: A },
      { [JUL06]: A, [JUL08]: A, [JUL10]: A, [JUL13]: P },
    ]);
    expect(results.winners).toEqual([tally(JUL13, 2, 1, 0)]);
    expect(results.alternatives).toEqual([
      tally(JUL08, 1, 2, 0),
      tally(JUL06, 0, 3, 0),
      tally(JUL10, 0, 3, 0),
    ]);
  });

  it('shows as alternatives only options tied on attendance, never the others', () => {
    const results = resultsOf(
      [JUL06, JUL08, JUL10],
      [
        { [JUL06]: P, [JUL08]: A, [JUL10]: A },
        { [JUL06]: A, [JUL08]: A },
      ],
    );
    expect(results.winners).toEqual([tally(JUL06, 1, 1, 0)]);
    expect(results.alternatives).toEqual([tally(JUL08, 0, 2, 0)]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  confirmationNotes,
  decisionFacts,
  factsWritten,
  type ConfirmationNote,
  type DecisionFacts,
} from './decision.js';
import type { StoredEventState } from './event-state.js';
import type { VoteState } from './vote.js';

const P = 'preferred';
const A = 'available';
const U = 'unavailable';

/** Three options in the event's order. */
const OPTIONS = ['july-6', 'july-8', 'july-10'];
const [JULY6 = '', JULY8 = '', JULY10 = ''] = OPTIONS;

/** Voting closes at the end of 1 July in Madrid. */
const closesAt = new Date('2026-07-01T21:59:59.999Z');
const open: StoredEventState = { state: 'open', closesAt };
const before = new Date('2026-06-20T10:00:00Z');

type Answers = Readonly<Record<string, VoteState>>;

describe('decisionFacts', () => {
  it('is open before voting closes', () => {
    expect(decisionFacts(OPTIONS, [], open, before).state).toBe('open');
  });

  it('is closed once voting closes, though the stored state still says open', () => {
    expect(decisionFacts(OPTIONS, [], open, new Date('2026-07-01T22:00:00Z')).state).toBe('closed');
  });

  it('is confirmed once a date is', () => {
    const confirmed: StoredEventState = { state: 'confirmed', closesAt };

    expect(decisionFacts(OPTIONS, [], confirmed, before).state).toBe('confirmed');
  });

  it('counts who voted', () => {
    const votes: Answers[] = [{ [JULY6]: A }, { [JULY8]: U }, {}];

    expect(decisionFacts(OPTIONS, votes, open, before).voters).toBe(3);
  });

  it('recommends the winners of the results, in the event’s order', () => {
    const votes: Answers[] = [
      { [JULY10]: P, [JULY6]: P, [JULY8]: A },
      { [JULY10]: A, [JULY6]: A, [JULY8]: A },
    ];

    expect(decisionFacts(OPTIONS, votes, open, before)).toEqual({
      state: 'open',
      voters: 2,
      recommendedOptionIds: [JULY6, JULY10],
    } satisfies DecisionFacts);
  });

  it('recommends none when nobody can attend', () => {
    const votes: Answers[] = [{ [JULY6]: U, [JULY8]: U, [JULY10]: U }];

    expect(decisionFacts(OPTIONS, votes, open, before)).toEqual({
      state: 'open',
      voters: 1,
      recommendedOptionIds: [],
    } satisfies DecisionFacts);
  });

  it('recommends none when nobody voted', () => {
    expect(decisionFacts(OPTIONS, [], open, before)).toEqual({
      state: 'open',
      voters: 0,
      recommendedOptionIds: [],
    } satisfies DecisionFacts);
  });
});

const facts: DecisionFacts = { state: 'open', voters: 2, recommendedOptionIds: [JULY6, JULY10] };

describe('factsWritten', () => {
  it('is the same for the same facts, whatever the order of their keys', () => {
    const reordered: DecisionFacts = {
      recommendedOptionIds: [JULY6, JULY10],
      voters: 2,
      state: 'open',
    };

    expect(factsWritten(reordered)).toBe(factsWritten(facts));
  });

  it('writes only the facts, whatever else the object carries', () => {
    const event = { title: 'Cena', ...facts };

    expect(factsWritten(event)).toBe(factsWritten(facts));
  });

  it.each<[string, DecisionFacts]>([
    ['another state', { ...facts, state: 'closed' }],
    ['one more voter', { ...facts, voters: 3 }],
    ['one more recommended', { ...facts, recommendedOptionIds: [JULY6, JULY8, JULY10] }],
    ['one less recommended', { ...facts, recommendedOptionIds: [JULY6] }],
    ['another recommended', { ...facts, recommendedOptionIds: [JULY6, JULY8] }],
    ['the recommended in another order', { ...facts, recommendedOptionIds: [JULY10, JULY6] }],
  ])('tells apart %s', (_case, other) => {
    expect(factsWritten(other)).not.toBe(factsWritten(facts));
  });
});

describe('confirmationNotes', () => {
  const noVotes = (state: DecisionFacts['state']): DecisionFacts => ({
    state,
    voters: 0,
    recommendedOptionIds: [],
  });
  const nobodyCanAttend = (state: DecisionFacts['state']): DecisionFacts => ({
    state,
    voters: 2,
    recommendedOptionIds: [],
  });
  const july10Recommended = (state: DecisionFacts['state']): DecisionFacts => ({
    state,
    voters: 2,
    recommendedOptionIds: [JULY10],
  });

  it.each<[string, DecisionFacts, string, ConfirmationNote[]]>([
    ['nobody voted, voting open', noVotes('open'), JULY10, ['no-votes', 'open-no-votes']],
    ['nobody voted, voting closed', noVotes('closed'), JULY10, ['no-votes']],
    [
      'nobody can attend, voting open',
      nobodyCanAttend('open'),
      JULY10,
      ['nobody-can-attend', 'open'],
    ],
    ['nobody can attend, voting closed', nobodyCanAttend('closed'), JULY10, ['nobody-can-attend']],
    [
      'a date not recommended, voting open',
      july10Recommended('open'),
      JULY6,
      ['not-recommended', 'open'],
    ],
    [
      'a date not recommended, voting closed',
      july10Recommended('closed'),
      JULY6,
      ['not-recommended'],
    ],
    ['the recommended date, voting open', july10Recommended('open'), JULY10, ['open']],
  ])('for %s, notes what applies, in its order', (_case, given, optionId, notes) => {
    expect(confirmationNotes(given, optionId)).toEqual(notes);
  });

  it('notes nothing for the recommended date once voting closed', () => {
    expect(confirmationNotes(july10Recommended('closed'), JULY10)).toEqual([]);
  });

  it('notes nothing for one of several recommended dates once voting closed', () => {
    const tied: DecisionFacts = { ...facts, state: 'closed' };

    expect(confirmationNotes(tied, JULY6)).toEqual([]);
    expect(confirmationNotes(tied, JULY10)).toEqual([]);
  });

  it('notes voting open only while it is, not once a date is confirmed', () => {
    expect(confirmationNotes(noVotes('confirmed'), JULY10)).toEqual(['no-votes']);
    expect(confirmationNotes(july10Recommended('confirmed'), JULY6)).toEqual(['not-recommended']);
  });
});

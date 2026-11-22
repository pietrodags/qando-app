import { describe, expect, it } from 'vitest';
import {
  isValidVoterName,
  sameVoterName,
  summaryOf,
  validateVote,
  type VoteInput,
  type VotingEvent,
} from './vote.js';

// "Cena de verano": 6, 10 and 11 July.
const named: VotingEvent = { anonymous: false, optionIds: ['jul-06', 'jul-10', 'jul-11'] };
const anonymous: VotingEvent = { ...named, anonymous: true };

const marcos: VoteInput = {
  name: 'Marcos',
  votes: { 'jul-06': 'available', 'jul-10': 'preferred', 'jul-11': 'unavailable' },
};

function problemsOf(event: VotingEvent, input: VoteInput) {
  const result = validateVote(event, input);
  return result.status === 'invalid' ? result.problems : [];
}

describe('validateVote', () => {
  describe('a valid vote', () => {
    it('is accepted with its answers', () => {
      expect(validateVote(named, marcos)).toEqual({
        status: 'valid',
        vote: { name: 'Marcos', votes: marcos.votes },
      });
    });

    it('may have no preferred option', () => {
      const ana: VoteInput = {
        name: 'Ana',
        votes: { 'jul-06': 'available', 'jul-10': 'available', 'jul-11': 'available' },
      };
      expect(validateVote(named, ana).status).toBe('valid');
    });

    it('stores the name trimmed', () => {
      const result = validateVote(named, { ...marcos, name: '  Luis  ' });
      expect(result.status === 'valid' && result.vote.name).toBe('Luis');
    });

    it('stores no name on an anonymous event', () => {
      const result = validateVote(anonymous, { votes: marcos.votes });
      expect(result).toEqual({ status: 'valid', vote: { name: null, votes: marcos.votes } });
    });
  });

  describe('the name on a named event', () => {
    it.each(['A', '  A  ', '', '   '])('is too short as %j', (name) => {
      expect(problemsOf(named, { ...marcos, name })).toEqual([{ code: 'NAME_TOO_SHORT' }]);
    });

    it('is too short when missing', () => {
      expect(problemsOf(named, { votes: marcos.votes })).toEqual([{ code: 'NAME_TOO_SHORT' }]);
    });

    it('accepts two characters', () => {
      expect(problemsOf(named, { ...marcos, name: 'Li' })).toEqual([]);
    });

    it('accepts thirty characters and refuses thirty-one', () => {
      expect(problemsOf(named, { ...marcos, name: 'a'.repeat(30) })).toEqual([]);
      expect(problemsOf(named, { ...marcos, name: 'a'.repeat(31) })).toEqual([
        { code: 'NAME_TOO_LONG' },
      ]);
    });

    it('counts characters, not UTF-16 units', () => {
      // Each emoji is two UTF-16 units: fifteen of them are thirty units but fifteen characters.
      expect(problemsOf(named, { ...marcos, name: '😀'.repeat(15) })).toEqual([]);
      expect(problemsOf(named, { ...marcos, name: '😀' })).toEqual([{ code: 'NAME_TOO_SHORT' }]);
    });

    it('counts characters as the participant sees them', () => {
      // "Á" typed as "A" plus a combining accent, and a family emoji made of five code points.
      expect(problemsOf(named, { ...marcos, name: 'Á' })).toEqual([{ code: 'NAME_TOO_SHORT' }]);
      expect(problemsOf(named, { ...marcos, name: '👨‍👩‍👧' })).toEqual([{ code: 'NAME_TOO_SHORT' }]);
      expect(problemsOf(named, { ...marcos, name: '👨‍👩‍👧'.repeat(30) })).toEqual([]);
    });

    it('does not count the spaces around it', () => {
      expect(problemsOf(named, { ...marcos, name: ` ${'a'.repeat(30)} ` })).toEqual([]);
    });
  });

  describe('the name on an anonymous event', () => {
    it('is refused when sent', () => {
      expect(problemsOf(anonymous, marcos)).toEqual([{ code: 'NAME_NOT_ALLOWED' }]);
    });

    it('is refused even when empty', () => {
      expect(problemsOf(anonymous, { ...marcos, name: '' })).toEqual([
        { code: 'NAME_NOT_ALLOWED' },
      ]);
    });
  });

  describe('the answered options', () => {
    it('must include every option of the event', () => {
      const luis: VoteInput = {
        name: 'Luis',
        votes: { 'jul-06': 'available', 'jul-10': 'preferred' },
      };
      expect(problemsOf(named, luis)).toEqual([{ code: 'OPTION_MISSING', optionId: 'jul-11' }]);
    });

    it('answering one the event does not have, were made for other options', () => {
      const luis: VoteInput = { name: 'Luis', votes: { ...marcos.votes, 'aug-01': 'available' } };
      expect(validateVote(named, luis)).toEqual({ status: 'other-options' });
    });

    it('were made for other options when the options were replaced since the page loaded', () => {
      // The organizer replaced 11 July by 12 July while Marcos had the page open.
      const event: VotingEvent = { anonymous: false, optionIds: ['jul-06', 'jul-10', 'jul-12'] };
      expect(validateVote(event, marcos)).toEqual({ status: 'other-options' });
    });

    it('were made for other options whatever else the vote breaks', () => {
      const luis: VoteInput = {
        name: 'A',
        votes: { 'jul-06': 'preferred', 'jul-10': 'preferred', 'aug-01': 'available' },
      };
      expect(validateVote(named, luis)).toEqual({ status: 'other-options' });
    });

    it('has at most one preferred', () => {
      const luis: VoteInput = {
        name: 'Luis',
        votes: { 'jul-06': 'preferred', 'jul-10': 'preferred', 'jul-11': 'unavailable' },
      };
      expect(problemsOf(named, luis)).toEqual([
        { code: 'SEVERAL_PREFERRED', optionIds: ['jul-06', 'jul-10'] },
      ]);
    });

    it('does not take inherited keys as answers', () => {
      const event: VotingEvent = { anonymous: false, optionIds: ['toString'] };
      expect(problemsOf(event, { name: 'Luis', votes: {} })).toEqual([
        { code: 'OPTION_MISSING', optionId: 'toString' },
      ]);
    });
  });

  it('lists every problem at once, the name first', () => {
    expect(
      problemsOf(named, {
        name: 'A',
        votes: { 'jul-06': 'preferred', 'jul-10': 'preferred' },
      }),
    ).toEqual([
      { code: 'NAME_TOO_SHORT' },
      { code: 'OPTION_MISSING', optionId: 'jul-11' },
      { code: 'SEVERAL_PREFERRED', optionIds: ['jul-06', 'jul-10'] },
    ]);
  });
});

describe('isValidVoterName', () => {
  it.each(['Li', '  Li  ', 'José', 'x'.repeat(30)])('accepts %j', (name) => {
    expect(isValidVoterName(name)).toBe(true);
  });

  it.each(['', 'A', '  A  ', '   ', '😀', 'x'.repeat(31)])('refuses %j', (name) => {
    expect(isValidVoterName(name)).toBe(false);
  });

  it('agrees with the vote validation on every name', () => {
    for (const name of ['A', 'Li', '  A  ', 'x'.repeat(31)]) {
      const accepted = validateVote(named, { ...marcos, name }).status === 'valid';
      expect(isValidVoterName(name)).toBe(accepted);
    }
  });
});

describe('summaryOf', () => {
  it('is "preferred" when an option is preferred', () => {
    expect(summaryOf({ a: 'available', b: 'preferred', c: 'unavailable' })).toBe('preferred');
  });

  it('is "noPreferred" when some option is available and none preferred', () => {
    expect(summaryOf({ a: 'unavailable', b: 'available' })).toBe('noPreferred');
  });

  it('is "nonePossible" when every option is unavailable', () => {
    expect(summaryOf({ a: 'unavailable', b: 'unavailable' })).toBe('nonePossible');
  });
});

describe('sameVoterName', () => {
  it.each([
    ['Luis', 'Luis'],
    ['Luis', '  luis '],
    ['Luis García', 'luis   GARCÍA'],
    ['José', 'Jose\u0301'],
  ])('takes %j and %j as the same voter', (stored, typed) => {
    expect(sameVoterName(stored, typed)).toBe(true);
  });

  it.each([
    ['Luis', 'Luis G.'],
    ['Luis García', 'LuisGarcía'],
    ['José', 'Jose'],
    ['María', 'Luis'],
    ['Luis', ''],
  ])('tells %j and %j apart', (stored, typed) => {
    expect(sameVoterName(stored, typed)).toBe(false);
  });
});

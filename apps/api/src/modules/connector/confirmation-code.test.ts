import { beforeEach, describe, expect, it } from 'vitest';
import {
  confirmationCodes,
  type Cancelling,
  type ConfirmationCodes,
  type Confirming,
} from './confirmation-code.js';

// Built in each test, not while the file loads: code run outside a test is checked by mutation
// testing only by running every test of the API.
let codes: ConfirmationCodes;
beforeEach(() => {
  codes = confirmationCodes('the secret of these tests');
});

/** Ana's "Cena de verano", 10 July asked by Claude, with voting open and Luis and Marta in. */
const asked: Confirming = {
  action: 'confirm',
  accountId: 'ana',
  applicationId: 'claude',
  eventId: 'k3Jd9',
  optionId: 'option-10-july',
  facts: { state: 'open', voters: 2, recommendedOptionIds: ['option-10-july'] },
};

/** The same event, asked to be cancelled by the same account and application. */
const cancelling: Cancelling = {
  action: 'cancel',
  accountId: 'ana',
  applicationId: 'claude',
  eventId: 'k3Jd9',
};

const given = new Date('2026-06-15T08:00:00.250Z');

/** `seconds` after the code was given. */
const after = (seconds: number) => new Date(given.getTime() + seconds * 1000);

describe('a confirmation code', () => {
  it('is 8 letters and digits in two groups of four, without I, L, O nor U', () => {
    const code = codes.give(asked, given);

    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it('holds for what it was given for, from the moment it was given until 10 minutes have passed', () => {
    const code = codes.give(asked, given);

    expect(codes.holds(code, asked, given)).toBe(true);
    expect(codes.holds(code, asked, after(599))).toBe(true);
    expect(codes.holds(code, asked, after(600))).toBe(false);
    expect(codes.holds(code, asked, after(3600))).toBe(false);
  });

  it('does not hold before the second it was given', () => {
    const code = codes.give(asked, given);

    expect(codes.holds(code, asked, after(-1))).toBe(false);
  });

  it.each<[string, Partial<Confirming>]>([
    ['another account', { accountId: 'bea' }],
    ['another connected application', { applicationId: 'chatgpt' }],
    ['another event', { eventId: 'Bp4Lk' }],
    ['another option', { optionId: 'option-6-july' }],
    ['voting closed since', { facts: { ...asked.facts, state: 'closed' } }],
    ['a vote more', { facts: { ...asked.facts, voters: 3 } }],
    [
      'another recommended date',
      { facts: { ...asked.facts, recommendedOptionIds: ['option-6-july'] } },
    ],
    [
      'one more recommended date',
      { facts: { ...asked.facts, recommendedOptionIds: ['option-6-july', 'option-10-july'] } },
    ],
    ['no recommended date', { facts: { ...asked.facts, recommendedOptionIds: [] } }],
  ])('does not hold for %s', (_case, change) => {
    const code = codes.give(asked, given);

    expect(codes.holds(code, { ...asked, ...change }, after(1))).toBe(false);
  });

  it('holds for cancelling what it was given for, until 10 minutes have passed', () => {
    const code = codes.give(cancelling, given);

    expect(codes.holds(code, cancelling, given)).toBe(true);
    expect(codes.holds(code, cancelling, after(599))).toBe(true);
    expect(codes.holds(code, cancelling, after(600))).toBe(false);
  });

  it.each<[string, Partial<Cancelling>]>([
    ['another account', { accountId: 'bea' }],
    ['another connected application', { applicationId: 'chatgpt' }],
    ['another event', { eventId: 'Bp4Lk' }],
  ])('does not hold for cancelling with %s', (_case, change) => {
    const code = codes.give(cancelling, given);

    expect(codes.holds(code, { ...cancelling, ...change }, after(1))).toBe(false);
  });

  it('given for confirming, does not hold for cancelling the same event, nor the other way round', () => {
    expect(codes.holds(codes.give(asked, given), cancelling, after(1))).toBe(false);
    expect(codes.holds(codes.give(cancelling, given), asked, after(1))).toBe(false);
  });

  it('is the same for the same request whichever instance of the API gives it: one deployed beside another holds the other’s codes', () => {
    // Written once from this version: a change of how the key is derived or of what is signed
    // changes them, and every code given by an instance of the version before stops holding.
    expect(codes.give(asked, given)).toBe('Z1CV-G05P');
    expect(codes.give(cancelling, given)).toBe('M9ZM-S0ZC');
  });

  it('is told apart from what another secret signs', () => {
    const code = confirmationCodes('another secret').give(asked, given);

    expect(codes.holds(code, asked, after(1))).toBe(false);
  });

  it('is read whatever its case, with or without its hyphen, and with spaces around it', () => {
    const code = codes.give(asked, given);

    expect(codes.holds(code.toLowerCase(), asked, after(1))).toBe(true);
    expect(codes.holds(code.replace('-', ''), asked, after(1))).toBe(true);
    expect(codes.holds(`  ${code}\n`, asked, after(1))).toBe(true);
  });

  it('is not a code with a letter more, before or after it', () => {
    const code = codes.give(asked, given);

    expect(codes.holds(`0${code}`, asked, after(1))).toBe(false);
    expect(codes.holds(`0${code.replace('-', '')}`, asked, after(1))).toBe(false);
    expect(codes.holds(`${code}0`, asked, after(1))).toBe(false);
  });

  it.each(['', 'K7P2', 'K7P2-9QMX-K7P2', 'K7P2-9QM!', 'K7P2 9QMX', 'Ñ7P2-9QMX'])(
    'is not "%s", which no code is written as',
    (written) => {
      expect(codes.holds(written, asked, after(1))).toBe(false);
    },
  );

  it('differs for each second it is given in', () => {
    expect(codes.give(asked, after(1))).not.toBe(codes.give(asked, given));
  });
});

import { describe, expect, it } from 'vitest';
import { closingInstant, currentState, type StoredEventState } from './event-state.js';

// "Cena de verano" closes at the end of 1 July in Madrid (UTC+2 in summer).
const closesAt = new Date('2026-07-01T21:59:59.999Z');
const beforeClosing = new Date('2026-07-01T21:59:59.998Z');

function stored(state: StoredEventState['state']): StoredEventState {
  return { state, closesAt };
}

describe('currentState', () => {
  it('is open before the closing instant', () => {
    expect(currentState(stored('open'), beforeClosing)).toBe('open');
  });

  it('is closed from the closing instant on, even if nobody closed it', () => {
    expect(currentState(stored('open'), closesAt)).toBe('closed');
    expect(currentState(stored('open'), new Date('2026-07-02T08:00:00Z'))).toBe('closed');
  });

  it('stays closed when the organizer closed voting early', () => {
    expect(currentState(stored('closed'), beforeClosing)).toBe('closed');
  });

  it('stays confirmed before and after the closing instant', () => {
    expect(currentState(stored('confirmed'), beforeClosing)).toBe('confirmed');
    expect(currentState(stored('confirmed'), closesAt)).toBe('confirmed');
  });
});

describe('closingInstant', () => {
  it("is the last millisecond of the deadline in the event's time zone", () => {
    expect(closingInstant('2026-07-01', 'Europe/Madrid')).toEqual(closesAt);
    expect(closingInstant('2026-12-01', 'Europe/Madrid')).toEqual(
      new Date('2026-12-01T22:59:59.999Z'),
    );
  });

  it('follows zones behind UTC, with half-hour offsets and a day ahead of UTC', () => {
    expect(closingInstant('2026-07-01', 'America/New_York')).toEqual(
      new Date('2026-07-02T03:59:59.999Z'),
    );
    expect(closingInstant('2026-07-01', 'Asia/Kolkata')).toEqual(
      new Date('2026-07-01T18:29:59.999Z'),
    );
    expect(closingInstant('2026-07-01', 'Pacific/Kiritimati')).toEqual(
      new Date('2026-07-01T09:59:59.999Z'),
    );
    expect(closingInstant('2026-07-01', 'UTC')).toEqual(new Date('2026-07-01T23:59:59.999Z'));
  });

  it('closes with the offset in force at the end of the day when the clocks change that day', () => {
    // Madrid moves to summer time on 29 March 2026 at 02:00 and back on 25 October at 03:00.
    expect(closingInstant('2026-03-29', 'Europe/Madrid')).toEqual(
      new Date('2026-03-29T21:59:59.999Z'),
    );
    expect(closingInstant('2026-10-25', 'Europe/Madrid')).toEqual(
      new Date('2026-10-25T22:59:59.999Z'),
    );
  });

  it("ends the day at the next day's first instant when that day has no midnight", () => {
    // Santiago de Chile skips from 00:00 to 01:00 on 6 September 2026, so 5 September ends at
    // 01:00 local time (UTC-3); it moves back an hour at the end of 4 April, which ends at the
    // second midnight (UTC-4).
    expect(closingInstant('2026-09-05', 'America/Santiago')).toEqual(
      new Date('2026-09-06T03:59:59.999Z'),
    );
    expect(closingInstant('2026-04-04', 'America/Santiago')).toEqual(
      new Date('2026-04-05T03:59:59.999Z'),
    );
  });

  it('ends the day at its midnight when the clocks go back later that night', () => {
    // Jerusalem moves back from UTC+3 to UTC+2 at 02:00 on 25 October 2026: 24 October still
    // ends at midnight in summer time, 21:00 UTC.
    expect(closingInstant('2026-10-24', 'Asia/Jerusalem')).toEqual(
      new Date('2026-10-24T20:59:59.999Z'),
    );
    // Sydney moves back from UTC+11 to UTC+10 at 03:00 on 4 April 2027.
    expect(closingInstant('2027-04-03', 'Australia/Sydney')).toEqual(
      new Date('2027-04-03T12:59:59.999Z'),
    );
    expect(
      currentState(
        { state: 'open', closesAt: closingInstant('2027-04-03', 'Australia/Sydney') },
        new Date('2027-04-03T13:30:00Z'),
      ),
    ).toBe('closed');
  });

  it('closes at the end of the month and of the year', () => {
    expect(closingInstant('2026-06-30', 'Europe/Madrid')).toEqual(
      new Date('2026-06-30T21:59:59.999Z'),
    );
    expect(closingInstant('2026-12-31', 'Europe/Madrid')).toEqual(
      new Date('2026-12-31T22:59:59.999Z'),
    );
  });
});

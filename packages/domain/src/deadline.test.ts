import { describe, expect, it } from 'vitest';
import { closingNow, deadlineClosing, deadlineProblem } from './deadline.js';

// 15 June 2026, ten past midnight in Madrid (UTC+2 in summer): still the 14th in New York.
const madridAfterMidnight = new Date('2026-06-14T22:10:00Z');

describe('deadlineProblem', () => {
  it('takes any day from today to twelve months ahead', () => {
    expect(deadlineProblem('2026-06-15', '2026-06-15')).toBeUndefined();
    expect(deadlineProblem('2026-07-01', '2026-06-15')).toBeUndefined();
    expect(deadlineProblem('2027-06-15', '2026-06-15')).toBeUndefined();
  });

  it('refuses a day before today as past', () => {
    expect(deadlineProblem('2026-06-14', '2026-06-15')).toEqual({ code: 'DEADLINE_PAST' });
  });

  it('refuses a day after the twelve months as too far', () => {
    expect(deadlineProblem('2027-06-16', '2026-06-15')).toEqual({ code: 'DEADLINE_TOO_FAR' });
  });
});

describe('deadlineClosing', () => {
  it('opens voting until the end of the new deadline in the event’s time zone', () => {
    expect(deadlineClosing('2026-07-03', 'Europe/Madrid', madridAfterMidnight)).toEqual({
      ok: true,
      closing: {
        state: 'open',
        deadline: '2026-07-03',
        closesAt: new Date('2026-07-03T21:59:59.999Z'),
      },
    });
  });

  it('takes today in the event’s time zone, where the day may have begun already or not yet', () => {
    expect(deadlineClosing('2026-06-15', 'Europe/Madrid', madridAfterMidnight)).toMatchObject({
      ok: true,
      closing: { deadline: '2026-06-15', closesAt: new Date('2026-06-15T21:59:59.999Z') },
    });
    expect(deadlineClosing('2026-06-14', 'America/New_York', madridAfterMidnight)).toMatchObject({
      ok: true,
      closing: { deadline: '2026-06-14', closesAt: new Date('2026-06-15T03:59:59.999Z') },
    });
    expect(deadlineClosing('2026-06-14', 'Europe/Madrid', madridAfterMidnight)).toEqual({
      ok: false,
      problem: { code: 'DEADLINE_PAST' },
    });
  });

  it('refuses a deadline beyond the twelve months', () => {
    expect(deadlineClosing('2027-06-16', 'Europe/Madrid', madridAfterMidnight)).toEqual({
      ok: false,
      problem: { code: 'DEADLINE_TOO_FAR' },
    });
  });
});

describe('closingNow', () => {
  const open = { state: 'open', closesAt: new Date('2026-07-01T21:59:59.999Z') } as const;

  it('closes voting at this instant, the deadline becoming today in the event’s time zone', () => {
    expect(closingNow({ ...open, timeZone: 'Europe/Madrid' }, madridAfterMidnight)).toEqual({
      state: 'closed',
      deadline: '2026-06-15',
      closesAt: madridAfterMidnight,
    });
    expect(closingNow({ ...open, timeZone: 'America/New_York' }, madridAfterMidnight)).toEqual({
      state: 'closed',
      deadline: '2026-06-14',
      closesAt: madridAfterMidnight,
    });
  });

  it('changes nothing once voting has closed, by the deadline or before it', () => {
    const passed = { ...open, timeZone: 'Europe/Madrid', closesAt: madridAfterMidnight };
    const closedEarly = { ...open, timeZone: 'Europe/Madrid', state: 'closed' } as const;
    expect(closingNow(passed, madridAfterMidnight)).toBeUndefined();
    expect(closingNow(closedEarly, madridAfterMidnight)).toBeUndefined();
  });

  it('changes nothing on a confirmed event, whose voting closed with the confirmation', () => {
    const confirmed = { ...open, timeZone: 'Europe/Madrid', state: 'confirmed' } as const;
    expect(closingNow(confirmed, madridAfterMidnight)).toBeUndefined();
  });
});

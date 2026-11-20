import { describe, expect, it } from 'vitest';
import { closingInstant } from './event-state.js';
import {
  NOTE_MAX_LENGTH,
  type NewEventInput,
  closesAfterFirstOption,
  suggestedDeadline,
  validateNewEvent,
} from './new-event.js';
import type { ProposedOption } from './options.js';

const wholeDay = (date: string): ProposedOption => ({
  dates: { kind: 'single', date },
  time: null,
});

const cena: NewEventInput = {
  organizerName: 'Ana',
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  anonymous: false,
  options: [wholeDay('2026-07-06')],
};

// 10:00 in Madrid on 15 June 2026.
const morning = new Date('2026-06-15T08:00:00Z');

// 01:30 of 15 June in Madrid, still 19:30 of 14 June in New York.
const madridAfterMidnight = new Date('2026-06-14T23:30:00Z');

describe('validateNewEvent', () => {
  it('answers the event as it is stored: trimmed, its options in order, its closing instant', () => {
    const validation = validateNewEvent(
      {
        organizerName: '  Ana ',
        title: ' Cena de verano  ',
        note: '  Trae postre. ',
        timeZone: 'Europe/Madrid',
        deadline: '2026-07-01',
        anonymous: true,
        options: [wholeDay('2026-07-10'), wholeDay('2026-07-06')],
      },
      morning,
    );

    expect(validation).toEqual({
      ok: true,
      event: {
        organizerName: 'Ana',
        title: 'Cena de verano',
        note: 'Trae postre.',
        timeZone: 'Europe/Madrid',
        deadline: '2026-07-01',
        closesAt: closingInstant('2026-07-01', 'Europe/Madrid'),
        anonymous: true,
        options: [wholeDay('2026-07-06'), wholeDay('2026-07-10')],
      },
    });
  });

  it('keeps an event without a note, or with only spaces in it, without one', () => {
    const without = validateNewEvent(cena, morning);
    const blank = validateNewEvent({ ...cena, note: '   ' }, morning);

    expect(without).toMatchObject({ ok: true, event: { note: null } });
    expect(blank).toMatchObject({ ok: true, event: { note: null } });
  });

  it('takes a note of 150 characters as people see them, once trimmed, and refuses a longer one', () => {
    // A family is one character made of seven code points.
    const family = '👨‍👩‍👧‍👦';
    const longest = `${family}${'a'.repeat(NOTE_MAX_LENGTH - 1)}`;

    expect(NOTE_MAX_LENGTH).toBe(150);
    expect(validateNewEvent({ ...cena, note: ` ${longest} ` }, morning)).toMatchObject({
      ok: true,
      event: { note: longest },
    });
    expect(validateNewEvent({ ...cena, note: `${longest}a` }, morning)).toEqual({
      ok: false,
      problems: [{ code: 'NOTE_TOO_LONG' }],
    });
  });

  it('takes a deadline of today in the event’s time zone and refuses one of the day before', () => {
    const today = validateNewEvent({ ...cena, deadline: '2026-06-15' }, madridAfterMidnight);
    const yesterday = validateNewEvent({ ...cena, deadline: '2026-06-14' }, madridAfterMidnight);
    const yesterdayInNewYork = validateNewEvent(
      { ...cena, timeZone: 'America/New_York', deadline: '2026-06-14' },
      madridAfterMidnight,
    );

    expect(today.ok).toBe(true);
    expect(yesterday).toEqual({ ok: false, problems: [{ code: 'DEADLINE_PAST' }] });
    // Still the 14th there: voting can close at the end of today.
    expect(yesterdayInNewYork).toMatchObject({
      ok: true,
      event: { closesAt: closingInstant('2026-06-14', 'America/New_York') },
    });
  });

  it('takes a deadline twelve months ahead in the event’s time zone and refuses one a day later', () => {
    const last = validateNewEvent({ ...cena, deadline: '2027-06-15' }, madridAfterMidnight);
    const beyond = validateNewEvent({ ...cena, deadline: '2027-06-16' }, madridAfterMidnight);
    const beyondInNewYork = validateNewEvent(
      { ...cena, timeZone: 'America/New_York', deadline: '2027-06-15' },
      madridAfterMidnight,
    );

    expect(last.ok).toBe(true);
    expect(beyond).toEqual({ ok: false, problems: [{ code: 'DEADLINE_TOO_FAR' }] });
    // Still the 14th there: twelve months ahead is the 14th.
    expect(beyondInNewYork).toEqual({ ok: false, problems: [{ code: 'DEADLINE_TOO_FAR' }] });
  });

  it('checks the options with today in the event’s time zone', () => {
    const options = [wholeDay('2026-07-06'), wholeDay('2026-06-14')];

    const inMadrid = validateNewEvent({ ...cena, options }, madridAfterMidnight);
    const inNewYork = validateNewEvent(
      { ...cena, timeZone: 'America/New_York', options },
      madridAfterMidnight,
    );

    expect(inMadrid).toEqual({ ok: false, problems: [{ code: 'DATE_PAST', index: 1 }] });
    expect(inNewYork.ok).toBe(true);
  });

  it('refuses an event without options', () => {
    expect(validateNewEvent({ ...cena, options: [] }, morning)).toEqual({
      ok: false,
      problems: [{ code: 'NO_OPTIONS' }],
    });
  });

  it('lists every problem at once, in the order of the wizard’s steps', () => {
    const validation = validateNewEvent(
      {
        organizerName: 'A',
        title: '',
        note: 'a'.repeat(NOTE_MAX_LENGTH + 1),
        timeZone: 'Europe/Madrid',
        deadline: '2026-06-14',
        anonymous: false,
        options: [wholeDay('2026-07-06'), wholeDay('2026-07-06')],
      },
      morning,
    );

    expect(validation).toEqual({
      ok: false,
      problems: [
        { code: 'NAME_TOO_SHORT' },
        { code: 'TITLE_MISSING' },
        { code: 'DUPLICATE', index: 1 },
        { code: 'DEADLINE_PAST' },
        { code: 'NOTE_TOO_LONG' },
      ],
    });
  });
});

const range = (start: string, end: string): ProposedOption => ({
  dates: { kind: 'range', start, end },
  time: null,
});

describe('suggestedDeadline', () => {
  it('is a week from today while the first option is further away', () => {
    expect(suggestedDeadline([wholeDay('2026-11-28'), wholeDay('2026-12-05')], '2026-11-20')).toBe(
      '2026-11-27',
    );
    expect(suggestedDeadline([wholeDay('2027-01-15')], '2026-11-20')).toBe('2026-11-27');
  });

  it('is the day before the first option when that comes sooner, from any place in the list', () => {
    expect(suggestedDeadline([wholeDay('2026-12-05'), wholeDay('2026-11-22')], '2026-11-20')).toBe(
      '2026-11-21',
    );
    expect(suggestedDeadline([range('2026-11-24', '2026-11-30')], '2026-11-20')).toBe('2026-11-23');
  });

  it('is never before today', () => {
    expect(suggestedDeadline([wholeDay('2026-11-21')], '2026-11-20')).toBe('2026-11-20');
    expect(suggestedDeadline([wholeDay('2026-11-20')], '2026-11-20')).toBe('2026-11-20');
  });

  it('is a week from today without options, across the end of a month and of a year', () => {
    expect(suggestedDeadline([], '2026-12-28')).toBe('2027-01-04');
    expect(suggestedDeadline([], '2028-02-25')).toBe('2028-03-03');
  });
});

describe('closesAfterFirstOption', () => {
  const options = [wholeDay('2026-12-05'), range('2026-11-28', '2026-11-30')];

  it('is true from the first day proposed on: voting closes at its end, once the day has begun', () => {
    expect(closesAfterFirstOption('2026-11-28', options)).toBe(true);
    expect(closesAfterFirstOption('2026-12-10', options)).toBe(true);
  });

  it('is false before the first day proposed, and without options', () => {
    expect(closesAfterFirstOption('2026-11-27', options)).toBe(false);
    expect(closesAfterFirstOption('2026-11-27', [])).toBe(false);
  });
});

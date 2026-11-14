import { describe, expect, it } from 'vitest';
import { readDates, type DatesRead, type ReadOption } from './index.js';

// Every phrase is written on Monday 15 June 2026, in a browser of Spain unless the test says so.
const today = '2026-06-15';
const read = (text: string, region = 'ES'): DatesRead => readDates(text, { today, region });

const day = (date: string): ReadOption => ({ dates: { kind: 'single', date }, time: null });

/** An answer with nothing to tell the organizer but its options. */
const understood = (options: ReadOption[]): DatesRead => ({
  options,
  notUnderstood: [],
  notice: null,
  questions: [],
});

describe('readDates: the days', () => {
  it('reads a day as one option with no time', () => {
    expect(read('el miércoles 24')).toEqual(understood([day('2026-06-24')]));
  });

  it('reads a range of days as one option, from its first day to its last', () => {
    expect(read('del 6 al 10 de julio')).toEqual(
      understood([
        { dates: { kind: 'range', start: '2026-07-06', end: '2026-07-10' }, time: null },
      ]),
    );
  });

  it('reads a weekday said for a whole month as one option per day', () => {
    expect(read('los lunes de julio')).toEqual(
      understood([day('2026-07-06'), day('2026-07-13'), day('2026-07-20'), day('2026-07-27')]),
    );
  });

  it('reads Spanish, Catalan and English, and a mistyped word', () => {
    const friday = understood([
      { dates: { kind: 'single', date: '2026-06-19' }, time: { kind: 'single', at: '20:30' } },
    ]);

    expect(read('el viernes a las 20:30')).toEqual(friday);
    expect(read('divendres a les 20:30')).toEqual(friday);
    expect(read('vienres a las 20:30')).toEqual(friday);
    expect(read('Friday or Saturday at 7pm').options).toEqual([
      { dates: { kind: 'single', date: '2026-06-19' }, time: { kind: 'single', at: '19:00' } },
      { dates: { kind: 'single', date: '2026-06-20' }, time: { kind: 'single', at: '19:00' } },
    ]);
  });

  it('reads a date in figures as day/month, and as month/day in a region that writes it so', () => {
    expect(read('7/4', 'ES').options).toEqual([day('2027-04-07')]);
    expect(read('7/4', 'US').options).toEqual([day('2026-07-04')]);
  });

  it('reads a date in figures as day/month when the region is not known', () => {
    expect(readDates('7/4', { today }).options).toEqual([day('2027-04-07')]);
  });
});

describe('readDates: the times', () => {
  it('reads a range of times', () => {
    expect(read('el viernes de 10 a 12').options).toEqual([
      {
        dates: { kind: 'single', date: '2026-06-19' },
        time: { kind: 'range', start: '10:00', end: '12:00' },
      },
    ]);
  });

  it('marks a range of times that ends on the next day', () => {
    expect(read('el sábado de 22 a 2')).toEqual(
      understood([
        {
          dates: { kind: 'single', date: '2026-06-20' },
          time: { kind: 'range', start: '22:00', end: '02:00', nextDay: true },
        },
      ]),
    );
  });

  it('gives both readings of an hour whose half of the day was not said, and asks about it', () => {
    const morning = { kind: 'single', at: '08:00' } as const;
    const afternoon = { kind: 'single', at: '20:00' } as const;

    expect(read('el viernes a las 8')).toEqual({
      options: [
        {
          dates: { kind: 'single', date: '2026-06-19' },
          time: { kind: 'pending', morning, afternoon },
        },
      ],
      notUnderstood: [],
      notice: null,
      questions: [{ text: 'a las 8', morning, afternoon }],
    });
  });

  it('asks once about a time said for several days, and once per distinct time', () => {
    expect(
      read('el viernes a las 8 o el sábado a las 8').questions.map(({ text }) => text),
    ).toEqual(['a las 8']);
    expect(read('el viernes a las 8 o a las 9').questions.map(({ text }) => text)).toEqual([
      'a las 8',
      'a las 9',
    ]);
  });
});

describe('readDates: what was not understood', () => {
  it('answers no options and the notice "unclear" for a phrase that says no date', () => {
    expect(read('cuando podáis')).toEqual({
      options: [],
      notUnderstood: ['cuando podáis'],
      notice: 'unclear',
      questions: [],
    });
  });

  it('keeps what it understood and names the fragment it did not', () => {
    expect(read('sabado o domingo y traed bebida')).toEqual({
      options: [day('2026-06-20'), day('2026-06-21')],
      notUnderstood: ['traed bebida'],
      notice: 'unclear',
      questions: [],
    });
  });

  it('answers "mismatch" for a date that does not exist', () => {
    expect(read('el 31 de junio')).toEqual({
      options: [],
      notUnderstood: ['el 31 de junio'],
      notice: 'mismatch',
      questions: [],
    });
  });

  it('answers "past" for a day before today, and keeps the days to come', () => {
    expect(read('mañana o ayer')).toEqual({
      options: [day('2026-06-16')],
      notUnderstood: ['ayer'],
      notice: 'past',
      questions: [],
    });
  });

  it('answers "horizon" for a day more than twelve months away', () => {
    expect(read('el 20 de diciembre de 2027')).toEqual({
      options: [],
      notUnderstood: ['el 20 de diciembre de 2027'],
      notice: 'horizon',
      questions: [],
    });
  });

  it('answers "tooMany" for a phrase that says more than sixty options', () => {
    expect(read('todos los días hasta diciembre')).toEqual({
      options: [],
      notUnderstood: ['todos los días hasta diciembre'],
      notice: 'tooMany',
      questions: [],
    });
  });

  it('answers "timeUnclear" for a vague time: the day is kept, with no time', () => {
    expect(read('el viernes por la tarde')).toEqual({
      options: [day('2026-06-19')],
      notUnderstood: ['por la tarde'],
      notice: 'timeUnclear',
      questions: [],
    });
  });

  it('answers "tooLate" for a range of times that ends after 06:00 of the next day', () => {
    expect(read('el viernes de 22 a 8 y el sábado de 20 a 23')).toEqual({
      options: [
        day('2026-06-19'),
        {
          dates: { kind: 'single', date: '2026-06-20' },
          time: { kind: 'range', start: '20:00', end: '23:00' },
        },
      ],
      notUnderstood: ['de 22 a 8'],
      notice: 'tooLate',
      questions: [],
    });
  });

  it('names every fragment it did not understand, with one notice', () => {
    const answer = read('el viernes por la tarde y el sábado de 22 a 8');

    expect(answer.notUnderstood).toEqual(['por la tarde', 'de 22 a 8']);
    expect(answer.notice).toBe('tooLate');
  });
});

/** An answer that marks nothing and names the whole phrase. */
const nothing = (text: string, notice: DatesRead['notice']): DatesRead => ({
  options: [],
  notUnderstood: [text],
  notice,
  questions: [],
});

describe('readDates: dates that cannot be marked', () => {
  it('answers "mismatch" for a range of days written backwards', () => {
    const backwards = 'del 20 de agosto de 2026 al 10 de agosto de 2026';

    expect(read(backwards)).toEqual(nothing(backwards, 'mismatch'));
  });

  it('answers "mismatch" for a weekday pattern over a period written backwards', () => {
    const backwards = 'todos los lunes del 20 de agosto de 2026 al 10 de agosto de 2026';

    expect(read(backwards)).toEqual(nothing(backwards, 'mismatch'));
  });

  it('answers "past" for a month of a past year, alone or with a weekday pattern', () => {
    expect(read('julio de 2025')).toEqual(nothing('julio de 2025', 'past'));
    expect(read('todos los lunes de julio de 2025')).toEqual(
      nothing('todos los lunes de julio de 2025', 'past'),
    );
  });

  it('keeps the days to come when a month of a past year is said with them', () => {
    expect(read('agosto de 2025 o mañana')).toEqual({
      options: [day('2026-06-16')],
      notUnderstood: ['agosto de 2025'],
      notice: 'past',
      questions: [],
    });
  });

  it('starts today a weekday pattern over a period under way, as the plain range does', () => {
    expect(read('del 10 al 20 de junio').options).toEqual([
      { dates: { kind: 'range', start: '2026-06-15', end: '2026-06-20' }, time: null },
    ]);
    expect(read('todos los lunes del 10 al 20 de junio')).toEqual(understood([day('2026-06-15')]));
  });

  it('answers "mismatch" for a count of zero', () => {
    for (const zero of ['los próximos 0 lunes', 'los próximos 0 fines de semana']) {
      expect(read(zero)).toEqual(nothing(zero, 'mismatch'));
    }
  });

  it('keeps the weekends within twelve months of a count that goes beyond them, with "horizon"', () => {
    const many = 'los próximos 4294967296 fines de semana';
    const answer = read(many);

    expect(answer.options).toHaveLength(52);
    expect(answer.options[0]).toEqual({
      dates: { kind: 'range', start: '2026-06-20', end: '2026-06-21' },
      time: null,
    });
    expect(answer.options.at(-1)).toEqual({
      dates: { kind: 'range', start: '2027-06-12', end: '2027-06-13' },
      time: null,
    });
    expect(answer.notUnderstood).toEqual([many]);
    expect(answer.notice).toBe('horizon');
  });

  it('keeps the weekdays within twelve months of a count that goes beyond them, with "horizon"', () => {
    const many = 'los próximos 4294967296 lunes';
    const answer = read(many);

    expect(answer.options).toHaveLength(52);
    expect(answer.options.at(-1)).toEqual(day('2027-06-14'));
    expect(answer.notUnderstood).toEqual([many]);
    expect(answer.notice).toBe('horizon');
  });

  it('reads a count that fits in the twelve months whole, with no notice', () => {
    expect(read('los próximos 3 fines de semana')).toEqual(
      understood([
        { dates: { kind: 'range', start: '2026-06-20', end: '2026-06-21' }, time: null },
        { dates: { kind: 'range', start: '2026-06-27', end: '2026-06-28' }, time: null },
        { dates: { kind: 'range', start: '2026-07-04', end: '2026-07-05' }, time: null },
      ]),
    );
  });

  it('answers "horizon" for midnight at the end of the last day of the twelve months', () => {
    expect(read('el 15 de junio de 2027').options).toEqual([day('2027-06-15')]);
    for (const midnight of [
      'el 15 de junio de 2027 a medianoche',
      'el 15 de junio de 2027 de medianoche a 2',
    ]) {
      expect(read(midnight)).toEqual(nothing(midnight, 'horizon'));
    }
  });

  it('keeps a range of times of the last day that ends after midnight: it is an option of that day', () => {
    expect(read('el 15 de junio de 2027 de 22 a 2')).toEqual(
      understood([
        {
          dates: { kind: 'single', date: '2027-06-15' },
          time: { kind: 'range', start: '22:00', end: '02:00', nextDay: true },
        },
      ]),
    );
  });
});

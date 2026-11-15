import { describe, expect, it } from 'vitest';
import {
  readDates,
  type ClockTime,
  type DatesRead,
  type ReadNotice,
  type ReadOption,
} from './index.js';
import { known } from './known.js';

// A phrase is written on Monday 15 June 2026 unless the test says another day; always in a browser of Spain.
const monday = '2026-06-15';

const clock = (time: ClockTime): string =>
  time.kind === 'single' ? time.at : `${time.start}–${time.end}${time.nextDay ? '+1' : ''}`;
/** An option as text: "2026-06-19", "2026-07-06→2026-07-10", "2026-06-19 20:00", "2026-06-19 22:00–02:00+1", "2026-06-19 08:00|20:00" (the two readings of a time that is asked). */
const optionText = ({ dates, time }: ReadOption, questions: DatesRead['questions']): string => {
  const day = dates.kind === 'single' ? dates.date : `${dates.start}→${dates.end}`;
  if (time?.kind !== 'question') return time ? `${day} ${clock(time)}` : day;
  const { morning, afternoon } = questions[time.question]!;
  return `${day} ${clock(morning)}|${clock(afternoon)}`;
};
/** A notice as text: its kind, its fragment, its dates and how the day was written. */
const noticeText = (notice: ReadNotice): string =>
  [
    notice.kind,
    'fragment' in notice ? `«${notice.fragment}»` : [],
    'dates' in notice && notice.dates.length ? notice.dates.join(',') : [],
    'written' in notice ? notice.written : [],
  ]
    .flat()
    .join(' ');

/** The answer to a phrase, its options and its notices as text. */
interface Answer {
  options: string[];
  notices: string[];
}
const answer = (text: string, today = monday): Answer => {
  const { options, questions, notices } = readDates(text, { today, region: 'ES' });
  return {
    options: options.map((option) => optionText(option, questions)),
    notices: notices.map(noticeText),
  };
};
/** An answer with nothing to tell the organizer but its options. */
const understood = (options: string[]): Answer => ({ options, notices: [] });
/** The answer to a phrase that gives no option: only its notices. */
const nothing = (...notices: string[]): Answer => ({ options: [], notices });

describe('calendar: a day and its month (R4, R7, R19)', () => {
  it.each([
    ['el 1 de junio de 2027', monday, '2027-06-01'],
    ['el 15 de mayo', monday, '2027-05-15'],
    ['el 29 de febrero', '2027-06-15', '2028-02-29'],
    ['el lunes 15', monday, '2026-06-15'],
  ])('reads "%s" written on %s as %s', (phrase, today, date) => {
    expect(answer(phrase, today)).toEqual(understood([date]));
  });

  it.each([
    ['el 16 de mayo', monday],
    ['el 28 de diciembre', '2026-01-05'],
  ])('answers "past" for "%s" written on %s, thirty days later or fewer', (phrase, today) => {
    expect(answer(phrase, today)).toEqual(nothing(`past «${phrase}»`));
  });

  it('answers "horizon" for a 29 February of a written year beyond the twelve months', () => {
    expect(answer('el 29 de febrero de 2028')).toEqual(
      nothing('horizon «el 29 de febrero de 2028»'),
    );
  });

  it('answers "mismatch" for figures that are a date in no order', () => {
    expect(answer('13/14')).toEqual(nothing('mismatch «13/14»'));
  });

  it.each([
    ['el día 20', '2026-11-15', '2026-11-20'],
    ['el día 20', '2026-12-15', '2026-12-20'],
    ['el día 10', '2026-12-15', '2027-01-10'],
  ])('reads "%s" written on %s as its next occurrence, %s', (phrase, today, date) => {
    expect(answer(phrase, today)).toEqual(understood([date]));
  });

  it('reads the week of a bare day number that is today as this week', () => {
    expect(answer('la semana del 15')).toEqual(understood(['2026-06-15→2026-06-21']));
  });

  it('counts the twelve months to the same day of the next year, across a leap day', () => {
    expect(answer('el 15 de junio de 2028', '2027-06-15')).toEqual(understood(['2028-06-15']));
  });
});

describe('calendar: a range of days (R22, R31)', () => {
  it.each([
    ['del 10 al 15 de junio', monday, '2026-06-15'],
    ['del 10 de junio al 20', monday, '2026-06-15→2026-06-20'],
    ['del miércoles 10 al sábado 20 de junio', monday, '2026-06-15→2026-06-20'],
    ['del 20 de diciembre al 10 de enero', '2026-01-05', '2026-01-05→2026-01-10'],
  ])('gives what is left of "%s" written on %s', (phrase, today, option) => {
    expect(answer(phrase, today)).toEqual(understood([option]));
  });

  it.each([
    'del 10 al 20 de junio de 2025',
    'del 10 de junio de 2025 al 20 de junio',
    'del 10 de junio al 20 de junio de 2025',
  ])('answers "past" for "%s", a range of last year', (phrase) => {
    expect(answer(phrase)).toEqual(nothing(`past «${phrase}»`));
  });

  it.each([
    'del martes 10 al sábado 20 de junio',
    'del miércoles 10 al viernes 20 de junio',
    'del 25 al 31 de junio',
    'del 31 de junio al 5 de julio',
  ])('answers "mismatch" for "%s"', (phrase) => {
    expect(answer(phrase)).toEqual(nothing(`mismatch «${phrase}»`));
  });

  it.each([
    ['del 28 al 3 de enero', '2026-12-28→2027-01-03'],
    ['del 28 al 3 de enero de 2027', '2026-12-28→2027-01-03'],
    ['del 28 de julio al 3', '2026-07-28→2026-08-03'],
    ['del 28 de diciembre al 3', '2026-12-28→2027-01-03'],
    ['del 3 de julio al 10', '2026-07-03→2026-07-10'],
    ['del 28 al 3', '2026-06-28→2026-07-03'],
  ])('reads the month said at one end of "%s" for both ends', (phrase, option) => {
    expect(answer(phrase)).toEqual(understood([option]));
  });

  it('answers "past" for a range written backwards that is over, and "mismatch" for one that ends today', () => {
    const over = 'del 20 de mayo de 2026 al 10 de mayo de 2026';
    const today = 'del 20 de junio de 2026 al 15 de junio de 2026';

    expect(answer(over)).toEqual(nothing(`past «${over}»`));
    expect(answer(today)).toEqual(nothing(`mismatch «${today}»`));
  });
});

describe('calendar: two weekdays of a week (R32)', () => {
  it.each([
    ['del lunes al jueves de esta semana', monday, '2026-06-15→2026-06-18'],
    ['del lunes al martes de la semana que viene', monday, '2026-06-22→2026-06-23'],
    ['del lunes al jueves de esta semana', '2026-06-17', '2026-06-17→2026-06-18'],
    ['del lunes al miércoles de esta semana', '2026-06-17', '2026-06-17'],
  ])('reads "%s" written on %s as %s', (phrase, today, option) => {
    expect(answer(phrase, today)).toEqual(understood([option]));
  });

  it('answers "past" when the last of them was yesterday', () => {
    const phrase = 'del lunes al miércoles de esta semana';

    expect(answer(phrase, '2026-06-18')).toEqual(nothing(`past «${phrase}»`));
  });
});

describe('calendar: months, weeks and the days up to a day (R3, R18, R22)', () => {
  it.each([
    ['en junio', '2026-06-30', ['2026-06-30']],
    ['de mayo a junio', '2026-06-30', ['2026-06-30']],
    ['todos los martes de junio', '2026-06-30', ['2026-06-30']],
    ['el mes que viene', '2026-12-15', ['2027-01-01→2027-01-31']],
    ['esta semana', '2026-06-17', ['2026-06-17→2026-06-21']],
    ['hasta el 15 de junio', monday, ['2026-06-15']],
    [
      'todos los días de esta semana',
      monday,
      [
        '2026-06-15',
        '2026-06-16',
        '2026-06-17',
        '2026-06-18',
        '2026-06-19',
        '2026-06-20',
        '2026-06-21',
      ],
    ],
  ])('reads "%s" written on %s', (phrase, today, options) => {
    expect(answer(phrase, today)).toEqual(understood(options));
  });

  it.each(['de enero a marzo de 2026', 'hasta el 10 de junio de 2026'])(
    'answers "past" for "%s"',
    (phrase) => {
      expect(answer(phrase)).toEqual(nothing(`past «${phrase}»`));
    },
  );

  it("reads a weekday said for a month with none left as next year's", () => {
    expect(answer('todos los lunes de junio', '2026-06-30')).toEqual(
      understood(['2027-06-07', '2027-06-14', '2027-06-21', '2027-06-28']),
    );
  });

  it('answers "unclear" for a weekday said for no period', () => {
    expect(answer('todos los lunes')).toEqual(nothing('unclear'));
  });

  it('takes one day of a month out of a range that holds its number twice', () => {
    expect(answer('del 1 de julio al 31 de agosto menos el 15 de agosto')).toEqual(
      understood(['2026-07-01→2026-08-14', '2026-08-16→2026-08-31']),
    );
  });
});

describe('calendar: the twelve-month and sixty-option limits (R19, R20)', () => {
  it('gives sixty options', () => {
    const { options, notices } = answer('los próximos 60 días');

    expect(options).toHaveLength(60);
    expect(options[0]).toBe('2026-06-16');
    expect(options.at(-1)).toBe('2026-08-14');
    expect(notices).toEqual([]);
  });

  it('answers "tooMany" for sixty-one', () => {
    expect(answer('los próximos 61 días')).toEqual(nothing('tooMany'));
  });
});

describe('calendar: ordinal weekdays (R33)', () => {
  it.each([
    ['el primer lunes de junio', monday, ['2027-06-07']],
    ['el tercer lunes de junio', monday, ['2026-06-15']],
    ['el primer lunes del mes que viene', '2026-12-15', ['2027-01-04']],
    [
      'el primer lunes de cada mes hasta febrero',
      monday,
      [
        '2026-07-06',
        '2026-08-03',
        '2026-09-07',
        '2026-10-05',
        '2026-11-02',
        '2026-12-07',
        '2027-01-04',
        '2027-02-01',
      ],
    ],
    ['el primer lunes de cada mes hasta el 3 de agosto', monday, ['2026-07-06', '2026-08-03']],
  ])('reads "%s" written on %s', (phrase, today, options) => {
    expect(answer(phrase, today)).toEqual(understood(options));
  });
});

describe('calendar: the halves of a month (R23)', () => {
  it('reads the second half of this month on its first day as this month', () => {
    expect(answer('la segunda quincena de junio', '2026-06-16')).toEqual(
      understood(['2026-06-16→2026-06-30']),
    );
  });

  it('answers "unclear" for a third half', () => {
    expect(answer('la tercera quincena de julio')).toEqual(nothing('unclear'));
  });
});

describe('calendar: weekends (R2, R6, R26)', () => {
  it.each([
    ['este finde', '2026-06-20', ['2026-06-20→2026-06-21']],
    ['el domingo del finde que viene', monday, ['2026-06-21']],
    ['el sábado del finde que viene', monday, ['2026-06-20']],
    ['el finde del 21 de junio', monday, ['2026-06-20→2026-06-21']],
    ['el fin de semana del 19 de junio', monday, ['2026-06-20→2026-06-21']],
    [
      'los dos últimos fines de semana de junio',
      monday,
      ['2026-06-20→2026-06-21', '2026-06-27→2026-06-28'],
    ],
    ['el primer finde de agosto, el 1 y el 2', monday, ['2026-08-01→2026-08-02']],
  ])('reads "%s" written on %s', (phrase, today, options) => {
    expect(answer(phrase, today)).toEqual(understood(options));
  });

  it('answers "past" for the first weekends of a month when they are over', () => {
    const phrase = 'los dos primeros fines de semana de junio';

    expect(answer(phrase)).toEqual(nothing(`past «${phrase}»`));
  });

  it.each([
    ['los fines de semana del 20 al 31 de junio', 'los fines de semana del 20 al 31 de junio'],
    ['el primer finde de agosto, el 2 y el 3', 'el primer finde de agosto, el 2 y el 3'],
  ])('answers "mismatch" for "%s"', (phrase, fragment) => {
    expect(answer(phrase)).toEqual(nothing(`mismatch «${fragment}»`));
  });
});

describe('calendar: the hour and its half of the day (R10, R28)', () => {
  it.each([
    ['Friday at 12pm', '2026-06-19 12:00'],
    ['Friday at 12am', '2026-06-19 00:00'],
    ['el viernes a las 0', '2026-06-19 00:00'],
    ['merienda el sábado a las 8', '2026-06-20 20:00'],
    ['merienda el sábado a las 3', '2026-06-20 03:00|15:00'],
    ['comida el sábado a las 4', '2026-06-20 16:00'],
    ['comida el sábado a las 5', '2026-06-20 05:00|17:00'],
  ])('reads "%s" as %s', (phrase, option) => {
    expect(answer(phrase)).toEqual(understood([option]));
  });
});

describe('calendar: a range of times (R28, R29)', () => {
  it.each([
    ['el viernes de 10 a 00:00', '2026-06-19 22:00–00:00+1'],
    ['el viernes de 5 de la tarde a 7', '2026-06-19 17:00–19:00'],
    ['el viernes de 10 a 2 de la tarde', '2026-06-19 10:00–14:00'],
    ['el viernes de 22 a 3 de la madrugada', '2026-06-19 22:00–03:00+1'],
    ['el sábado de 9 a 23', '2026-06-20 09:00–23:00|21:00–23:00'],
    ['el domingo de 12 a 2', '2026-06-21 12:00–14:00'],
    ['el sábado de 12:00 a 02:00', '2026-06-20 12:00–02:00+1'],
  ])('reads "%s" as %s', (phrase, option) => {
    expect(answer(phrase)).toEqual(understood([option]));
  });

  it.each([
    ['el viernes de 10:00 a 09:00', 'de 10:00 a 09:00'],
    ['el viernes de 22 a 25', 'de 22 a 25'],
  ])('keeps the day of "%s" and reports the times, which are no range', (phrase, fragment) => {
    expect(answer(phrase)).toEqual({
      options: ['2026-06-19'],
      notices: [`timeUnclear «${fragment}» 2026-06-19`],
    });
  });
});

describe('calendar: what is said once for several days (R13, R24)', () => {
  it.each([
    ['el jueves 31 o el viernes 1 de enero', monday, ['2026-12-31', '2027-01-01']],
    ['el lunes 2 o el martes 3 de marzo', '2026-01-12', ['2026-03-02', '2026-03-03']],
    [
      'del 3 de agosto al 7 o del 10 al 14',
      monday,
      ['2026-08-03→2026-08-07', '2026-08-10→2026-08-14'],
    ],
    [
      'del 3 al 7 de agosto o del 10 al 14 de septiembre',
      monday,
      ['2026-08-03→2026-08-07', '2026-09-10→2026-09-14'],
    ],
    ['el 20 de julio o del 28 de julio al 3', monday, ['2026-07-20', '2026-07-28→2026-08-03']],
    ['el sábado o el 5 de julio', monday, ['2026-06-20', '2026-07-05']],
    ['el viernes a las 20:00 o el sábado', monday, ['2026-06-19 20:00', '2026-06-20']],
    ['el 23 o el miércoles de la semana que viene', monday, ['2026-06-23', '2026-06-24']],
  ])('reads "%s" written on %s', (phrase, today, options) => {
    expect(answer(phrase, today)).toEqual(understood(options));
  });

  it('gives the year said after the last day to the days before it', () => {
    expect(answer('el 3 y el 5 de julio de 2027')).toEqual(
      nothing('horizon «el 3»', 'horizon «el 5 de julio de 2027»'),
    );
  });

  it('keeps the day whose weekday fits when the day after it does not exist', () => {
    expect(answer('el lunes 29 o el miércoles 31 de junio')).toEqual({
      options: ['2026-06-29'],
      notices: ['mismatch «el miércoles 31 de junio»'],
    });
  });
});

describe('calendar: a bare weekday added to other days (R5)', () => {
  it.each([
    ['o el sábado', ['2026-06-20']],
    ['del 6 al 20 de julio y también el sábado', ['2026-07-06→2026-07-20', '2026-06-20']],
    ['del 6 al 10 de julio y también el sábado', ['2026-07-06→2026-07-10', '2026-07-11']],
  ])('reads "%s"', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it.each([
    ['el 31 de junio y también el sábado', 'el 31 de junio'],
    ['el viernes 31 de junio o el sábado', 'el viernes 31 de junio'],
  ])('reads the coming one in "%s", after a day that does not exist', (phrase, fragment) => {
    expect(answer(phrase)).toEqual({
      options: ['2026-06-20'],
      notices: [`mismatch «${fragment}»`],
    });
  });
});

describe('calendar: the order of the options', () => {
  it.each([
    ['el viernes a las 21:00 o a las 19:00', ['2026-06-19 21:00', '2026-06-19 19:00']],
    ['el viernes a las 9 o a las 8', ['2026-06-19 09:00|21:00', '2026-06-19 08:00|20:00']],
    [
      'el viernes de 21:00 a 22:00 o de 19:00 a 20:00',
      ['2026-06-19 21:00–22:00', '2026-06-19 19:00–20:00'],
    ],
    ['el viernes a las 20:00 o el viernes todo el día', ['2026-06-19 20:00']],
    ['el 20 de julio o del 6 al 10 de julio', ['2026-07-20', '2026-07-06→2026-07-10']],
    ['del 6 al 10 de julio o el 1 de julio', ['2026-07-06→2026-07-10', '2026-07-01']],
    [
      'del 6 al 10 de julio o del 6 al 8 de julio',
      ['2026-07-06→2026-07-10', '2026-07-06→2026-07-08'],
    ],
  ])('lists the options of "%s" in the order the phrase says them', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });
});

describe('known', () => {
  it.each([[0], [''], [false]])('answers the value it is given when there is one: %j', (value) => {
    expect(known(value)).toBe(value);
  });

  it.each([[null], [undefined]])('throws a programming error for %s', (missing) => {
    expect(() => known(missing)).toThrow(
      new TypeError('The date reader counted on a value that is missing'),
    );
  });
});

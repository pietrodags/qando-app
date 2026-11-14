import { describe, expect, it } from 'vitest';
import { readDates, type DatesRead, type ReadNotice, type ReadOption } from './index.js';

// Every phrase is written on Monday 15 June 2026, in a browser of Spain unless the test says so.
const today = '2026-06-15';
const read = (text: string, region = 'ES'): DatesRead => readDates(text, { today, region });

const day = (date: string): ReadOption => ({ dates: { kind: 'single', date }, time: null });

/** An answer with nothing to tell the organizer but its options. */
const understood = (options: ReadOption[]): DatesRead => ({
  options,
  questions: [],
  notices: [],
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
          time: { kind: 'question', question: 0 },
        },
      ],
      questions: [{ fragment: 'a las 8', dates: ['2026-06-19'], morning, afternoon }],
      notices: [],
    });
  });

  it('asks once about a time said for several days, and once per distinct time', () => {
    expect(
      read('el viernes a las 8 o el sábado a las 8').questions.map(({ fragment }) => fragment),
    ).toEqual(['a las 8']);
    expect(read('el viernes a las 8 o a las 9').questions.map(({ fragment }) => fragment)).toEqual([
      'a las 8',
      'a las 9',
    ]);
  });
});

describe('readDates: what was not understood', () => {
  it('answers no options and one notice, "unclear", for a phrase that says no date', () => {
    expect(read('cuando podáis')).toEqual({
      options: [],
      questions: [],
      notices: [{ kind: 'unclear' }],
    });
  });

  it('keeps what it understood and names the fragment it did not', () => {
    expect(read('sabado o domingo y traed bebida')).toEqual({
      options: [day('2026-06-20'), day('2026-06-21')],
      questions: [],
      notices: [{ kind: 'unclear', fragment: 'traed bebida' }],
    });
  });

  it('answers "mismatch" for a date that does not exist', () => {
    expect(read('el 31 de junio')).toEqual({
      options: [],
      questions: [],
      notices: [{ kind: 'mismatch', fragment: 'el 31 de junio' }],
    });
  });

  it('answers "past" for a day before today, and keeps the days to come', () => {
    expect(read('mañana o ayer')).toEqual({
      options: [day('2026-06-16')],
      questions: [],
      notices: [{ kind: 'past', fragment: 'ayer' }],
    });
  });

  it('answers "horizon" for a day more than twelve months away', () => {
    expect(read('el 20 de diciembre de 2027')).toEqual({
      options: [],
      questions: [],
      notices: [{ kind: 'horizon', fragment: 'el 20 de diciembre de 2027' }],
    });
  });

  it('answers "tooMany" for a phrase that says more than sixty options', () => {
    expect(read('todos los días hasta diciembre')).toEqual({
      options: [],
      questions: [],
      notices: [{ kind: 'tooMany' }],
    });
  });

  it('answers "timeUnclear" for a vague time: the day is kept, with no time', () => {
    expect(read('el viernes por la tarde')).toEqual({
      options: [day('2026-06-19')],
      questions: [],
      notices: [{ kind: 'timeUnclear', fragment: 'por la tarde', dates: ['2026-06-19'] }],
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
      questions: [],
      notices: [{ kind: 'tooLate', fragment: 'de 22 a 8', dates: ['2026-06-19'] }],
    });
  });

  it('gives one notice for each fragment it did not understand', () => {
    const answer = read('el viernes por la tarde y el sábado de 22 a 8');

    expect(answer.notices).toEqual([
      { kind: 'timeUnclear', fragment: 'por la tarde', dates: ['2026-06-19'] },
      { kind: 'tooLate', fragment: 'de 22 a 8', dates: ['2026-06-20'] },
    ]);
  });

  it('keeps the day and its time when a number that is no hour is listed after the time', () => {
    const eight: DatesRead['questions'] = [
      {
        fragment: 'a las 8',
        dates: ['2026-06-19'],
        morning: { kind: 'single', at: '08:00' },
        afternoon: { kind: 'single', at: '20:00' },
      },
    ];

    expect(read('el viernes a las 8 o 30')).toEqual({
      options: [
        {
          dates: { kind: 'single', date: '2026-06-19' },
          time: { kind: 'question', question: 0 },
        },
      ],
      questions: eight,
      notices: [{ kind: 'unclear', fragment: '30' }],
    });
    expect(read('Friday at 8 or 30 pm')).toMatchObject({
      options: [{ dates: { kind: 'single', date: '2026-06-19' } }],
      questions: [{ fragment: 'at 8' }],
      notices: [{ kind: 'unclear', fragment: '30 pm' }],
    });
    expect(read('el viernes a las 2:030')).toMatchObject({
      options: [{ dates: { kind: 'single', date: '2026-06-19' } }],
      questions: [{ fragment: 'a las 2' }],
      notices: [{ kind: 'unclear', fragment: '030' }],
    });
  });

  it('never reads as a day a number that is no hour listed after a time', () => {
    const at20 = (date: string): ReadOption => ({
      dates: { kind: 'single', date },
      time: { kind: 'single', at: '20:00' },
    });

    expect(read('los días 3 a las 20:00, 10 a las 20:00, 27')).toEqual({
      options: [at20('2026-07-03'), at20('2026-07-10')],
      questions: [],
      notices: [{ kind: 'unclear', fragment: '27' }],
    });
    expect(read('el viernes a las 20:00 o 30, y el sábado')).toEqual({
      options: [at20('2026-06-19'), day('2026-06-20')],
      questions: [],
      notices: [{ kind: 'unclear', fragment: '30' }],
    });
  });

  it('still reads as a day a number said as one after a time', () => {
    expect(read('el viernes a las 20:00 o el 30').options).toEqual([
      { dates: { kind: 'single', date: '2026-06-19' }, time: { kind: 'single', at: '20:00' } },
      day('2026-06-30'),
    ]);
    expect(read('el viernes a las 20:00 o 30 de julio').options).toEqual([
      { dates: { kind: 'single', date: '2026-06-19' }, time: { kind: 'single', at: '20:00' } },
      day('2026-07-30'),
    ]);
    expect(read('los días 3 a las 20:00, 10 y 27')).toEqual(
      understood([
        { dates: { kind: 'single', date: '2026-07-03' }, time: { kind: 'single', at: '20:00' } },
        day('2026-07-10'),
        day('2026-06-27'),
      ]),
    );
  });

  it('still reads a range of days listed after a time, though its first word could start a time', () => {
    const friday: ReadOption = {
      dates: { kind: 'single', date: '2026-06-19' },
      time: { kind: 'single', at: '20:00' },
    };

    expect(read('el viernes a las 20:00 o de lunes a miércoles')).toEqual(
      understood([
        friday,
        { dates: { kind: 'range', start: '2026-06-22', end: '2026-06-24' }, time: null },
      ]),
    );
    expect(read('Friday at 8pm or from July 3 to July 7')).toEqual(
      understood([
        friday,
        { dates: { kind: 'range', start: '2026-07-03', end: '2026-07-07' }, time: null },
      ]),
    );
  });

  it('reads no hour in a word one letter away from a number', () => {
    expect(read('we might meet on Friday')).toEqual(understood([day('2026-06-19')]));
  });
});

describe('readDates: any phrase', () => {
  // Words of the three languages and numbers that are an hour, a day, a year or none of them.
  const parts = [
    ...['el', 'los días', 'el viernes', 'sábado', 'dissabte', 'on Friday', 'next week', 'mañana'],
    ...['a las', 'a les', 'at', 'de', 'from', 'entre', 'hasta', 'to', 'menos', 'y', 'o', 'or', ','],
    ...['por la tarde', 'pm', 'am', 'h', 'de la noche', 'medianoche', 'noon', 'y media', 'quarts'],
    ...['de julio', 'de 2027', 'del año que viene', 'finde', 'todos los lunes', 'próximos', 'no'],
    ...['0', '1', '8', '12', '20:00', '2:030', '24', '25', '27', '30', '31', '45', '60', '99'],
    ...['1999', '2026', '4294967296', '7/4', '31/6', '-', ':', '.', 'º', 'might', 'xyz', ''],
  ];
  /** The same phrases on every run: a generator of numbers that only looks random. */
  const sequence = (seed: number) => () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };

  it('is answered, never refused with an error', () => {
    const next = sequence(2026);
    const pick = () => parts[Math.floor(next() * parts.length)] ?? '';
    const phrases = Array.from({ length: 1500 }, () =>
      Array.from({ length: 1 + Math.floor(next() * 7) }, pick).join(' '),
    );

    const refused = phrases.filter((phrase) => {
      try {
        read(phrase);
        return false;
      } catch {
        return true;
      }
    });

    expect(refused).toEqual([]);
  });
});

/** An answer that marks nothing: only its notice. */
const nothing = (notice: ReadNotice): DatesRead => ({
  options: [],
  questions: [],
  notices: [notice],
});

describe('readDates: dates that cannot be marked', () => {
  it('answers "mismatch" for a range of days written backwards', () => {
    const backwards = 'del 20 de agosto de 2026 al 10 de agosto de 2026';

    expect(read(backwards)).toEqual(nothing({ kind: 'mismatch', fragment: backwards }));
  });

  it('answers "mismatch" for a weekday pattern over a period written backwards', () => {
    const backwards = 'todos los lunes del 20 de agosto de 2026 al 10 de agosto de 2026';

    expect(read(backwards)).toEqual(nothing({ kind: 'mismatch', fragment: backwards }));
  });

  it('answers "past" for a month of a past year, alone or with a weekday pattern', () => {
    expect(read('julio de 2025')).toEqual(nothing({ kind: 'past', fragment: 'julio de 2025' }));
    expect(read('todos los lunes de julio de 2025')).toEqual(
      nothing({ kind: 'past', fragment: 'todos los lunes de julio de 2025' }),
    );
  });

  it('keeps the days to come when a month of a past year is said with them', () => {
    expect(read('agosto de 2025 o mañana')).toEqual({
      options: [day('2026-06-16')],
      questions: [],
      notices: [{ kind: 'past', fragment: 'agosto de 2025' }],
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
      expect(read(zero)).toEqual(nothing({ kind: 'mismatch', fragment: zero }));
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
    expect(answer.notices).toEqual([{ kind: 'horizon', fragment: many }]);
  });

  it('keeps the weekdays within twelve months of a count that goes beyond them, with "horizon"', () => {
    const many = 'los próximos 4294967296 lunes';
    const answer = read(many);

    expect(answer.options).toHaveLength(52);
    expect(answer.options.at(-1)).toEqual(day('2027-06-14'));
    expect(answer.notices).toEqual([{ kind: 'horizon', fragment: many }]);
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

  it('answers "horizon" for a day any number of days or weeks away beyond the twelve months', () => {
    for (const far of ['dentro de 400 días', 'dentro de 4294967296 días', 'in 4294967296 weeks']) {
      expect(read(far)).toEqual(nothing({ kind: 'horizon', fragment: far }));
    }
  });

  it('cuts at the last day of the twelve months a range of days that goes beyond it, with "horizon"', () => {
    const crossing = 'del 10 al 20 de junio de 2027';

    expect(read(crossing)).toEqual({
      options: [{ dates: { kind: 'range', start: '2027-06-10', end: '2027-06-15' }, time: null }],
      questions: [],
      notices: [{ kind: 'horizon', fragment: crossing }],
    });
    expect(read('del 15 al 20 de junio de 2027').options).toEqual([day('2027-06-15')]);
    expect(read('del 16 al 20 de junio de 2027')).toEqual(
      nothing({ kind: 'horizon', fragment: 'del 16 al 20 de junio de 2027' }),
    );
  });

  it('keeps the days within the twelve months of a range with a time that goes beyond them', () => {
    const crossing = 'del 13 al 20 de junio de 2027 a las 20:00';
    const answer = read(crossing);

    expect(answer.options).toEqual(
      ['2027-06-13', '2027-06-14', '2027-06-15'].map((date) => ({
        dates: { kind: 'single', date },
        time: { kind: 'single', at: '20:00' },
      })),
    );
    expect(answer.notices).toEqual([{ kind: 'horizon', fragment: crossing }]);
  });

  it('gives what is left of a range under way, with its year written or not', () => {
    const left: ReadOption[] = [
      { dates: { kind: 'range', start: '2026-06-17', end: '2026-06-20' }, time: null },
    ];
    const on = (text: string) => readDates(text, { today: '2026-06-17', region: 'ES' });

    expect(on('del 10 al 20 de junio')).toEqual(understood(left));
    expect(on('del 10 al 20 de junio de 2026')).toEqual(understood(left));
    expect(on('del 10/6/2026 al 20/6/2026')).toEqual(understood(left));
    expect(on('del 10 al 16 de junio de 2026')).toEqual(
      nothing({ kind: 'past', fragment: 'del 10 al 16 de junio de 2026' }),
    );
  });

  it('answers "past" or "horizon" for a date in figures of any year, however far', () => {
    expect(read('20/7/2026').options).toEqual([day('2026-07-20')]);
    expect(read('20/7/26').options).toEqual([day('2026-07-20')]);
    for (const past of ['20/7/2025', '20/7/2000', '20/7/1999', '20/7/123']) {
      expect(read(past)).toEqual(nothing({ kind: 'past', fragment: past }));
    }
    for (const far of ['20/7/2027', '20/7/2100', '20/7/2101', '20/7/9998']) {
      expect(read(far)).toEqual(nothing({ kind: 'horizon', fragment: far }));
    }
  });

  it('keeps the days within the twelve months of a pattern up to a year however far', () => {
    const endless = 'todos los lunes del 1/7/2026 al 31/12/9998';
    const answer = read(endless);

    expect(answer.options).toHaveLength(50);
    expect(answer.options[0]).toEqual(day('2026-07-06'));
    expect(answer.options.at(-1)).toEqual(day('2027-06-14'));
    expect(answer.notices).toEqual([{ kind: 'horizon', fragment: endless }]);
  });

  it('gives what is left of the week of a day when that week is under way', () => {
    const on = (text: string) => readDates(text, { today: '2026-06-17', region: 'ES' });

    expect(on('la semana del 17 de junio')).toEqual(
      understood([
        { dates: { kind: 'range', start: '2026-06-17', end: '2026-06-21' }, time: null },
      ]),
    );
    expect(on('la semana del 22 de junio')).toEqual(
      understood([
        { dates: { kind: 'range', start: '2026-06-22', end: '2026-06-28' }, time: null },
      ]),
    );
  });

  it('answers "past" for the week of a day when that week is over, never a range backwards', () => {
    for (const over of ['la semana del 1 de junio de 2026', 'la semana del 14 de junio de 2026']) {
      expect(read(over)).toEqual(nothing({ kind: 'past', fragment: over }));
    }
    expect(read('la semana del 8 de junio de 2026 o el viernes')).toEqual({
      ...nothing({ kind: 'past', fragment: 'la semana del 8 de junio de 2026' }),
      options: [day('2026-06-19')],
    });
  });

  it('counts the coming days before leaving some out: the sixty options are of what is left', () => {
    const workdays = read('los próximos 70 días menos los fines de semana');

    expect(workdays.options).toHaveLength(50);
    expect(workdays.options.at(-1)).toEqual(day('2026-08-24'));
    expect(workdays.notices).toEqual([]);
    expect(read('los próximos 70 días menos el 20 de junio')).toEqual(nothing({ kind: 'tooMany' }));
  });

  it('answers "horizon" for midnight at the end of the last day of the twelve months', () => {
    expect(read('el 15 de junio de 2027').options).toEqual([day('2027-06-15')]);
    for (const midnight of [
      'el 15 de junio de 2027 a medianoche',
      'el 15 de junio de 2027 de medianoche a 2',
    ]) {
      expect(read(midnight)).toEqual(nothing({ kind: 'horizon', fragment: midnight }));
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

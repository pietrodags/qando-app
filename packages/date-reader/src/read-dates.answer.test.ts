// The shape of the answer: options in the phrase's order, one question per distinct bare hour
// with its dates, one notice per fragment with the dates it speaks of.
import { describe, expect, it } from 'vitest';
import { readDates, type ClockTime, type ReadNotice, type ReadOption } from './index.js';

// Every phrase is written on Monday 15 June 2026, in a browser of Spain.
const today = '2026-06-15';

const clock = (time: ClockTime): string =>
  time.kind === 'single' ? time.at : `${time.start}–${time.end}${time.nextDay ? '+1' : ''}`;
/** An option as text: "2026-06-19", "2026-07-06→2026-07-10", "2026-06-19 20:00", "2026-06-19 ?0" (the time is asked by the first question). */
const optionText = ({ dates, time }: ReadOption): string =>
  (dates.kind === 'single' ? dates.date : `${dates.start}→${dates.end}`) +
  (time ? ` ${time.kind === 'question' ? `?${time.question}` : clock(time)}` : '');
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

interface Answer {
  options: string[];
  /** Each question as "«fragment» dates: morning|afternoon". */
  asked: string[];
  notices: string[];
}
const answer = (text: string, now?: string): Answer => {
  const { options, questions, notices } = readDates(text, {
    today,
    region: 'ES',
    ...(now && { now }),
  });
  return {
    options: options.map(optionText),
    asked: questions.map(
      ({ fragment, dates, morning, afternoon }) =>
        `«${fragment}» ${dates.join(',')}: ${clock(morning)}|${clock(afternoon)}`,
    ),
    notices: notices.map(noticeText),
  };
};
const marked = (...options: string[]): Answer => ({ options, asked: [], notices: [] });

describe('the options of the answer', () => {
  it('lists them in the order the phrase says them, not by day', () => {
    expect(answer('el sábado y el viernes')).toEqual(marked('2026-06-20', '2026-06-19'));
  });

  it('lists the times of a day in the order said', () => {
    expect(answer('el viernes a las 21:00 o a las 19:00')).toEqual(
      marked('2026-06-19 21:00', '2026-06-19 19:00'),
    );
  });

  it('lists a day said twice once, where it was first said', () => {
    expect(answer('el sábado, el viernes y el sábado')).toEqual(marked('2026-06-20', '2026-06-19'));
  });

  it('drops the whole day of a date that also gets a time later in the phrase', () => {
    expect(answer('el viernes por la tarde y el viernes a las 21:00')).toEqual({
      options: ['2026-06-19 21:00'],
      asked: [],
      notices: ['timeUnclear «por la tarde» 2026-06-19'],
    });
  });

  it('drops the whole day of a date that got a time earlier in the phrase', () => {
    expect(answer('el viernes a las 21:00 y el viernes')).toEqual(marked('2026-06-19 21:00'));
  });

  it('drops the whole day of a date whose time is asked', () => {
    expect(answer('el viernes a las 8 y el viernes')).toEqual({
      options: ['2026-06-19 ?0'],
      asked: ['«a las 8» 2026-06-19: 08:00|20:00'],
      notices: [],
    });
  });

  it('keeps a range of days beside a time on one of its days', () => {
    expect(answer('el 5 de agosto a las 15:00 y del 3 al 7 de agosto')).toEqual(
      marked('2026-08-05 15:00', '2026-08-03→2026-08-07'),
    );
  });

  it('keeps the whole day of the other dates', () => {
    expect(answer('el viernes a las 21:00 y el sábado')).toEqual(
      marked('2026-06-19 21:00', '2026-06-20'),
    );
  });
});

describe('the questions of the answer', () => {
  it('asks a bare hour with its date and both readings, and the option points at it', () => {
    expect(readDates('el viernes a las 8', { today, region: 'ES' })).toEqual({
      options: [
        { dates: { kind: 'single', date: '2026-06-19' }, time: { kind: 'question', question: 0 } },
      ],
      questions: [
        {
          fragment: 'a las 8',
          dates: ['2026-06-19'],
          morning: { kind: 'single', at: '08:00' },
          afternoon: { kind: 'single', at: '20:00' },
        },
      ],
      notices: [],
    });
  });

  it('asks the same hour said of two days once, with both dates', () => {
    expect(answer('el viernes a las 8 y el sábado a las 8')).toEqual({
      options: ['2026-06-19 ?0', '2026-06-20 ?0'],
      asked: ['«a las 8» 2026-06-19,2026-06-20: 08:00|20:00'],
      notices: [],
    });
  });

  it('asks an hour said once for several days once, with every date', () => {
    expect(answer('el viernes o el sábado a las 8')).toEqual({
      options: ['2026-06-19 ?0', '2026-06-20 ?0'],
      asked: ['«a las 8» 2026-06-19,2026-06-20: 08:00|20:00'],
      notices: [],
    });
  });

  it('names a date once in a question asked twice of it', () => {
    expect(answer('el viernes a las 8 y el viernes a las 8')).toEqual({
      options: ['2026-06-19 ?0'],
      asked: ['«a las 8» 2026-06-19: 08:00|20:00'],
      notices: [],
    });
  });

  it('asks each distinct hour, in the order the phrase says them', () => {
    expect(answer('el sábado a las 9 y el viernes a las 8')).toEqual({
      options: ['2026-06-20 ?0', '2026-06-19 ?1'],
      asked: ['«a las 9» 2026-06-20: 09:00|21:00', '«a las 8» 2026-06-19: 08:00|20:00'],
      notices: [],
    });
  });

  it('asks a range of bare hours as one question', () => {
    expect(answer('el sábado de 5 a 7')).toEqual({
      options: ['2026-06-20 ?0'],
      asked: ['«de 5 a 7» 2026-06-20: 05:00–07:00|17:00–19:00'],
      notices: [],
    });
  });

  it('asks two hours of one day as two questions', () => {
    expect(answer('el viernes a las 8 o a las 9')).toEqual({
      options: ['2026-06-19 ?0', '2026-06-19 ?1'],
      asked: ['«a las 8» 2026-06-19: 08:00|20:00', '«a las 9» 2026-06-19: 09:00|21:00'],
      notices: [],
    });
  });

  it('asks two ranges said with the same words as two questions, each with its option', () => {
    expect(answer('el viernes desde las 5 hasta las 7 o las 8')).toEqual({
      options: ['2026-06-19 ?0', '2026-06-19 ?1'],
      asked: [
        '«desde las 5 hasta las 7 o las 8» 2026-06-19: 05:00–07:00|17:00–19:00',
        '«desde las 5 hasta las 7 o las 8» 2026-06-19: 05:00–08:00|17:00–20:00',
      ],
      notices: [],
    });
  });

  it('asks nothing of an hour whose dates are all beyond the twelve months', () => {
    expect(answer('el 1 de julio de 2027 a las 8')).toEqual({
      options: [],
      asked: [],
      notices: ['horizon «el 1 de julio de 2027 a las 8»'],
    });
  });
});

describe('the notices about days that are marked', () => {
  it('tells of a vague time with its words and its date', () => {
    expect(answer('el viernes por la tarde')).toEqual({
      options: ['2026-06-19'],
      asked: [],
      notices: ['timeUnclear «por la tarde» 2026-06-19'],
    });
  });

  it('tells of an hour that does not exist with its words and its date', () => {
    expect(answer('el viernes a las 25')).toEqual({
      options: ['2026-06-19'],
      asked: [],
      notices: ['timeUnclear «a las 25» 2026-06-19'],
    });
  });

  it('tells of a time not understood beside one that is, on the day marked with it', () => {
    expect(answer('el viernes a las 25 o a las 21:00')).toEqual({
      options: ['2026-06-19 21:00'],
      asked: [],
      notices: ['timeUnclear «a las 25» 2026-06-19'],
    });
  });

  it('tells of a time range that ends too late with its words and its date', () => {
    expect(answer('el viernes de 22 a 8')).toEqual({
      options: ['2026-06-19'],
      asked: [],
      notices: ['tooLate «de 22 a 8» 2026-06-19'],
    });
  });

  it('gives one notice for a time said once of several days, with every date', () => {
    expect(answer('el viernes y el sábado de 22 a 8')).toEqual({
      options: ['2026-06-19', '2026-06-20'],
      asked: [],
      notices: ['tooLate «de 22 a 8» 2026-06-19,2026-06-20'],
    });
  });

  it('names a range of days by its first day', () => {
    expect(answer('del 3 al 7 de agosto por la tarde')).toEqual({
      options: ['2026-08-03→2026-08-07'],
      asked: [],
      notices: ['timeUnclear «por la tarde» 2026-08-03'],
    });
  });

  it('gives one notice per vague time', () => {
    expect(answer('el viernes por la tarde temprano').notices).toEqual([
      'timeUnclear «por la tarde» 2026-06-19',
      'timeUnclear «temprano» 2026-06-19',
    ]);
  });

  it('tells of a vague time said of no day with no date', () => {
    expect(readDates('el viernes a las 21:00 y por la tarde', { today, region: 'ES' })).toEqual({
      options: [
        { dates: { kind: 'single', date: '2026-06-19' }, time: { kind: 'single', at: '21:00' } },
      ],
      questions: [],
      notices: [{ kind: 'timeUnclear', fragment: 'por la tarde', dates: [] }],
    });
  });
});

describe('a vague word with no half of the day, said before its date', () => {
  it('is not told when the time of that date is understood', () => {
    expect(answer('temprano, el sábado por la mañana a las 8')).toEqual(marked('2026-06-20 08:00'));
  });

  it('is told when that date has no time', () => {
    expect(answer('temprano, el sábado')).toEqual({
      options: ['2026-06-20'],
      asked: [],
      notices: ['timeUnclear «temprano» 2026-06-20'],
    });
  });
});

describe('midnight said of a day', () => {
  it('is the next day at 00:00, told with the day marked and that a weekday was written', () => {
    expect(readDates('el sábado a medianoche', { today, region: 'ES' })).toEqual({
      options: [
        { dates: { kind: 'single', date: '2026-06-21' }, time: { kind: 'single', at: '00:00' } },
      ],
      questions: [],
      notices: [
        {
          kind: 'dayNotWritten',
          fragment: 'a medianoche',
          dates: ['2026-06-21'],
          written: 'weekday',
        },
      ],
    });
  });

  it.each([
    ['el 20 de junio a medianoche', 'dayNotWritten «a medianoche» 2026-06-21 date'],
    ['el sábado 20 de junio a medianoche', 'dayNotWritten «a medianoche» 2026-06-21 date'],
    ['mañana a medianoche', 'dayNotWritten «a medianoche» 2026-06-17 weekday'],
    ['el finde a medianoche', 'dayNotWritten «a medianoche» 2026-06-21,2026-06-22 weekday'],
    [
      'del 3 al 5 de julio a medianoche',
      'dayNotWritten «a medianoche» 2026-07-04,2026-07-05,2026-07-06 date',
    ],
    [
      'los sábados de julio a medianoche',
      'dayNotWritten «a medianoche» 2026-07-05,2026-07-12,2026-07-19,2026-07-26 weekday',
    ],
    [
      'el 20 y el 27 de junio a medianoche',
      'dayNotWritten «a medianoche» 2026-06-21,2026-06-28 date',
    ],
  ])('"%s" tells the days marked and whether a date was written', (text, notice) => {
    expect(answer(text).notices).toEqual([notice]);
  });

  it('gives a notice for the days written as weekdays and another for those written as dates', () => {
    expect(answer('el sábado y el 27 de junio a medianoche')).toEqual({
      options: ['2026-06-21 00:00', '2026-06-28 00:00'],
      asked: [],
      notices: [
        'dayNotWritten «a medianoche» 2026-06-21 weekday',
        'dayNotWritten «a medianoche» 2026-06-28 date',
      ],
    });
  });

  it('is told of a time range that starts at midnight', () => {
    expect(answer('el sábado de medianoche a 2')).toEqual({
      options: ['2026-06-21 00:00–02:00'],
      asked: [],
      notices: ['dayNotWritten «de medianoche a 2» 2026-06-21 weekday'],
    });
  });

  it('is not told of a time range that ends after midnight: it stays on its day', () => {
    expect(answer('el viernes de 22 a 3')).toEqual(marked('2026-06-19 22:00–03:00+1'));
  });

  it('is not told of 00:00 written as a time of the day', () => {
    expect(answer('el viernes a las 00:00')).toEqual(marked('2026-06-19 00:00'));
  });

  it('is not told of a midnight that falls beyond the twelve months', () => {
    expect(answer('el 15 de junio de 2027 a medianoche')).toEqual({
      options: [],
      asked: [],
      notices: ['horizon «el 15 de junio de 2027 a medianoche»'],
    });
  });
});

describe('the notices about what gave no option', () => {
  it.each([
    ['el viernes y el 31 de junio', ['2026-06-19'], 'mismatch «el 31 de junio»'],
    ['el 1 de junio y el 20 de junio', ['2026-06-20'], 'past «el 1 de junio»'],
    ['el 20 de junio y el 1 de julio de 2027', ['2026-06-20'], 'horizon «el 1 de julio de 2027»'],
    ['el viernes xyzzy', ['2026-06-19'], 'unclear «xyzzy»'],
  ])('"%s" marks the rest and names the fragment', (text, options, notice) => {
    expect(answer(text)).toEqual({ options, asked: [], notices: [notice] });
  });

  it('gives every notice that applies, in the order of the phrase', () => {
    expect(answer('el viernes por la tarde, el sábado a medianoche y el 31 de junio')).toEqual({
      options: ['2026-06-19', '2026-06-21 00:00'],
      asked: [],
      notices: [
        'timeUnclear «por la tarde» 2026-06-19',
        'dayNotWritten «a medianoche» 2026-06-21 weekday',
        'mismatch «el 31 de junio»',
      ],
    });
  });

  it('places what was not understood between two dates between their notices', () => {
    expect(
      answer('el 31 de junio, xyzzy, el viernes por la tarde y el 1 de junio').notices,
    ).toEqual([
      'mismatch «el 31 de junio»',
      'unclear «xyzzy»',
      'timeUnclear «por la tarde» 2026-06-19',
      'past «el 1 de junio»',
    ]);
  });

  it('tells of a date already past and of one beyond the twelve months, each with its fragment', () => {
    expect(answer('el 1 de junio, el 20 de junio y el 1 de julio de 2027')).toEqual({
      options: ['2026-06-20'],
      asked: [],
      notices: ['past «el 1 de junio»', 'horizon «el 1 de julio de 2027»'],
    });
  });

  it('tells nothing of the vague time of a date that gave no option: its notice names it whole', () => {
    expect(answer('el viernes y el 31 de junio por la tarde').notices).toEqual([
      'mismatch «el 31 de junio por la tarde»',
    ]);
  });
});

describe('a phrase that marks nothing', () => {
  it('gives one notice with no fragment when nothing is understood', () => {
    expect(readDates('algún día', { today, region: 'ES' })).toEqual({
      options: [],
      questions: [],
      notices: [{ kind: 'unclear' }],
    });
  });

  it('gives one notice with no fragment when it does not speak of dates', () => {
    expect(readDates('traed bebida', { today, region: 'ES' })).toEqual({
      options: [],
      questions: [],
      notices: [{ kind: 'mismatch' }],
    });
  });

  it.each([
    ['el 31 de junio', 'mismatch «el 31 de junio»'],
    ['el 1 de junio', 'past «el 1 de junio»'],
    ['el 1 de julio de 2027', 'horizon «el 1 de julio de 2027»'],
  ])('"%s" names the fragment that does not fit', (text, notice) => {
    expect(answer(text)).toEqual({ options: [], asked: [], notices: [notice] });
  });

  it('names every fragment that gave no option, each with its notice', () => {
    expect(answer('el 31 de junio y el 1 de junio')).toEqual({
      options: [],
      asked: [],
      notices: ['mismatch «el 31 de junio»', 'past «el 1 de junio»'],
    });
  });

  it('gives the notice of too many options alone, with no option and no question', () => {
    expect(
      readDates('todos los días hasta el 31 de diciembre a las 8', { today, region: 'ES' }),
    ).toEqual({ options: [], questions: [], notices: [{ kind: 'tooMany' }] });
  });
});

describe('the times of today already past', () => {
  it('are not marked and are told with their fragment', () => {
    expect(answer('hoy a las 14:30', '15:00')).toEqual({
      options: [],
      asked: [],
      notices: ['past «a las 14:30»'],
    });
  });

  it('leave the later times of today marked', () => {
    expect(answer('hoy a las 14:30 o a las 18:00', '15:00')).toEqual({
      options: ['2026-06-15 18:00'],
      asked: [],
      notices: ['past «a las 14:30»'],
    });
  });

  it('do not include the time it is now', () => {
    expect(answer('hoy a las 15:00', '15:00')).toEqual(marked('2026-06-15 15:00'));
  });

  it('are none when the time of day is not given', () => {
    expect(answer('hoy a las 14:30')).toEqual(marked('2026-06-15 14:30'));
  });

  it('are none on other days', () => {
    expect(answer('mañana a las 14:30', '15:00')).toEqual(marked('2026-06-16 14:30'));
  });

  it('include a time range that has already started', () => {
    expect(answer('hoy de 14:00 a 16:00', '15:00')).toEqual({
      options: [],
      asked: [],
      notices: ['past «de 14:00 a 16:00»'],
    });
  });

  it('take the afternoon of a bare hour whose morning has passed, with no question', () => {
    expect(answer('hoy a las 8', '10:00')).toEqual(marked('2026-06-15 20:00'));
  });

  it('take the afternoon of a range of bare hours whose morning has passed', () => {
    expect(answer('hoy de 5 a 7', '10:00')).toEqual(marked('2026-06-15 17:00–19:00'));
  });

  it('still ask a bare hour whose two readings are to come', () => {
    expect(answer('hoy a las 8', '07:59')).toEqual({
      options: ['2026-06-15 ?0'],
      asked: ['«a las 8» 2026-06-15: 08:00|20:00'],
      notices: [],
    });
  });

  it('tell of a bare hour whose two readings have passed', () => {
    expect(answer('hoy a las 8', '20:01')).toEqual({
      options: [],
      asked: [],
      notices: ['past «a las 8»'],
    });
  });

  it('ask a bare hour only of the days it can still be either reading', () => {
    expect(answer('hoy y mañana a las 8', '10:00')).toEqual({
      options: ['2026-06-15 20:00', '2026-06-16 ?0'],
      asked: ['«a las 8» 2026-06-16: 08:00|20:00'],
      notices: [],
    });
  });

  it('leave today marked as a whole day, whatever the time', () => {
    expect(answer('hoy', '23:59')).toEqual(marked('2026-06-15'));
  });

  it('leave midnight of today, which is tomorrow, marked', () => {
    expect(answer('hoy a medianoche', '23:00')).toEqual({
      options: ['2026-06-16 00:00'],
      asked: [],
      notices: ['dayNotWritten «a medianoche» 2026-06-16 weekday'],
    });
  });

  it('keep today as a whole day when its only time is not understood', () => {
    expect(answer('hoy a las 25', '10:00')).toEqual({
      options: ['2026-06-15'],
      asked: [],
      notices: ['timeUnclear «a las 25» 2026-06-15'],
    });
  });

  it('do not turn today into a whole day when a time understood has passed', () => {
    expect(answer('hoy a las 25 o a las 14:30', '15:00')).toEqual({
      options: [],
      asked: [],
      notices: ['timeUnclear «a las 25»', 'past «a las 14:30»'],
    });
  });
});

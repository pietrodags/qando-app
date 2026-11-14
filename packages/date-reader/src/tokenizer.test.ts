import { describe, expect, it } from 'vitest';
import {
  readDates,
  type ClockTime,
  type DatesRead,
  type ReadNotice,
  type ReadOption,
} from './index.js';
import { tokenize } from './tokenizer.js';

// Every phrase is written on Monday 15 June 2026, in a browser of Spain unless the test says so.
const today = '2026-06-15';

const clock = (time: ClockTime): string =>
  time.kind === 'single' ? time.at : `${time.start}–${time.end}${time.nextDay ? '+1' : ''}`;
/** An option as text: "2026-06-19", "2026-07-06→2026-07-10", "2026-06-19 20:00", "2026-06-19 08:00|20:00" (the two readings of a time that is asked). */
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
const answer = (text: string, region = 'ES'): Answer => {
  const { options, questions, notices } = readDates(text, { today, region });
  return {
    options: options.map((option) => optionText(option, questions)),
    notices: notices.map(noticeText),
  };
};
/** An answer with nothing to tell the organizer but its options. */
const understood = (options: string[]): Answer => ({ options, notices: [] });

describe('tokenizer: the words a mistyped word may be', () => {
  it('reads a mistyped word as the first word one letter away, never as a short word, a noise word or a word that only looks mistyped', () => {
    // "vienes" looks like "viernes" and is listed as no typo of it
    expect(answer('el sábado, vienes')).toEqual({
      options: ['2026-06-20'],
      notices: ['unclear «vienes»'],
    });
    // "luna" is one letter away from "lun", a word too short to be mistyped
    expect(answer('el sábado, luna llena')).toEqual({
      options: ['2026-06-20'],
      notices: ['unclear «luna llena»'],
    });
    // "siesta" is one letter away from "fiesta", a noise word
    expect(answer('el sábado, siesta')).toEqual({
      options: ['2026-06-20'],
      notices: ['unclear «siesta»'],
    });
    // "lunse" is one letter away from "lunes", a word of five letters
    expect(answer('el lunse a las 20:30')).toEqual(understood(['2026-06-22 20:30']));
    // "anter" is one letter away from "after" and from "antes": words that say an hour come first
    expect(answer('Saturday anter 8')).toEqual(understood(['2026-06-20 08:00|20:00']));
  });
});

describe('tokenizer: chat shorthand', () => {
  it('reads "xa" as "para", a word that is not reported', () => {
    expect(answer('el sábado a las 9 xa cenar')).toEqual(understood(['2026-06-20 21:00']));
  });

  it('reads "tb" as "también", which adds a day', () => {
    expect(answer('el sábado, tb el domingo')).toEqual(understood(['2026-06-20', '2026-06-21']));
  });
});

describe('tokenizer: mistyped words', () => {
  it.each([
    ['a letter changed', 'viernez a las 20:30'],
    ['a letter missing', 'vierne a las 20:30'],
    ['a letter added', 'vierrnes a las 20:30'],
    ['two neighbours swapped', 'vienres a las 20:30'],
  ])('reads a word with %s as the word it is one letter away from', (_typo, phrase) => {
    expect(answer(phrase)).toEqual(understood(['2026-06-19 20:30']));
  });

  it.each([
    ['a mistyped word of five letters', 'el lunse a las 20:30'],
    ['a word of four letters that is missing one', 'lnes a las 20:30'],
  ])('reads %s', (_case, phrase) => {
    expect(answer(phrase)).toEqual(understood(['2026-06-22 20:30']));
  });

  it.each([
    ['two letters away from a month', 'el sábado, macro fiesta', 'macro'],
    ['two letters away from a weekday', 'el sábado, mareas vivas', 'mareas vivas'],
    ['one letter away from a short word', 'el sábado, luna llena', 'luna llena'],
    ['one letter away from a noise word', 'el sábado, siesta', 'siesta'],
  ])('does not guess a word %s: it is reported', (_case, phrase, fragment) => {
    expect(answer(phrase)).toEqual({
      options: ['2026-06-20'],
      notices: [`unclear «${fragment}»`],
    });
  });

  it('guesses no mistyped word inside a condition that is not about dates', () => {
    expect(answer('el sábado si tenemos el equipo entero')).toEqual(understood(['2026-06-20']));
  });

  it('marks the token read from a mistyped word', () => {
    expect(tokenize('vienres')).toEqual([{ t: 'WD', v: 5, fuzzy: true, start: 0, end: 7 }]);
  });
});

describe('tokenizer: dates in figures (R34)', () => {
  it.each([
    ['12/25', 'ES', '2026-12-25'],
    ['5/12', 'ES', '2026-12-05'],
    ['12/5', 'US', '2026-12-05'],
    ['13/12', 'US', '2026-12-13'],
  ])('reads "%s" written in a browser of region %s as %s', (phrase, region, date) => {
    expect(answer(phrase, region)).toEqual(understood([date]));
  });

  it.each([
    ['a year of four figures', '1/6/2027', '2027-06-01'],
    ['a year of two figures', '20/6/26', '2026-06-20'],
    ['a day and a month joined by a dot', 'el 25.12', '2026-12-25'],
  ])('reads a date written with %s', (_case, phrase, date) => {
    expect(answer(phrase)).toEqual(understood([date]));
  });

  it('answers "horizon" for a date whose written year is beyond the twelve months', () => {
    expect(answer('7/8/2027')).toEqual({
      options: [],
      notices: ['horizon «7/8/2027»'],
    });
  });

  it.each([
    ['el 20 de julio de 2000', 'past'],
    ['el 20 de julio de 2100', 'horizon'],
  ] as const)('reads the year of "%s" and answers "%s"', (phrase, notice) => {
    expect(answer(phrase)).toEqual({ options: [], notices: [`${notice} «${phrase}»`] });
  });

  it('reads no year in a number after a date that is beyond the year 2100', () => {
    expect(answer('el 20 de julio de 2101')).toEqual({
      options: ['2026-07-20'],
      notices: ['unclear «2101»'],
    });
  });

  it('keeps the order of the region for figures that are a date in no order', () => {
    expect(tokenize('13/14', 'ES')).toEqual([{ t: 'DMY', day: 13, month: 14, start: 0, end: 5 }]);
    expect(tokenize('13/14', 'US')).toEqual([{ t: 'DMY', day: 14, month: 13, start: 0, end: 5 }]);
  });
});

describe('tokenizer: clock times in figures', () => {
  it.each([
    ['el viernes a las 20.30', '2026-06-19 20:30', []],
    ['el viernes a las 20.59', '2026-06-19 20:45', []],
    [
      'el viernes a las 24.00',
      '2026-06-20 00:00',
      ['dayNotWritten «a las 24.00» 2026-06-20 weekday'],
    ],
    ['el viernes a las 08', '2026-06-19 08:00', []],
  ])('reads "%s" as %s', (phrase, option, notices) => {
    expect(answer(phrase)).toEqual({ options: [option], notices });
  });

  it.each([
    ['el viernes a las 25:00', 'a las 25:00'],
    ['el viernes a las 20:75', 'a las 20:75'],
  ])('keeps the day of "%s" and reports the time, which no clock shows', (phrase, fragment) => {
    expect(answer(phrase)).toEqual({
      options: ['2026-06-19'],
      notices: [`timeUnclear «${fragment}» 2026-06-19`],
    });
  });

  it('marks a leading zero only on figures that have one', () => {
    expect(tokenize('08 8 0')).toEqual([
      { t: 'NUM', v: 8, zero: true, start: 0, end: 2 },
      { t: 'NUM', v: 8, zero: false, start: 3, end: 4 },
      { t: 'NUM', v: 0, zero: false, start: 5, end: 6 },
    ]);
  });
});

describe('tokenizer: English ordinals in words', () => {
  it.each([
    ['twenty-first of July', ['2026-07-21']],
    ['thirty first of July', ['2026-07-31']],
    ['twenty-ninth of July', ['2026-07-29']],
    ['July twenty', ['2026-07-20']],
    ['June twenty - 8pm', ['2026-06-20 20:00']],
    ['June thirty or first of July', ['2026-06-30', '2026-07-01']],
    ['first - fifth of July', ['2026-07-01→2026-07-05']],
    ['from June thirty to third of July', ['2026-06-30→2026-07-03']],
  ])('reads "%s"', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('makes one ordinal of the tens and the ordinal after them, from the first letter to the last', () => {
    expect(tokenize('twenty-first of July')).toEqual([
      { t: 'ORD', v: 21, start: 0, end: 12 },
      { t: 'DE', start: 13, end: 15 },
      { t: 'MO', v: 7, start: 16, end: 20 },
    ]);
  });
});

describe('tokenizer: "los dos" said as an aside (R24)', () => {
  it.each([
    ['el 3 o el 10 de julio, viernes los dos', ['2026-07-03', '2026-07-10']],
    ['el 3 o el 10 de julio, los dos y también el 17', ['2026-07-03', '2026-07-10', '2026-07-17']],
    [
      'el 3 o el 10 de julio, viernes los dos o el sábado 11',
      ['2026-07-03', '2026-07-10', '2026-07-11'],
    ],
    [
      'el 3 o el 10 de julio, viernes los dos - a las 20:00',
      ['2026-07-03 20:00', '2026-07-10 20:00'],
    ],
    [
      'el 3 o el 10 de julio, los dos a partir de las 8 de la tarde',
      ['2026-07-03 20:00', '2026-07-10 20:00'],
    ],
    ['el 3 o el 10 de julio, los dos desde 20:00', ['2026-07-03 20:00', '2026-07-10 20:00']],
    ['el 3 o el 10 de julio, los dos al mediodía', ['2026-07-03 12:00', '2026-07-10 12:00']],
    [
      'el 3 o el 10 de julio, los dos aproximadamente a las 20:00',
      ['2026-07-03 20:00', '2026-07-10 20:00'],
    ],
    ['el 3 o el 10 de julio, los dos todo el día', ['2026-07-03', '2026-07-10']],
    ['el 3 o el 10 de julio, los dos nos va bien', ['2026-07-03', '2026-07-10']],
    [
      'el 3 o el 10 de juliol, divendres els dos, a les 8 del vespre',
      ['2026-07-03 20:00', '2026-07-10 20:00'],
    ],
  ])('never reads day 2 in "%s"', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('never reads day 2 before a vague time, which is reported', () => {
    expect(answer('el 3 o el 10 de julio, los dos por la tarde')).toEqual({
      options: ['2026-07-03', '2026-07-10'],
      notices: ['timeUnclear «por la tarde» 2026-07-10'],
    });
  });

  it('never reads day 2 before a word nothing reads, which is reported alone', () => {
    expect(answer('el 3 o el 10 de julio, los dos perfectos')).toEqual({
      options: ['2026-07-03', '2026-07-10'],
      notices: ['unclear «perfectos»'],
    });
  });

  it.each([
    ['los 2, 3 y 4 de julio', ['2026-07-02', '2026-07-03', '2026-07-04']],
    ['los 3, 4 y 5 de julio', ['2026-07-03', '2026-07-04', '2026-07-05']],
    ['los dos primeros lunes de julio', ['2026-07-06', '2026-07-13']],
  ])('still reads the number of "%s"', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });
});

describe('tokenizer: "al mediodía" beside a bare hour (R28)', () => {
  it.each([
    ['el domingo al mediodía a las 2', '2026-06-21 14:00'],
    ['el domingo al mediodía, a las 2', '2026-06-21 14:00'],
    ['el domingo a las 2 al mediodía', '2026-06-21 14:00'],
    ['el domingo a las 4 al mediodía', '2026-06-21 16:00'],
    ['dissabte a la 1 al migdia', '2026-06-20 13:00'],
  ])('reads the hour of "%s" as an afternoon one', (phrase, option) => {
    expect(answer(phrase)).toEqual(understood([option]));
  });

  it.each([
    ['al mediodía el sábado', ['2026-06-20 12:00']],
    ['mañana al mediodía', ['2026-06-16 12:00']],
    ['el jueves al mediodía', ['2026-06-18 12:00']],
    ['el 3 al mediodía', ['2026-07-03 12:00']],
    ['quedamos al mediodía el 3 o el 4 de julio', ['2026-07-03 12:00', '2026-07-04 12:00']],
  ])('reads noon in "%s"', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('keeps an English noon apart from the hours listed after it, which are asked', () => {
    expect(answer('Saturday at noon, at 2 or at 4')).toEqual(
      understood(['2026-06-20 12:00', '2026-06-20 02:00|14:00', '2026-06-20 04:00|16:00']),
    );
  });
});

describe('tokenizer: a chat "x" (R5)', () => {
  it('reads "x la tarda" as one vague time, from the x to its last word', () => {
    expect(tokenize('aquest dissabte x la tarda')).toEqual([
      { t: 'THIS', start: 0, end: 6 },
      { t: 'WD', v: 6, start: 7, end: 15 },
      { t: 'VAGUE', half: 'PM', start: 16, end: 26 },
    ]);
  });

  it('reads no Wednesday in an "x" before an article and a part of the day', () => {
    expect(answer('dissabte x la nit')).toEqual({
      options: ['2026-06-20'],
      notices: ['timeUnclear «nit»'],
    });
  });

  it('reads a Wednesday in an "x" that a part of the day does not follow right away', () => {
    expect(answer('el x que viene por la tarde')).toEqual({
      options: ['2026-06-17'],
      notices: ['timeUnclear «por la tarde» 2026-06-17'],
    });
  });

  it('reads a Wednesday in an "x" before an article and a word that is no part of the day', () => {
    expect(answer('el x en casa de Marta a las 20:00')).toEqual({
      options: ['2026-06-17 20:00'],
      notices: ['unclear «casa de Marta»'],
    });
  });
});

describe('tokenizer: "anytime" (R10)', () => {
  it.each([
    ['Saturday anytime after 8', '2026-06-20 08:00|20:00'],
    ['Saturday anytime from 8', '2026-06-20 08:00|20:00'],
    ['Saturday anytime from 20:00', '2026-06-20 20:00'],
    ['el sábado a cualquier hora desde 20:00', '2026-06-20 20:00'],
  ])('reads the hour after it in "%s"', (phrase, option) => {
    expect(answer(phrase)).toEqual(understood([option]));
  });

  it.each(['Saturday anytime', 'Saturday anytime, 20 June'])(
    'reports it when no hour follows: "%s"',
    (phrase) => {
      expect(answer(phrase)).toEqual({
        options: ['2026-06-20'],
        notices: ['unclear «anytime»'],
      });
    },
  );
  it.each(['Saturday anytime', 'Saturday anytime, 20 June', 'Saturday anytime from Friday'])(
    'makes it a word nothing reads when no hour follows: "%s"',
    (phrase) => {
      expect(tokenize(phrase).slice(0, 2)).toEqual([
        { t: 'WD', v: 6, start: 0, end: 8 },
        { t: 'UNK', start: 9, end: 16 },
      ]);
    },
  );

  it('keeps it as a word of its own kind before the hour it speaks of', () => {
    expect(tokenize('Saturday anytime after 8')).toEqual([
      { t: 'WD', v: 6, start: 0, end: 8 },
      { t: 'ANYTIME', start: 9, end: 16 },
      { t: 'ATFROM', start: 17, end: 22 },
      { t: 'NUM', v: 8, zero: false, start: 23, end: 24 },
    ]);
  });
});

describe("tokenizer: a game's number (R27)", () => {
  it.each([
    ['fútbol 7 de 10 a 12 el sábado', ['2026-06-20 10:00–12:00']],
    ['fútbol 7 en julio', ['2026-07-01→2026-07-31']],
    ['5-a-side on Tuesday at 7pm', ['2026-06-16 19:00']],
  ])('reads no day in the number of "%s"', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it.each([
    ['fútbol 7 de julio', ['2026-07-07']],
    ['football 7 July', ['2026-07-07']],
    ['fútbol sábado a las 20:00', ['2026-06-20 20:00']],
  ])('still reads the date after the game in "%s"', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('keeps a day number that "side" follows with no "a" between them', () => {
    expect(answer('Saturday 20 south side park at 7pm')).toEqual({
      options: ['2026-06-20 19:00'],
      notices: ['unclear «south side park»'],
    });
  });
});

describe('tokenizer: Catalan two-letter weekdays (R5)', () => {
  it.each([
    ['dm o dimecres', ['2026-06-16', '2026-06-17']],
    ['dimarts o dc', ['2026-06-16', '2026-06-17']],
    ['dm i dc', ['2026-06-16', '2026-06-17']],
    ['dm, dc', ['2026-06-16', '2026-06-17']],
    ['dl fins dv', ['2026-06-22→2026-06-26']],
    ['de dl a dv', ['2026-06-22→2026-06-26']],
    ['dl-dv', ['2026-06-22→2026-06-26']],
    ['dm o el dc a les 8 del vespre', ['2026-06-16 20:00', '2026-06-17 20:00']],
  ])('reads the weekdays joined in "%s"', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it.each([
    ['dv 26', ['2026-06-26'], []],
    ['dg 18:00', ['2026-06-21 18:00'], []],
    ['ds les 22', ['2026-06-20 22:00'], []],
    ['dv desde las 20:00', ['2026-06-19 20:00'], []],
    ['dv mañana a las 10', ['2026-06-19 10:00'], []],
    ['dv migdia', ['2026-06-19 12:00'], []],
    ['dv mitjanit', ['2026-06-20 00:00'], ['dayNotWritten «mitjanit» 2026-06-20 weekday']],
    ['dv que ve', ['2026-06-19'], []],
    ['dj de la setmana que ve', ['2026-06-25'], []],
    ["dj d'aquesta setmana", ['2026-06-18'], []],
    ['dj de la propera setmana', ['2026-06-25'], []],
    ['el primer dj de juliol', ['2026-07-02'], []],
    ["el primer dv de l'agost", ['2026-08-07'], []],
  ])('reads the weekday followed by its day, time or week in "%s"', (phrase, options, notices) => {
    expect(answer(phrase)).toEqual({ options, notices });
  });

  it('reads the weekday followed by a vague time, which is reported', () => {
    expect(answer('dv tarda')).toEqual({
      options: ['2026-06-19'],
      notices: ['timeUnclear «tarda» 2026-06-19'],
    });
  });

  it.each([
    [
      'tots els dies de la setmana que ve menys dj',
      ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-26', '2026-06-27', '2026-06-28'],
    ],
    [
      'cada dv del mes que ve',
      ['2026-07-03', '2026-07-10', '2026-07-17', '2026-07-24', '2026-07-31'],
    ],
    ['aquest dv', ['2026-06-19']],
    ['el proper dv', ['2026-06-19']],
    ['hasta dv', ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19']],
    ['abans de dv', ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18']],
  ])('reads the weekday after a word that asks for one in "%s"', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('reads the weekday after "des de", which is reported', () => {
    expect(answer('des de dv')).toEqual({
      options: ['2026-06-19'],
      notices: ['unclear «des de»'],
    });
  });

  it.each([
    [
      'sessió de dj els dissabtes de juliol',
      ['2026-07-04', '2026-07-11', '2026-07-18', '2026-07-25'],
    ],
    ['fiesta con dj de moda el sábado', ['2026-06-20']],
  ])('reads no weekday in the letters of "%s"', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it.each([
    ["dl 7 al 10 d'agost", ['2026-08-07→2026-08-10']],
    ["dl 7 a 10 d'agost", ['2026-08-07→2026-08-10']],
    ["dl 7 fins al 10 d'agost", ['2026-08-07→2026-08-10']],
    ["dl 7-10 d'agost", ['2026-08-07→2026-08-10']],
    ['el finde dl 10 d oct', ['2026-10-10→2026-10-11']],
    ['la setmana dl 6 de juliol', ['2026-07-06→2026-07-12']],
  ])('reads "dl" as "del" in "%s"', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it.each([
    ['dl 22 a les 20:00', ['2026-06-22 20:00']],
    ['dl 15:00-17:00', ['2026-06-22 15:00–17:00']],
    ['dl 6 de juliol', ['2026-07-06']],
  ])('reads "dl" as Monday in "%s"', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });
});

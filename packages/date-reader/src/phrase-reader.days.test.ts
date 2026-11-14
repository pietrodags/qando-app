import { describe, expect, it } from 'vitest';
import {
  readDates,
  type ClockTime,
  type DatesRead,
  type ReadNotice,
  type ReadOption,
} from './index.js';
import { read } from './phrase-reader.js';

// Every phrase is written on Monday 15 June 2026, in a browser of Spain.
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

/** What the reader answers, with the options, the notices and the times it asks about as text. */
interface Answer {
  options: string[];
  notices: string[];
  asked: string[];
}
const answer = (text: string): Answer => {
  const { options, questions, notices } = readDates(text, { today, region: 'ES' });
  return {
    options: options.map((option) => optionText(option, questions)),
    notices: notices.map(noticeText),
    asked: questions.map((question) => question.fragment),
  };
};
/** An answer with nothing to tell the organizer but its options. */
const understood = (options: string[]): Answer => ({ options, notices: [], asked: [] });
/** An answer that tells the organizer its notices and asks nothing. */
const reported = (options: string[], notices: string[]): Answer => ({
  options,
  notices,
  asked: [],
});

describe('readDates: words that speak of dates inside a condition', () => {
  it.each([
    ['el viernes si la semana va bien', 'semana'],
    ['el viernes si no hay que esperar semanas', 'semanas'],
    ['el viernes si llegamos a fin de mes', 'mes'],
    ['el viernes, si quedamos cada mes', 'cada mes'],
    ['el viernes si cobramos la quincena', 'quincena'],
    ['el viernes si no es el siguiente al que viene', 'siguiente al que viene'],
  ])('reports the word that no rule reads and keeps the date: %s', (phrase, fragment) => {
    expect(answer(phrase)).toEqual(reported(['2026-06-19'], [`unclear «${fragment}»`]));
  });

  it('ignores a condition that says nothing about dates', () => {
    expect(answer('el viernes si arreglan la furgoneta')).toEqual(understood(['2026-06-19']));
  });
});

describe('readDates: the fragments reported as not understood', () => {
  it.each([
    ['el viernes a casa de Marta', 'casa de Marta'],
    ['el viernes al cine', 'cine'],
    ['Friday in town', 'town'],
    ['el viernes en el piso 3º', 'piso 3'],
    ['el viernes un par de horas', 'un par'],
  ])('leaves the small words at its edges out of the fragment: %s', (phrase, fragment) => {
    expect(answer(phrase)).toEqual(reported(['2026-06-19'], [`unclear «${fragment}»`]));
  });

  it.each([['cuando queráis, pero mejor el viernes'], ['todo el día el viernes']])(
    'reports nothing when only small words stand before the date: %s',
    (phrase) => {
      expect(answer(phrase)).toEqual(understood(['2026-06-19']));
    },
  );

  it.each([['Marta y Juan'], ['pizza o sushi'], ['si os va bien'], ['hola, qué tal']])(
    "answers 'mismatch' for a phrase with nothing about when: %s",
    (phrase) => {
      expect(answer(phrase)).toEqual(reported([], ['mismatch']));
    },
  );

  it("answers 'unclear' for a phrase that speaks of when without saying it", () => {
    expect(answer('cuando haga bueno')).toEqual(reported([], ['unclear']));
  });

  it.each([
    ['el domingo xa el vermut'],
    ['el domingo pa el vermut'],
    ['el domingo para el pica-pica'],
    ['el domingo para ver a los abuelos'],
    ['el domingo para la boda del primo'],
    ['el domingo para ir al cine'],
    ['Sunday for a walk in the park'],
  ])('takes the words after "para", "pa", "xa", "for" as the name of the plan: %s', (phrase) => {
    expect(answer(phrase)).toEqual(understood(['2026-06-21']));
  });
});

describe('readDates: a "no" in the phrase', () => {
  it('reads the date after a "no" that opens the phrase, and reports the "no"', () => {
    expect(answer('no, el sábado a las 20:00')).toEqual(
      reported(['2026-06-20 20:00'], ['unclear «no»']),
    );
  });

  it('reads the date when a "no" after a pause corrects no date', () => {
    expect(answer('el viernes en casa de Marta, no en la mía')).toEqual(
      reported(['2026-06-19'], ['unclear «casa de Marta»', 'unclear «no en la mía»']),
    );
  });

  it('reads the date before a "no" that closes the phrase', () => {
    expect(answer('el viernes a las 20:00, ¿no?')).toEqual(
      reported(['2026-06-19 20:00'], ['unclear «no»']),
    );
  });

  it('answers a phrase that corrects itself as not understood, with no fragment', () => {
    expect(answer('  el sábado a las 10, no, a las 11 ')).toEqual(reported([], ['unclear']));
  });
});

describe('readDates: a weekday that names the day said before it', () => {
  it.each([
    ['mañana, que es martes, a las 20:00', ['2026-06-16 20:00']],
    ['la setmana que ve, dimarts, o sea el martes', ['2026-06-23']],
    ['el dimarts de la setmana que ve, o sea el martes, a les 20:00', ['2026-06-23 20:00']],
    ['el 3 de julio, viernes, o el 11 de julio, sábado', ['2026-07-03', '2026-07-11']],
    ['el sábado 27 de junio o el 3 de julio, viernes', ['2026-06-27', '2026-07-03']],
  ])('reads one day when a weekday says it again: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('reads a weekday after "o sea" that opens the phrase as a day', () => {
    expect(answer('o sea el viernes a las 20:00')).toEqual(understood(['2026-06-19 20:00']));
  });

  it.each([
    ['mañana, que es miércoles', [], ['mismatch «mañana miércoles»']],
    [
      'el 7 de julio, que es lunes, o el 8 de julio',
      ['2026-07-08'],
      ['mismatch «el 7 de julio lunes»'],
    ],
    [
      'el 3 o el 10 de julio, sábado los dos, o el 12 de julio',
      ['2026-07-12'],
      ['mismatch «el 3»', 'mismatch «el 10 de julio sábado los dos»'],
    ],
  ])(
    "answers 'mismatch' for the day whose weekday said again is another: %s",
    (phrase, options, notices) => {
      expect(answer(phrase)).toEqual(reported(options, notices));
    },
  );

  it('keeps the vague time of a day when a weekday says the day again', () => {
    expect(answer('el 3 de julio por la tarde, viernes')).toEqual(
      reported(['2026-07-03'], ['timeUnclear «por la tarde» 2026-07-03']),
    );
  });

  it.each([
    ['el 3 de julio, el primer viernes de agosto', ['2026-07-03', '2026-08-07']],
    ['el jueves 18 a las 20:00, el viernes a las 21:00', ['2026-06-18 20:00', '2026-06-19 21:00']],
    ['el 3 de julio, el viernes o el sábado', ['2026-07-03', '2026-06-19', '2026-06-20']],
  ])('reads a weekday that names no day before it as an option: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });
});

describe('readDates: a weekend said again', () => {
  it.each([
    [
      'los dos primeros findes de julio, todo el finde',
      ['2026-07-04→2026-07-05', '2026-07-11→2026-07-12'],
    ],
    [
      'el primer finde de agosto, el 1 y el 2 a las 12:00',
      ['2026-08-01 12:00', '2026-08-02 12:00'],
    ],
    [
      'el primer finde de agosto, el 1 y el 2, o el sábado 8 de agosto',
      ['2026-08-01→2026-08-02', '2026-08-08'],
    ],
  ])('reads one weekend when it is said again, whole or by its days: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('gives the weekend the vague time said when it is said again', () => {
    expect(answer('el finde del 18 y 19 de julio, todo el finde por la tarde')).toEqual(
      reported(['2026-07-18→2026-07-19'], ['timeUnclear «por la tarde» 2026-07-18']),
    );
  });

  it("answers 'mismatch' for a weekend whose days said again are others", () => {
    expect(answer('el primer finde de agosto, el 8 y el 9, o el 15 de agosto')).toEqual(
      reported(['2026-08-15'], ['mismatch «el primer finde de agosto el 8 el 9»']),
    );
  });

  it.each([
    ['el primer finde de julio o este finde', ['2026-07-04→2026-07-05', '2026-06-20→2026-06-21']],
    ['el primer finde de julio, el 18 de julio', ['2026-07-04→2026-07-05', '2026-07-18']],
    ['este finde, el 27', ['2026-06-20→2026-06-21', '2026-06-27']],
  ])('reads another weekend or a day that is not its own as an option: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('reads "todo el fin de semana" after a day as this weekend', () => {
    expect(answer('el viernes por la tarde o todo el fin de semana')).toEqual(
      reported(['2026-06-19', '2026-06-20→2026-06-21'], ['timeUnclear «por la tarde» 2026-06-19']),
    );
  });
});

describe('readDates: a weekend beside days', () => {
  it.each([
    ['escapada de fin de semana el sábado 18 de julio', ['2026-07-18']],
    ['weekend trip from Friday 17 July to Sunday', ['2026-07-17→2026-07-19']],
  ])('reads only the dates when the weekend names the kind of plan: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it.each([
    ['este finde. El lunes también', ['2026-06-20→2026-06-21', '2026-06-22']],
    ['este finde, el lunes también', ['2026-06-20→2026-06-21', '2026-06-22']],
    [
      'el primer finde de julio. También me va bien el 18 de julio',
      ['2026-07-04→2026-07-05', '2026-07-18'],
    ],
    [
      'el 18 de julio. También me va bien el primer finde de agosto',
      ['2026-07-18', '2026-08-01→2026-08-02'],
    ],
    [
      'los fines de semana de julio o este sábado',
      [
        '2026-07-04→2026-07-05',
        '2026-07-11→2026-07-12',
        '2026-07-18→2026-07-19',
        '2026-07-25→2026-07-26',
        '2026-06-20',
      ],
    ],
  ])('keeps the weekend as an option beside a day that is not its own: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('reads the Saturday or the Sunday of the weekend named after them, each with its time', () => {
    expect(answer('el sábado o el domingo del primer finde de julio a las 12:00')).toEqual(
      understood(['2026-07-04 12:00', '2026-07-05 12:00']),
    );
  });

  it('reads "el siguiente sábado" after a day that is no weekend as the coming Saturday', () => {
    expect(answer('el viernes o el siguiente sábado')).toEqual(
      understood(['2026-06-19', '2026-06-20']),
    );
  });

  it('reads the day listed after the Saturday and Sunday of the following weekend as its own', () => {
    expect(answer('este finde, o si no el siguiente sábado o domingo, o el lunes 29')).toEqual(
      understood(['2026-06-20→2026-06-21', '2026-06-27', '2026-06-28', '2026-06-29']),
    );
  });
});

describe('readDates: weeks and working days', () => {
  it('reads a weekday joined by "o" to a week as a day of its own', () => {
    expect(answer('la semana que viene o el sábado')).toEqual(
      understood(['2026-06-22→2026-06-28', '2026-06-20']),
    );
  });

  it.each([
    [
      'la semana que viene entre semana',
      ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26'],
    ],
    [
      'del 6 al 12 de julio entre semana',
      ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'],
    ],
    [
      'hasta el domingo entre semana',
      ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'],
    ],
    [
      'este mes entre semana',
      [
        '2026-06-15',
        '2026-06-16',
        '2026-06-17',
        '2026-06-18',
        '2026-06-19',
        '2026-06-22',
        '2026-06-23',
        '2026-06-24',
        '2026-06-25',
        '2026-06-26',
        '2026-06-29',
        '2026-06-30',
      ],
    ],
  ])('keeps Monday to Friday of a stretch said "entre semana": %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('keeps Monday to Friday of the days of a vague time said "entre semana"', () => {
    expect(answer('cualquier tarde de la semana que viene entre semana')).toEqual(
      reported(
        ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26'],
        ['timeUnclear «tarde» 2026-06-22,2026-06-23,2026-06-24,2026-06-25,2026-06-26'],
      ),
    );
  });
});

describe('readDates: holidays beside dates', () => {
  it('reads only the date when a holiday beside it names the plan', () => {
    expect(answer('el 26 de diciembre, por Navidad')).toEqual(understood(['2026-12-26']));
  });

  it('keeps the time of the date when the holiday that names the plan says a vague one', () => {
    expect(
      answer('el sábado 19 de diciembre a las 21:00 para la cena de Navidad por la noche'),
    ).toEqual(understood(['2026-12-19 21:00']));
  });

  it('reads a day with no time after a day with its time as a whole day', () => {
    expect(answer('el viernes a las 20:00 o el sábado')).toEqual(
      understood(['2026-06-19 20:00', '2026-06-20']),
    );
  });

  it.each([
    ['San Juan, que es el martes 24, o el sábado 27', 'San Juan, que es el martes 24'],
    [
      'el San Juan que viene, que es el martes 24, o el sábado 27',
      'el San Juan que viene, que es el martes 24',
    ],
  ])(
    "answers 'mismatch' for the date a holiday is said to be when its weekday is another: %s",
    (phrase, fragment) => {
      expect(answer(phrase)).toEqual(reported(['2026-06-27'], [`mismatch «${fragment}»`]));
    },
  );

  it('reads a fixed holiday said to be a "puente" and reports the "puente"', () => {
    expect(answer('Todos los Santos, que es puente')).toEqual(
      reported(['2026-11-01'], ['unclear «puente»']),
    );
  });
});

describe('readDates: movable holidays', () => {
  it.each([
    ['Thanksgiving day November 26', ['2026-11-26']],
    ['Thanksgiving week from November 23 to November 27', ['2026-11-23→2026-11-27']],
    ['Easter weekend from April 2 to April 5', ['2027-04-02→2027-04-05']],
    ['el fin de semana del puente del 5 al 8 de diciembre', ['2026-12-05→2026-12-08']],
    ['el sábado carnaval', ['2026-06-20']],
  ])('reads only the dates when a movable holiday names the plan: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it.each([
    ['el puente del 12 de octubre'],
    ['el domingo de Pascua'],
    ['el fin de semana del puente'],
    ['el finde de la Semana Santa'],
  ])("answers 'unclear' for what a movable holiday names: %s", (phrase) => {
    expect(answer(phrase)).toEqual(reported([], ['unclear']));
  });

  it.each([
    ['Easter week or the 3rd of July', 'Easter week'],
    ['la semana de Pascua o el 3 de julio', 'la semana de Pascua'],
    ['vacaciones de Semana Santa o el 3 de julio', 'Semana Santa'],
  ])('reports what a movable holiday names, whole, beside a date: %s', (phrase, fragment) => {
    expect(answer(phrase)).toEqual(reported(['2026-07-03'], [`unclear «${fragment}»`]));
  });
});

describe('readDates: an hour said again, and a vague time of no date', () => {
  it('asks the half of the day of another hour said with "también"', () => {
    expect(answer('hoy a las 10 de la noche o mañana a las 9 también')).toEqual({
      ...understood(['2026-06-15 22:00', '2026-06-16 09:00|21:00']),
      asked: ['a las 9'],
    });
  });

  it('asks the half of the day of the same hour with other minutes', () => {
    expect(answer('el sábado a las 10:30 de la noche o el domingo a las 10 también')).toEqual({
      ...understood(['2026-06-20 22:30', '2026-06-21 10:00|22:00']),
      asked: ['a las 10'],
    });
  });

  it('asks the half of the day of an hour said again after both halves were said for it', () => {
    expect(
      answer(
        'el sábado a las 10 de la mañana, el domingo a las 10 de la noche y el lunes a las 10 también',
      ),
    ).toEqual({
      ...understood(['2026-06-20 10:00', '2026-06-21 22:00', '2026-06-22 10:00|22:00']),
      asked: ['a las 10'],
    });
  });

  it('reports a vague time joined to a date that has its hour', () => {
    expect(answer('el viernes a las 8 y por la tarde')).toEqual({
      ...reported(['2026-06-19 08:00|20:00'], ['timeUnclear «por la tarde»']),
      asked: ['a las 8'],
    });
  });
});

describe('readDates: numbers that are hours, days or years', () => {
  it.each([
    ['el viernes 20h', ['2026-06-19 20:00']],
    ['el sábado 9 am', ['2026-06-20 09:00']],
  ])('reads a number with its hour mark after a weekday as a time: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it.each([
    ['el viernes 8 y media', '2026-06-19 08:30|20:30', '8 y media'],
    ['dissabte 3 quarts de 9', '2026-06-20 08:45|20:45', '3 quarts de 9'],
  ])(
    'reads a number with its minutes after a weekday as a time to ask about: %s',
    (phrase, option, asked) => {
      expect(answer(phrase)).toEqual({ ...understood([option]), asked: [asked] });
    },
  );

  it.each([
    ['de julio a septiembre 2026', ['2026-07-01→2026-09-30']],
    ['de julio a septiembre de 2026', ['2026-07-01→2026-09-30']],
    [
      'todos los lunes de julio y agosto 2026',
      [
        '2026-07-06',
        '2026-07-13',
        '2026-07-20',
        '2026-07-27',
        '2026-08-03',
        '2026-08-10',
        '2026-08-17',
        '2026-08-24',
        '2026-08-31',
      ],
    ],
    ['en diciembre 2026 o enero 2027', ['2026-12-01→2026-12-31', '2027-01-01→2027-01-31']],
  ])('reads a year in figures as the year of the months before it: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('reads the weekday said before several days with the first of them', () => {
    expect(answer('los martes 30 y 7 de julio')).toEqual(understood(['2026-06-30', '2026-07-07']));
  });

  it('reads "día" between a weekday and its day number', () => {
    expect(answer('el viernes día 26')).toEqual(understood(['2026-06-26']));
  });
});

describe('readDates: ordinals as days of the month', () => {
  it.each([
    ['from the sixth until the tenth of july', ['2026-07-06→2026-07-10']],
    ['the sixth-tenth of July', ['2026-07-06→2026-07-10']],
    ['del primero al tercero de julio', ['2026-07-01→2026-07-03']],
    ['the sixth and the seventh of july', ['2026-07-06', '2026-07-07']],
    ['the sixth or the seventh of july', ['2026-07-06', '2026-07-07']],
    ['the sixth, the seventh and the eighth of july', ['2026-07-06', '2026-07-07', '2026-07-08']],
  ])('reads ordinals joined before "of" a month as days of it: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it.each([
    ['the thirtieth of july or the thirty first', ['2026-07-30', '2026-07-31']],
    ['the twenty first of august or twenty second', ['2026-08-21', '2026-08-22']],
    ['the twenty first of august and the twenty second', ['2026-08-21', '2026-08-22']],
    ['the twenty first of august, the twenty second', ['2026-08-21', '2026-08-22']],
  ])('reads an ordinal listed after a day of the month as a day: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('reads a month after a word that is no ordinal as the whole month', () => {
    expect(answer('la cena de agosto')).toEqual(understood(['2026-08-01→2026-08-31']));
  });

  it('reports "el último" listed after a day of the month', () => {
    expect(answer('el 3 de julio o el último')).toEqual(
      reported(['2026-07-03'], ['unclear «último»']),
    );
  });

  it('reports an ordinal that picks one of the options said', () => {
    expect(answer('el viernes o el sábado, el primero de ellos mejor')).toEqual(
      reported(['2026-06-19', '2026-06-20'], ['unclear «primero de ellos»']),
    );
  });

  it.each([
    ['primera opción el viernes, segunda opción el sábado', ['2026-06-19', '2026-06-20']],
    ['primero, el viernes; segundo, el sábado', ['2026-06-19', '2026-06-20']],
    ['el 3 de julio primera opción, el 10 de julio segunda opción', ['2026-07-03', '2026-07-10']],
  ])('reads no day from an ordinal that numbers the options: %s', (phrase, options) => {
    expect(answer(phrase).options).toEqual(options);
  });
});

describe('readDates: a month that frames the days after it', () => {
  it.each([
    ['in December: Saturdays 5, 12 and 19', ['2026-12-05', '2026-12-12', '2026-12-19']],
    ['opciones de julio: el 4, el 11 o el 18', ['2026-07-04', '2026-07-11', '2026-07-18']],
    [
      'in January of next year, Saturday the 9th or Saturday the 16th',
      ['2027-01-09', '2027-01-16'],
    ],
    ['en enero del año que viene el sábado 16', ['2027-01-16']],
    ['el año que viene en junio el sábado 5', ['2027-06-05']],
  ])('reads the days in the month said before them: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('puts the month of a pattern in the coming year and keeps what lies within twelve months', () => {
    expect(answer('todos los lunes de junio del año que viene')).toEqual(
      reported(
        ['2027-06-07', '2027-06-14'],
        ['horizon «todos los lunes de junio del año que viene»'],
      ),
    );
  });
});

describe('readDates: periods', () => {
  it.each([
    [
      'todos los lunes hasta el final de julio',
      [
        '2026-06-15',
        '2026-06-22',
        '2026-06-29',
        '2026-07-06',
        '2026-07-13',
        '2026-07-20',
        '2026-07-27',
      ],
    ],
    ['antes del viernes', ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18']],
    [
      'todos los días del lunes al jueves',
      ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25'],
    ],
    [
      'every day from July 6 to July 10',
      ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'],
    ],
    [
      'todos los días del 6-10 de julio',
      ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'],
    ],
    ['in June or July 4th', ['2026-06-15→2026-06-30', '2026-07-04']],
  ])('reads the days of a period from a day to another: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it.each([
    [
      "tots els dilluns del juliol a l'agost",
      [
        '2026-07-06',
        '2026-07-13',
        '2026-07-20',
        '2026-07-27',
        '2026-08-03',
        '2026-08-10',
        '2026-08-17',
        '2026-08-24',
        '2026-08-31',
      ],
    ],
    [
      'todos los lunes de julio-agosto',
      [
        '2026-07-06',
        '2026-07-13',
        '2026-07-20',
        '2026-07-27',
        '2026-08-03',
        '2026-08-10',
        '2026-08-17',
        '2026-08-24',
        '2026-08-31',
      ],
    ],
    [
      'los sábados de julio o agosto',
      [
        '2026-07-04',
        '2026-07-11',
        '2026-07-18',
        '2026-07-25',
        '2026-08-01',
        '2026-08-08',
        '2026-08-15',
        '2026-08-22',
        '2026-08-29',
      ],
    ],
  ])('reads a weekday pattern over the months said together: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it('reads the weekdays of two plans joined by "y" as two days', () => {
    expect(answer('la cena del viernes y la comida del sábado')).toEqual(
      understood(['2026-06-19', '2026-06-20']),
    );
  });

  it("answers 'horizon' for months said from one to another of a year beyond twelve months", () => {
    expect(answer('de julio a septiembre de 2027')).toEqual(
      reported([], ['horizon «de julio a septiembre de 2027»']),
    );
  });
});

describe('readDates: days counted from today', () => {
  it.each([
    ['en dos semanas', ['2026-06-29']],
    ['in two weeks', ['2026-06-29']],
    ['de aquí a dos semanas', ['2026-06-29']],
    ['dentro de una semana', ['2026-06-22']],
    ['dentro de 1 día', ['2026-06-16']],
    ['dentro de 3 días', ['2026-06-18']],
  ])('reads a count of days or weeks as the day that many from today: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it.each([
    [
      'mañana mejor, la semana pasada no pudimos',
      ['2026-06-16'],
      ['unclear «semana pasada no pudimos»'],
    ],
    ['mañana, el mes pasado fue imposible', ['2026-06-16'], ['unclear «mes pasado fue imposible»']],
    [
      'tomorrow, same place as two weeks ago',
      ['2026-06-16'],
      ['unclear «same place as two weeks ago»'],
    ],
    [
      'tomorrow, same plan as two days ago',
      ['2026-06-16'],
      ['unclear «same plan as two days ago»'],
    ],
    ['como la pasada vez, mañana a las 20:00', ['2026-06-16 20:00'], ['unclear «pasada»']],
    [
      'sábado mañana como el pasado',
      ['2026-06-20'],
      ['timeUnclear «mañana» 2026-06-20', 'unclear «pasado»'],
    ],
  ])('reports a "pasado" that is not the day after tomorrow: %s', (phrase, options, notices) => {
    expect(answer(phrase)).toEqual(reported(options, notices));
  });

  it.each([
    ['la visita el viernes y la cena el mismo día', ['2026-06-19'], ['unclear «mismo día»']],
    [
      'tenemos la casa 2 semanas en agosto',
      ['2026-08-01→2026-08-31'],
      ['unclear «tenemos la casa 2 semanas»'],
    ],
  ])('reports days or weeks that are not counted from today: %s', (phrase, options, notices) => {
    expect(answer(phrase)).toEqual(reported(options, notices));
  });
});

describe('readDates: vague parts of a month and its first weeks', () => {
  it("answers 'unclear' for a vague part of a month written with a dash", () => {
    expect(answer('mid-July')).toEqual(reported([], ['unclear']));
  });

  it('reads "late" before a weekday as a vague time of that day', () => {
    expect(answer('late Friday')).toEqual(
      reported(['2026-06-19'], ['timeUnclear «late» 2026-06-19']),
    );
  });

  it('reads a vague time said before a week as the time of that week', () => {
    expect(answer('por la tarde la semana que viene')).toEqual(
      reported(['2026-06-22→2026-06-28'], ['timeUnclear «por la tarde» 2026-06-22']),
    );
  });

  it.each([
    ['a principios de agosto o el 3 de julio', 'a principios de agosto'],
    ['al final de julio o el 3 de julio', 'al final de julio'],
    ['el final de julio o el 3 de julio', 'el final de julio'],
    ['at the beginning of August or July 3rd', 'at the beginning of August'],
  ])('reports a vague part of a month, whole, beside a date: %s', (phrase, fragment) => {
    expect(answer(phrase)).toEqual(reported(['2026-07-03'], [`unclear «${fragment}»`]));
  });

  it('reads the first four weeks of a month as one range', () => {
    expect(answer('the first four weeks of July')).toEqual(understood(['2026-07-01→2026-07-28']));
  });

  it.each([
    ['la primera semana de junio o el 20 de julio', 'la primera semana de junio'],
    ['las dos primeras semanas de junio o el 20 de julio', 'las dos primeras semanas de junio'],
  ])("answers 'past' for the first weeks of a month already gone by: %s", (phrase, fragment) => {
    expect(answer(phrase)).toEqual(reported(['2026-07-20'], [`past «${fragment}»`]));
  });

  it('reads the month and reports the words before it that name no first week', () => {
    expect(answer('alguna semana de julio')).toEqual(
      reported(['2026-07-01→2026-07-31'], ['unclear «alguna semana»']),
    );
  });

  it("answers 'unclear' for the first week of what is no month", () => {
    expect(answer('la primera semana de vacaciones')).toEqual(reported([], ['unclear']));
  });
});

describe('readDates: ordinal weekdays and weekends', () => {
  it.each([
    ['the last weekend of the month', ['2026-06-27→2026-06-28']],
    ['the 5th Friday of July', ['2026-07-31']],
    [
      'the first five Mondays of August',
      ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'],
    ],
    ['el primer y cuarto lunes de julio', ['2026-07-06', '2026-07-27']],
    ['el primer y cuarto finde de julio', ['2026-07-04→2026-07-05', '2026-07-25→2026-07-26']],
    ['the first Monday in July', ['2026-07-06']],
    ['julio: el primer sábado', ['2026-07-04']],
    [
      'el primer lunes, el segundo martes y el tercer miércoles de julio',
      ['2026-07-06', '2026-07-14', '2026-07-15'],
    ],
    ['el primer lunes o el segundo martes de julio', ['2026-07-06', '2026-07-14']],
    [
      'el primer lunes de cada mes',
      [
        '2026-07-06',
        '2026-08-03',
        '2026-09-07',
        '2026-10-05',
        '2026-11-02',
        '2026-12-07',
        '2027-01-04',
        '2027-02-01',
        '2027-03-01',
        '2027-04-05',
        '2027-05-03',
        '2027-06-07',
      ],
    ],
  ])('reads the ordinal weekdays or weekends of the months said: %s', (phrase, options) => {
    expect(answer(phrase)).toEqual(understood(options));
  });

  it.each([['the first Monday in the month'], ['el último finde'], ['last Monday']])(
    "answers 'past' for an ordinal weekday or weekend already gone by: %s",
    (phrase) => {
      expect(answer(phrase)).toEqual(reported([], [`past «${phrase}»`]));
    },
  );

  it("answers 'unclear' for an ordinal weekend of what is no month", () => {
    expect(answer('el primer finde de las vacaciones')).toEqual(reported([], ['unclear']));
  });

  it('reads the coming weekday and reports an ordinal said of no month', () => {
    expect(answer('the first Monday')).toEqual(reported(['2026-06-22'], ['unclear «first»']));
  });
});

describe('read: what no answer of readDates shows', () => {
  it('writes a phrase that corrects itself as one fragment not understood, trimmed', () => {
    expect(read('  el sábado a las 10, no, a las 11 ')).toEqual({
      text: 'el sábado a las 10, no, a las 11',
      items: [],
      notUnderstood: [{ text: 'el sábado a las 10, no, a las 11', offset: 0 }],
      vague: [],
      numbers: false,
      aboutWhen: true,
      half: null,
    });
  });

  it('writes nothing for a phrase with nothing about when', () => {
    expect(read('hola, qué tal')).toEqual({
      text: 'hola, qué tal',
      items: [],
      notUnderstood: [],
      vague: [],
      numbers: false,
      aboutWhen: false,
      half: null,
    });
  });

  it('writes the first date of a phrase as joined, with no mark of being added', () => {
    expect(read('quedamos el viernes')).toEqual({
      text: 'quedamos el viernes',
      items: [
        {
          expr: { kind: 'weekday', weekday: 5 },
          times: [],
          except: [],
          vague: [],
          joined: true,
          text: 'el viernes',
          offset: 9,
        },
      ],
      notUnderstood: [],
      vague: [],
      numbers: false,
      aboutWhen: true,
      half: null,
    });
  });
});

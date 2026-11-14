import { describe, expect, it } from 'vitest';
import {
  readDates,
  type ClockTime,
  type ReadNotice,
  type ReadOption,
  type ReadTime,
} from './index.js';
import { read } from './phrase-reader.js';

// Every phrase is written on Monday 15 June 2026, in a browser of Spain.
const today = '2026-06-15';

const clock = (time: ClockTime): string =>
  time.kind === 'single' ? time.at : `${time.start}–${time.end}${time.nextDay ? '+1' : ''}`;
const timeText = (time: ReadTime): string =>
  time.kind === 'pending' ? `${clock(time.morning)}|${clock(time.afternoon)}` : clock(time);
/** An option as text: "2026-06-19", "2026-07-06→2026-07-10", "2026-06-19 20:00", "2026-06-19 22:00–02:00+1", "2026-06-19 08:00|20:00" (half of the day to ask). */
const optionText = ({ dates, time }: ReadOption): string =>
  (dates.kind === 'single' ? dates.date : `${dates.start}→${dates.end}`) +
  (time ? ` ${timeText(time)}` : '');

/** The answer for a phrase, with its options as text and its questions by the words asked about. */
interface Told {
  options: string[];
  notUnderstood: string[];
  notice: ReadNotice | null;
  asked: string[];
}
const told = (text: string): Told => {
  const { options, notUnderstood, notice, questions } = readDates(text, { today, region: 'ES' });
  return {
    options: options.map(optionText),
    notUnderstood,
    notice,
    asked: questions.map((question) => question.text),
  };
};
/** An answer with nothing to tell the organizer but its options. */
const understood = (options: readonly string[]): Told => ({
  options: [...options],
  notUnderstood: [],
  notice: null,
  asked: [],
});
/** An answer with no option: the whole phrase is given back with its notice. */
const refused = (text: string, notice: ReadNotice): Told => ({
  options: [],
  notUnderstood: [text],
  notice,
  asked: [],
});

const weekendsOfJuly = [
  '2026-07-04→2026-07-05',
  '2026-07-11→2026-07-12',
  '2026-07-18→2026-07-19',
  '2026-07-25→2026-07-26',
];
const saturdaysOfJuly = ['2026-07-04', '2026-07-11', '2026-07-18', '2026-07-25'];
const mondaysOfJuly = ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27'];
const nextWeekByDay = [
  '2026-06-22',
  '2026-06-23',
  '2026-06-24',
  '2026-06-25',
  '2026-06-26',
  '2026-06-27',
  '2026-06-28',
];

describe('readDates: weekends', () => {
  it.each(['julio: todos los fines de semana', 'julio: cualquier fin de semana'])(
    'reads the weekends of the month said before a colon: "%s"',
    (text) => {
      expect(told(text)).toEqual(understood(weekendsOfJuly));
    },
  );

  it.each(['todos los fines de semana', 'cualquier fin de semana', 'el primer finde'])(
    'does not guess which weekends "%s" means when no month is said',
    (text) => {
      expect(told(text)).toEqual(refused(text, 'unclear'));
    },
  );

  it('answers "past" for the last weekend with no month', () => {
    expect(told('el último finde')).toEqual(refused('el último finde', 'past'));
  });

  it.each([
    ['finde de chicas', 'chicas'],
    ['fin de semana de esquí', 'esquí'],
  ])('reads "%s" as the coming weekend and reports the plan it names', (text, plan) => {
    expect(told(text)).toEqual({
      options: ['2026-06-20→2026-06-21'],
      notUnderstood: [plan],
      notice: 'unclear',
      asked: [],
    });
  });

  it('keeps a weekend said after another as an option of its own', () => {
    expect(told('el primer finde de julio o este finde')).toEqual(
      understood(['2026-06-20→2026-06-21', '2026-07-04→2026-07-05']),
    );
  });
});

describe('readDates: weeks', () => {
  it.each(['esta semana', 'this week', 'aquesta setmana'])(
    'reads "%s" as the week of today, Monday to Sunday',
    (text) => {
      expect(told(text)).toEqual(understood(['2026-06-15→2026-06-21']));
    },
  );

  it('reads a week and a day joined by "o" as two options', () => {
    expect(told('la semana que viene o el viernes 3 de julio')).toEqual(
      understood(['2026-06-22→2026-06-28', '2026-07-03']),
    );
    expect(told('el martes o la semana que viene')).toEqual(
      understood(['2026-06-16', '2026-06-22→2026-06-28']),
    );
  });

  it('reads the week and reports the word that follows "de" when it is no date', () => {
    expect(told('la semana que viene de vacaciones')).toEqual({
      options: ['2026-06-22→2026-06-28'],
      notUnderstood: ['vacaciones'],
      notice: 'unclear',
      asked: [],
    });
  });

  it('reads "some day of next week" as that week, one range', () => {
    expect(told('algún día de la semana que viene')).toEqual(understood(['2026-06-22→2026-06-28']));
  });

  it('does not guess a week said with no "this" or "next"', () => {
    expect(told('algún día de la semana')).toEqual(refused('algún día de la semana', 'unclear'));
  });

  it('puts every weekday listed after a week in that week', () => {
    expect(told('la semana que viene martes, miércoles o jueves')).toEqual(
      understood(['2026-06-23', '2026-06-24', '2026-06-25']),
    );
  });

  it('reads a weekday of the week said with "próxima" before it', () => {
    expect(told('el viernes de la próxima semana')).toEqual(understood(['2026-06-26']));
  });
});

describe('readDates: weekday patterns', () => {
  it('reads "the next 3 Mondays" as the three coming ones, never today', () => {
    expect(told('the next 3 Mondays')).toEqual(
      understood(['2026-06-22', '2026-06-29', '2026-07-06']),
    );
  });

  it.each([
    ['los próximos sábados de julio', saturdaysOfJuly],
    ['partido cada sábado del 4 al 25 de julio', saturdaysOfJuly],
    ['julio: los lunes', mondaysOfJuly],
  ])('reads "%s" as one option per day', (text, days) => {
    expect(told(text)).toEqual(understood(days));
  });

  it('reads several weekdays listed with commas and "y" over one month', () => {
    expect(told('los lunes, miércoles y viernes de julio')).toEqual(
      understood([
        '2026-07-01',
        '2026-07-03',
        '2026-07-06',
        '2026-07-08',
        '2026-07-10',
        '2026-07-13',
        '2026-07-15',
        '2026-07-17',
        '2026-07-20',
        '2026-07-22',
        '2026-07-24',
        '2026-07-27',
        '2026-07-29',
        '2026-07-31',
      ]),
    );
  });

  it('reads weekdays that each have their article over one month', () => {
    expect(told('los lunes y los miércoles de julio')).toEqual(
      understood([
        '2026-07-01',
        '2026-07-06',
        '2026-07-08',
        '2026-07-13',
        '2026-07-15',
        '2026-07-20',
        '2026-07-22',
        '2026-07-27',
        '2026-07-29',
      ]),
    );
  });

  it.each(['los lunes', 'sábados', 'Saturdays'])(
    'does not guess how many days "%s" means when no period is said',
    (text) => {
      expect(told(text)).toEqual(refused(text, 'unclear'));
    },
  );
});

describe('readDates: ranges of days', () => {
  it.each([
    'on Friday to Sunday 26-28 June',
    'viernes a domingo 26-28 de junio',
    'viernes al domingo 26-28 de junio',
    'viernes-domingo 26-28 de junio',
    'divendres a diumenge 26-28 de juny',
  ])('reads two weekdays and the days said after them as one range: "%s"', (text) => {
    expect(told(text)).toEqual(understood(['2026-06-26→2026-06-28']));
  });

  it.each([
    ['desde el 6 hasta el 10 de julio', '2026-07-06→2026-07-10'],
    ['from 6-10 July', '2026-07-06→2026-07-10'],
    ['3 al 7 de agosto', '2026-08-03→2026-08-07'],
  ])('reads "%s" as one range', (text, range) => {
    expect(told(text)).toEqual(understood([range]));
  });

  it('reads a dash between a weekday and an hour as a pause, never as a range', () => {
    expect(told('el viernes - 20:00')).toEqual(understood(['2026-06-19 20:00']));
  });

  it.each(['julio: del 6 al 10 o del 20 al 24'])(
    'gives the month said before a colon to the ranges that follow: "%s"',
    (text) => {
      expect(told(text)).toEqual(understood(['2026-07-06→2026-07-10', '2026-07-20→2026-07-24']));
    },
  );

  it('keeps the month a day has of its own after a month said before a colon', () => {
    expect(told('dic: el sábado 5 o el 2 de enero')).toEqual(
      understood(['2026-12-05', '2027-01-02']),
    );
  });
});

describe('readDates: single days', () => {
  it.each([
    ['boda 12 de julio', ['2026-07-12']],
    ['torneo el 12', ['2026-07-12']],
    ['torneo 3, 4 y 5 de julio', ['2026-07-03', '2026-07-04', '2026-07-05']],
    ['torneo 4 y 5 de julio', ['2026-07-04', '2026-07-05']],
    ['torneo 4 o 5 de julio', ['2026-07-04', '2026-07-05']],
    ['drinks 26th', ['2026-06-26']],
  ])('reads the days said right after a word that is no date: "%s"', (text, days) => {
    expect(told(text)).toEqual(understood(days));
  });

  it('reads a day in May said in English with "in", and never the verb "may"', () => {
    expect(told('in May')).toEqual(understood(['2027-05-01→2027-05-31']));
    expect(told('sometime in may')).toEqual(understood(['2027-05-01→2027-05-31']));
    expect(told('we may meet on Friday').options).toEqual(['2026-06-19']);
  });
});

describe('readDates: every day of a stretch', () => {
  it('reads "any evening next week" as each day of the week, the time reported', () => {
    expect(told('any evening next week')).toEqual({
      options: nextWeekByDay,
      notUnderstood: ['evening'],
      notice: 'timeUnclear',
      asked: [],
    });
  });

  it('reads "cualquier tarde" after a range as each of its days, the time reported', () => {
    expect(told('del 6 al 10 de julio, cualquier tarde')).toEqual({
      options: ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'],
      notUnderstood: ['tarde'],
      notice: 'timeUnclear',
      asked: [],
    });
  });

  it('reads "cualquier día" after a range as each of its days, with the hour said', () => {
    expect(told('del 6 al 10 de julio cualquier día a partir de las 18:00')).toEqual(
      understood([
        '2026-07-06 18:00',
        '2026-07-07 18:00',
        '2026-07-08 18:00',
        '2026-07-09 18:00',
        '2026-07-10 18:00',
      ]),
    );
  });

  it.each([
    'next week, any evening at 7',
    'next week, any evening, at 7',
    'next week, any evening from 7',
  ])('gives the half of the day of "any evening" to the hour that follows: "%s"', (text) => {
    expect(told(text)).toEqual(understood(nextWeekByDay.map((day) => `${day} 19:00`)));
  });

  it('reports the vague time of "any evening" by its own word', () => {
    expect(told('the week after next, any evening')).toEqual({
      options: [
        '2026-06-29',
        '2026-06-30',
        '2026-07-01',
        '2026-07-02',
        '2026-07-03',
        '2026-07-04',
        '2026-07-05',
      ],
      notUnderstood: ['evening'],
      notice: 'timeUnclear',
      asked: [],
    });
  });

  it('keeps a week whole when a vague time follows it with no "cualquier"', () => {
    expect(told('la semana que viene mejor por la tarde')).toEqual({
      options: ['2026-06-22→2026-06-28'],
      notUnderstood: ['por la tarde'],
      notice: 'timeUnclear',
      asked: [],
    });
  });
});

describe('readDates: clock times as written', () => {
  it.each([
    ['dissabte a dos quarts de deu', '2026-06-20 09:30|21:30', 'a dos quarts de deu'],
    ['dissabte a un quart de deu', '2026-06-20 09:15|21:15', 'a un quart de deu'],
    ['el viernes a la una', '2026-06-19 01:00|13:00', 'a la una'],
    ['Friday at quarter to twelve', '2026-06-19 11:45|23:45', 'at quarter to twelve'],
    ['el viernes a las 12 menos cuarto', '2026-06-19 11:45|23:45', 'a las 12 menos cuarto'],
    ['Friday half past eight', '2026-06-19 08:30|20:30', 'half past eight'],
  ])('asks the half of the day of "%s"', (text, option, words) => {
    expect(told(text)).toEqual({
      options: [option],
      notUnderstood: [],
      notice: null,
      asked: [words],
    });
  });

  it.each([
    ["dissabte a tres quarts d'una", '2026-06-20 12:45'],
    ["dissabte a un quart d'una", '2026-06-20 12:15'],
    ['dissabte al vespre a dos quarts de nou', '2026-06-20 20:30'],
    ['divendres dos quarts de nou del vespre', '2026-06-19 20:30'],
    ['comida el sábado a la una', '2026-06-20 13:00'],
    ['el viernes a las 08', '2026-06-19 08:00'],
    ['el viernes a las 8:30h de la tarde', '2026-06-19 20:30'],
    ['el viernes a las 8h de la tarde', '2026-06-19 20:00'],
    ['el viernes a las 8 h de la tarde', '2026-06-19 20:00'],
    ['el viernes a las 20h30', '2026-06-19 20:30'],
    ['a las 20h 27 de junio', '2026-06-27 20:00'],
    ['el viernes a las 9 menos cuarto de la noche', '2026-06-19 20:45'],
    ['Friday quarter to nine pm', '2026-06-19 20:45'],
    ['Thursday around 6-ish in the evening', '2026-06-18 18:00'],
    ['Thursday at 6-ish pm', '2026-06-18 18:00'],
    ['Friday at 8 pm or so', '2026-06-19 20:00'],
    ['el sábado a las 8 más o menos de la tarde', '2026-06-20 20:00'],
    ['el viernes 20:30', '2026-06-19 20:30'],
    ['Saturday from 20:30', '2026-06-20 20:30'],
  ])('reads the time of "%s" with nothing to ask', (text, option) => {
    expect(told(text)).toEqual(understood([option]));
  });

  it('reads "a las 24" of a day as midnight, 00:00 of the next day', () => {
    expect(told('el viernes a las 24')).toEqual(understood(['2026-06-20 00:00']));
  });

  it.each(['Friday midnight', 'Friday night at midnight', 'el viernes por la noche, a medianoche'])(
    'reads midnight said of a day, with or without "a": "%s"',
    (text) => {
      expect(told(text)).toEqual(understood(['2026-06-20 00:00']));
    },
  );

  it.each([
    ['noon on Saturday', '2026-06-20 12:00'],
    ['al mediodía el sábado', '2026-06-20 12:00'],
    ['Friday noon', '2026-06-19 12:00'],
  ])('reads noon said before or after its day: "%s"', (text, option) => {
    expect(told(text)).toEqual(understood([option]));
  });

  it('reports a Catalan "a quarts de" as a time with no exact hour, also before "una"', () => {
    expect(told("divendres a quarts d'una")).toEqual({
      options: ['2026-06-19'],
      notUnderstood: ["a quarts d'una"],
      notice: 'timeUnclear',
      asked: [],
    });
  });
});

describe('readDates: minutes before the hour', () => {
  it.each([
    ['el viernes a la una menos cuarto', '2026-06-19 00:45|12:45', 'a la una menos cuarto'],
    ['Friday at quarter to one', '2026-06-19 00:45|12:45', 'at quarter to one'],
    ['el viernes a las 12 menos cuarto', '2026-06-19 11:45|23:45', 'a las 12 menos cuarto'],
    ['comida el viernes a las 12 menos cuarto', '2026-06-19 11:45|23:45', 'a las 12 menos cuarto'],
  ])('asks the half of the day of the hour named in "%s"', (text, option, words) => {
    expect(told(text)).toEqual({
      options: [option],
      notUnderstood: [],
      notice: null,
      asked: [words],
    });
  });

  it.each([
    ['el viernes a la una menos cuarto de la tarde', '2026-06-19 12:45'],
    ['el viernes a la una menos cuarto de la madrugada', '2026-06-19 00:45'],
    ['el viernes por la tarde a la una menos cuarto', '2026-06-19 12:45'],
    ['el viernes a las 12 menos cuarto del mediodía', '2026-06-19 11:45'],
    ['el viernes a las 12 menos cuarto de la mañana', '2026-06-19 11:45'],
    ['el viernes a las 12 menos cuarto de la noche', '2026-06-19 23:45'],
    ['Friday at quarter to twelve pm', '2026-06-19 11:45'],
    ['Friday at quarter to noon', '2026-06-19 11:45'],
    ['Friday at quarter to midnight', '2026-06-19 23:45'],
    ['Friday at half past noon', '2026-06-19 12:30'],
    ['el viernes a las 13 menos cuarto', '2026-06-19 12:45'],
  ])('takes them off the hour once it has its half of the day in "%s"', (text, option) => {
    expect(told(text)).toEqual(understood([option]));
  });

  it.each([
    ['el viernes a las 0 menos cuarto', '2026-06-19 23:45'],
    ['el viernes a las 00:00 menos cuarto', '2026-06-19 23:45'],
    ['Friday at quarter to twelve am', '2026-06-19 23:45'],
  ])('keeps the day named when they come before 00:00 in "%s"', (text, option) => {
    expect(told(text)).toEqual(understood([option]));
  });

  it.each([
    ['el viernes por la mañana a las 12 menos cuarto', '2026-06-19 11:45'],
    ['el viernes por la noche a las 12 menos cuarto', '2026-06-19 23:45'],
    ['desayuno el viernes a las 12 menos cuarto', '2026-06-19 11:45'],
    ['cena el viernes a las 12 menos cuarto', '2026-06-19 23:45'],
  ])('reads the 12 of "%s" as noon or midnight by the half of the day said', (text, option) => {
    expect(told(text)).toEqual(understood([option]));
  });

  it.each([
    ['el viernes de 6 a 7 menos cuarto de la tarde', '2026-06-19 18:00–18:45'],
    ['el viernes de 12 menos cuarto a 2 de la tarde', '2026-06-19 11:45–14:00'],
    ['el viernes de 12 menos cuarto a 3 de la madrugada', '2026-06-19 23:45–03:00+1'],
    ['el viernes de 11 a 12 menos cuarto de la noche', '2026-06-19 23:00–23:45'],
  ])('reads the range of hours of "%s" by the hours named', (text, option) => {
    expect(told(text)).toEqual(understood([option]));
  });

  it.each([
    ['el viernes de 12 menos cuarto a 1', '2026-06-19 11:45–13:00', []],
    [
      'el viernes de 1 menos cuarto a 3',
      '2026-06-19 00:45–03:00|12:45–15:00',
      ['de 1 menos cuarto a 3'],
    ],
  ])('reads the bare range of hours of "%s"', (text, option, asked) => {
    expect(told(text)).toEqual({ options: [option], notUnderstood: [], notice: null, asked });
  });
});

describe('readDates: ranges of hours', () => {
  it.each([
    ['tomorrow 6-9pm', '2026-06-16 18:00–21:00'],
    ['tomorrow 6 to 9 pm', '2026-06-16 18:00–21:00'],
    ['tomorrow from 10-12', '2026-06-16 10:00–12:00'],
    ['el sábado de la 1 a las 3 de la tarde', '2026-06-20 13:00–15:00'],
    ['el sábado desde las 11 hasta la 1', '2026-06-20 11:00–13:00'],
    ['el viernes 20:00-22:00', '2026-06-19 20:00–22:00'],
    ['el viernes 20:00 a 22:00', '2026-06-19 20:00–22:00'],
    ['el viernes por la mañana de 9 a 11', '2026-06-19 09:00–11:00'],
  ])('reads "%s" as one range of hours', (text, option) => {
    expect(told(text)).toEqual(understood([option]));
  });

  it('reads several ends said with "o las" as one range each, the half of the day said last for all', () => {
    expect(told('el viernes desde las 8 hasta las 10 o las 12 de la noche')).toEqual(
      understood(['2026-06-19 20:00–22:00', '2026-06-19 20:00–00:00+1']),
    );
    expect(told('el sábado de 10 a 3 o las 4 de la madrugada')).toEqual(
      understood(['2026-06-20 22:00–03:00+1', '2026-06-20 22:00–04:00+1']),
    );
    expect(told('el viernes desde las 10 hasta las 2 o las 3 o las 4 de la madrugada')).toEqual(
      understood([
        '2026-06-19 22:00–02:00+1',
        '2026-06-19 22:00–03:00+1',
        '2026-06-19 22:00–04:00+1',
      ]),
    );
  });

  it('asks a range whose end is a later hour than the one the half of the day is said of', () => {
    expect(told('el sábado de 10 a 11 o las 2 de la madrugada').options).toEqual([
      '2026-06-20 10:00–11:00|22:00–23:00',
      '2026-06-20 22:00–02:00+1',
    ]);
  });

  it('keeps the day and reports a range that ends at an hour that does not exist', () => {
    expect(told('el viernes de 22 a 25')).toEqual({
      options: ['2026-06-19'],
      notUnderstood: ['de 22 a 25'],
      notice: 'timeUnclear',
      asked: [],
    });
  });

  it('reads the start and reports an end that is no hour', () => {
    expect(told('el sábado desde las 10 hasta que nos echen')).toEqual({
      options: ['2026-06-20 10:00|22:00'],
      notUnderstood: ['hasta que nos echen'],
      notice: 'unclear',
      asked: ['desde las 10'],
    });
    expect(told('Friday at 8 to celebrate')).toEqual({
      options: ['2026-06-19 08:00|20:00'],
      notUnderstood: ['to celebrate'],
      notice: 'unclear',
      asked: ['at 8'],
    });
  });

  it('gives a range of hours to the day that says "a la misma hora"', () => {
    const answer = told('el viernes de 5 a 7 o el sábado a la misma hora');

    expect(answer.options).toEqual([
      '2026-06-19 05:00–07:00|17:00–19:00',
      '2026-06-20 05:00–07:00|17:00–19:00',
    ]);
    expect(answer.asked).toHaveLength(1);
  });

  it('reports "a la misma hora" when the only hour said before does not exist', () => {
    expect(told('el viernes a las 25 o el sábado a la misma hora')).toEqual({
      options: ['2026-06-19', '2026-06-20'],
      notUnderstood: ['a la misma hora', 'a las 25'],
      notice: 'unclear',
      asked: [],
    });
  });
});

describe('readDates: "de" and "desde" after a day', () => {
  it.each([
    'sábado de 22 y domingo de 20',
    'sábado de 22 o domingo de 20',
    'sábado de 22, domingo de 20',
    'sábado las 22 y domingo las 20',
    'sábado las 22, domingo las 20',
  ])('reads the hour of each weekday in "%s"', (text) => {
    expect(told(text)).toEqual(understood(['2026-06-20 22:00', '2026-06-21 20:00']));
  });

  it('reads "de" before a word that is no hour as part of the plan', () => {
    expect(told('el sábado de cañas')).toEqual(understood(['2026-06-20']));
    expect(told('el viernes de cena a las 9')).toEqual(understood(['2026-06-19 21:00']));
    expect(told('el viernes a las 8 a cenar')).toEqual(understood(['2026-06-19 20:00']));
    expect(told('el viernes de cañas a las 8')).toEqual({
      options: ['2026-06-19 08:00|20:00'],
      notUnderstood: [],
      notice: null,
      asked: ['a las 8'],
    });
  });

  it('never reads the people of a plan as its hour', () => {
    expect(told('cena de 8 personas el viernes')).toEqual({
      options: ['2026-06-19'],
      notUnderstood: ['8 personas'],
      notice: 'unclear',
      asked: [],
    });
  });

  it.each([
    ['desde el lunes', '2026-06-22', 'desde'],
    ['from 2 July', '2026-07-02', 'from'],
    ['Saturday after the game', '2026-06-20', 'after the game'],
    ['Saturday, anytime after the game', '2026-06-20', 'anytime after the game'],
  ])('reads the day of "%s" and reports the words that say no hour', (text, day, words) => {
    expect(told(text)).toEqual({
      options: [day],
      notUnderstood: [words],
      notice: 'unclear',
      asked: [],
    });
  });

  it.each([
    ['el viernes por la tarde a partir de las 8', '2026-06-19 20:00'],
    ['Friday evening, anytime from 8', '2026-06-19 20:00'],
    ['Saturday afternoon from 2', '2026-06-20 14:00'],
  ])('gives the half of the day said before "from" to its hour: "%s"', (text, option) => {
    expect(told(text)).toEqual(understood([option]));
  });
});

describe('readDates: several times and several days', () => {
  it('keeps a time for the day it is said of when the next day has none', () => {
    expect(told('el viernes a las 20:00 o el sábado')).toEqual(
      understood(['2026-06-19 20:00', '2026-06-20']),
    );
    expect(told('el viernes cena a las 9 o el sábado')).toEqual(
      understood(['2026-06-19 21:00', '2026-06-20']),
    );
  });

  it('reads a day in figures after "or" as a day, never as one more hour', () => {
    expect(told('4 July at 8pm or 5 July at 9pm')).toEqual(
      understood(['2026-07-04 20:00', '2026-07-05 21:00']),
    );
  });

  it.each([
    [
      'el viernes a las 20:00 o 21:30, o el sábado a las 19:00',
      ['2026-06-19 20:00', '2026-06-19 21:30', '2026-06-20 19:00'],
    ],
    [
      'Friday at 6pm or from 8pm, or Saturday at noon',
      ['2026-06-19 18:00', '2026-06-19 20:00', '2026-06-20 12:00'],
    ],
    [
      'el viernes a las 17:00 o entre las 19:00 y las 21:00, o el sábado a las 12:00',
      ['2026-06-19 17:00', '2026-06-19 19:00–21:00', '2026-06-20 12:00'],
    ],
  ])('keeps each time with the day it is said of: "%s"', (text, options) => {
    expect(told(text)).toEqual(understood(options));
  });

  it('keeps noon said after another hour with the day both are said of', () => {
    expect(told('Friday at 11 or noon, or Saturday at 5pm')).toEqual({
      options: ['2026-06-19 11:00|23:00', '2026-06-19 12:00', '2026-06-20 17:00'],
      notUnderstood: [],
      notice: null,
      asked: ['at 11'],
    });
  });

  it('asks each bare hour by its own words', () => {
    expect(told('el viernes a las 7 o 8')).toEqual({
      options: ['2026-06-19 07:00|19:00', '2026-06-19 08:00|20:00'],
      notUnderstood: [],
      notice: null,
      asked: ['a las 7', '8'],
    });
  });

  it('reads hours listed with "las" after the first one', () => {
    expect(told('el sábado a las 10, las 12 y las 17')).toEqual({
      options: ['2026-06-20 10:00|22:00', '2026-06-20 12:00', '2026-06-20 17:00'],
      notUnderstood: [],
      notice: null,
      asked: ['a las 10'],
    });
  });

  it('gives a time said after a plan word to every day listed before it', () => {
    expect(told('el lunes, el martes o el miércoles, cena a las 9')).toEqual(
      understood(['2026-06-16 21:00', '2026-06-17 21:00', '2026-06-22 21:00']),
    );
  });

  it.each([
    [
      'el lunes 22 o el martes 23, siempre por la tarde a las 7',
      ['2026-06-22 19:00', '2026-06-23 19:00'],
    ],
    [
      'el lunes 22 y el martes 23, todos a las 8 de la tarde',
      ['2026-06-22 20:00', '2026-06-23 20:00'],
    ],
    ['el lunes y el martes, todos a mediodía', ['2026-06-16 12:00', '2026-06-22 12:00']],
  ])(
    'reads "siempre" and "todos" before a time as that time for each day: "%s"',
    (text, options) => {
      expect(told(text)).toEqual(understood(options));
    },
  );

  it('reports "todos" when no time follows it', () => {
    expect(told('el viernes y el sábado, todos juntos')).toEqual({
      options: ['2026-06-19', '2026-06-20'],
      notUnderstood: ['todos juntos'],
      notice: 'unclear',
      asked: [],
    });
  });

  it('reports a second word that is no hour after "o a la"', () => {
    expect(told('el viernes a las 8 o a la salida del curro')).toEqual({
      options: ['2026-06-19 08:00|20:00'],
      notUnderstood: ['salida del curro'],
      notice: 'unclear',
      asked: ['a las 8'],
    });
  });
});

describe('readDates: the half of the day said in words', () => {
  it.each([
    ['el sábado por la tarde a la 1', '2026-06-20 13:00'],
    ['el sábado por la mañana a las 11', '2026-06-20 11:00'],
    ['el sábado por la noche a las 11', '2026-06-20 23:00'],
    ['el sábado por la mañana a las 12 del mediodía', '2026-06-20 12:00'],
  ])('settles the hour of "%s"', (text, option) => {
    expect(told(text)).toEqual(understood([option]));
  });

  it('gives the half said with the last hour to the earlier hours only', () => {
    expect(told('el viernes a las 8 o a partir de las 9 de la noche')).toEqual(
      understood(['2026-06-19 20:00', '2026-06-19 21:00']),
    );
    expect(told('el viernes a las 6 o a las 5 de la tarde')).toEqual({
      options: ['2026-06-19 06:00|18:00', '2026-06-19 17:00'],
      notUnderstood: [],
      notice: null,
      asked: ['a las 6'],
    });
  });

  it('reports a half of the day said after the times with no hour of its own', () => {
    expect(told('el viernes por la mañana a las 10, por la tarde')).toEqual({
      options: ['2026-06-19 10:00'],
      notUnderstood: ['por la tarde'],
      notice: 'timeUnclear',
      asked: [],
    });
  });

  it.each([
    ['hoy a las 10 de la noche o mañana a las 10', ['2026-06-15 22:00', '2026-06-16 10:00|22:00']],
    [
      'el sábado a las 10 de la noche y el domingo a las 10',
      ['2026-06-20 22:00', '2026-06-21 10:00|22:00'],
    ],
  ])('asks the same hour said again with no "también": "%s"', (text, options) => {
    expect(told(text)).toEqual({
      options,
      notUnderstood: [],
      notice: null,
      asked: ['a las 10'],
    });
  });
});

describe('readDates: meal words', () => {
  it('asks an hour a lunch word does not speak for, whatever other words surround it', () => {
    expect(told('comida de equipo el sábado a las 8')).toEqual({
      options: ['2026-06-20 08:00|20:00'],
      notUnderstood: [],
      notice: null,
      asked: ['a las 8'],
    });
  });

  it('asks the hour when two meal words say different halves of the day', () => {
    expect(told('desayuno o cena el sábado a las 9')).toEqual({
      options: ['2026-06-20 09:00|21:00'],
      notUnderstood: [],
      notice: null,
      asked: ['a las 9'],
    });
  });

  it('lets a dinner word speak for the hours a lunch word said with it does not reach', () => {
    expect(told('comida o cena el sábado, a las 2 o a las 9')).toEqual(
      understood(['2026-06-20 14:00', '2026-06-20 21:00']),
    );
  });

  it('does not report a lunch word that settled an hour, beside a day with a vague time', () => {
    expect(told('el sábado por la noche o el domingo a la hora de comer, a las 2')).toEqual({
      options: ['2026-06-20', '2026-06-21 14:00'],
      notUnderstood: ['por la noche'],
      notice: 'timeUnclear',
      asked: [],
    });
  });

  it('does not report a lunch word said apart from the day whose hour it settled', () => {
    expect(told('el sábado a las 2 en casa de Marta, a la hora de comer')).toEqual({
      options: ['2026-06-20 14:00'],
      notUnderstood: ['casa de Marta'],
      notice: 'unclear',
      asked: [],
    });
  });
});

describe('readDates: exceptions', () => {
  it.each([
    ['del 6 al 10 de julio menos el día 8', ['2026-07-06→2026-07-07', '2026-07-09→2026-07-10']],
    [
      'del 1 al 10 de julio menos el fin de semana',
      ['2026-07-01→2026-07-03', '2026-07-06→2026-07-10'],
    ],
    [
      'from July 6 to July 10 except July 8th and July 9th',
      ['2026-07-06→2026-07-07', '2026-07-10'],
    ],
    ['del 6 al 12 de julio menos el 8 o el 9', ['2026-07-06→2026-07-07', '2026-07-10→2026-07-12']],
    ['del 6 al 12 de julio menos el 8 y el 9', ['2026-07-06→2026-07-07', '2026-07-10→2026-07-12']],
    [
      'del 6 al 12 de julio menos el día 8 y el día 9',
      ['2026-07-06→2026-07-07', '2026-07-10→2026-07-12'],
    ],
    ['toda la semana que viene menos el lunes y el martes', ['2026-06-24→2026-06-28']],
    [
      'any weekend in July except the first and the last',
      ['2026-07-11→2026-07-12', '2026-07-18→2026-07-19'],
    ],
    ['tots els dissabtes de juliol menys el dia 11', ['2026-07-04', '2026-07-18', '2026-07-25']],
  ])('leaves out what "%s" excepts', (text, options) => {
    expect(told(text)).toEqual(understood(options));
  });

  it('leaves out a day said with its month, of that month only', () => {
    expect(told('todos los lunes de julio y agosto menos el 13 de julio')).toEqual(
      understood([
        '2026-07-06',
        '2026-07-20',
        '2026-07-27',
        '2026-08-03',
        '2026-08-10',
        '2026-08-17',
        '2026-08-24',
        '2026-08-31',
      ]),
    );
  });

  it('leaves out whole months listed with "y"', () => {
    expect(told('todos los lunes de julio a octubre menos agosto y septiembre')).toEqual(
      understood([...mondaysOfJuly, '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']),
    );
  });

  it.each([
    'del 6 al 12 de julio menos el miércoles de 10 a 12',
    'del 6 al 12 de julio menos el 8 de 10 a 12',
  ])('reads the hours said after an exception as the time of the days left: "%s"', (text) => {
    expect(told(text)).toEqual(
      understood([
        '2026-07-06 10:00–12:00',
        '2026-07-07 10:00–12:00',
        '2026-07-09 10:00–12:00',
        '2026-07-10 10:00–12:00',
        '2026-07-11 10:00–12:00',
        '2026-07-12 10:00–12:00',
      ]),
    );
  });

  it('reports an exception that names no day, with its word', () => {
    expect(told('todos los lunes de julio excepto festivos')).toEqual({
      options: mondaysOfJuly,
      notUnderstood: ['excepto festivos'],
      notice: 'unclear',
      asked: [],
    });
  });

  it('never leaves out part of a day: the whole exception is reported', () => {
    expect(told('toda la semana que viene menos el sábado mañana')).toEqual({
      options: ['2026-06-22→2026-06-28'],
      notUnderstood: ['menos el sábado mañana'],
      notice: 'unclear',
      asked: [],
    });
    expect(told('del 6 al 10 de julio a las 8 menos el miércoles por la tarde')).toEqual({
      options: [
        '2026-07-06 08:00|20:00',
        '2026-07-07 08:00|20:00',
        '2026-07-08 08:00|20:00',
        '2026-07-09 08:00|20:00',
        '2026-07-10 08:00|20:00',
      ],
      notUnderstood: ['menos el miércoles por la tarde'],
      notice: 'unclear',
      asked: ['a las 8'],
    });
  });
});

describe('readDates: what is not understood', () => {
  it.each([
    ['el viernes con Marta, en casa', ['Marta', 'casa']],
    ['el viernes con Marta y con Juan', ['Marta', 'Juan']],
    ['el viernes Marta puede', ['Marta']],
    ['el viernes para 20 personas', ['20 personas']],
    ['el viernes vamos 12 personas para cenar', ['vamos 12 personas']],
  ])('reports each fragment of "%s" on its own', (text, fragments) => {
    expect(told(text)).toEqual({
      options: ['2026-06-19'],
      notUnderstood: fragments,
      notice: 'unclear',
      asked: [],
    });
  });

  it('does not report the words after "para" that name the plan', () => {
    expect(told('el sábado para el cumple de Marta')).toEqual(understood(['2026-06-20']));
  });

  it('reports the words on each side of a time, never the time between them', () => {
    expect(told('el sábado con Marta a las 8 en casa')).toEqual({
      options: ['2026-06-20 08:00|20:00'],
      notUnderstood: ['Marta', 'casa'],
      notice: 'unclear',
      asked: ['a las 8'],
    });
  });

  it('reports a vague time said before words that are not understood, not said of the next date', () => {
    expect(told('por la tarde no puedo, mejor el viernes')).toEqual({
      options: ['2026-06-19'],
      notUnderstood: ['no', 'por la tarde'],
      notice: 'unclear',
      asked: [],
    });
  });

  it('keeps apart two days with words not understood between them', () => {
    expect(told('el 3 de julio cena en casa de Marta, el sábado barbacoa')).toEqual({
      options: ['2026-06-20', '2026-07-03'],
      notUnderstood: ['casa de Marta'],
      notice: 'unclear',
      asked: [],
    });
  });

  it('answers "mismatch" for a count of things and no date', () => {
    expect(told('propongo tres opciones')).toEqual(refused('propongo tres opciones', 'mismatch'));
  });

  it.each(['a las 8 no puedo', 'cuando no llueva'])(
    'answers "unclear" for "%s": it speaks of when and names no number left unread',
    (text) => {
      expect(told(text)).toEqual(refused(text, 'unclear'));
    },
  );

  it('gives back the phrase without the spaces around it', () => {
    expect(told('  cuando haga bueno  ')).toEqual(refused('cuando haga bueno', 'unclear'));
  });
});

describe('readDates: an occurrence rejected for the one after it', () => {
  it.each([
    'no este viernes, el siguiente',
    'no este viernes, mejor el siguiente',
    'no este viernes sino el siguiente',
    'no este viernes, el próximo viernes',
    'este viernes no mejor el siguiente',
    'not this Friday, the following one',
  ])('gives no option for "%s"', (text) => {
    expect(told(text)).toEqual(refused(text, 'unclear'));
  });

  it.each([
    [
      'el lunes, pero no este viernes sino el siguiente',
      ['pero no este viernes sino el siguiente'],
    ],
    [
      'el lunes con Marta pero no este viernes sino el siguiente',
      ['Marta', 'pero no este viernes sino el siguiente'],
    ],
    ['el lunes y no este viernes sino el siguiente', ['no este viernes sino el siguiente']],
    [
      'el lunes, pero no esta semana sino la próxima semana',
      ['pero no esta semana sino la próxima semana'],
    ],
    [
      'el lunes, pero no este finde sino el próximo finde',
      ['pero no este finde sino el próximo finde'],
    ],
    ['Monday works, but not this Friday, the one after', ['but not this Friday, the one after']],
  ])('keeps the other day of "%s" and reports the rejection whole', (text, fragments) => {
    expect(told(text)).toEqual({
      options: ['2026-06-22'],
      notUnderstood: fragments,
      notice: 'unclear',
      asked: [],
    });
  });

  it('reads "o el próximo lunes" after a day as one more day, with no rejection', () => {
    expect(told('quedamos el viernes o el próximo lunes')).toEqual(
      understood(['2026-06-19', '2026-06-22']),
    );
  });
});

describe('readDates: conditions', () => {
  it.each([
    ['el sábado si Dominga puede', ['2026-06-20']],
    ['el viernes si somos más de 10', ['2026-06-19']],
    ['si arreglan el coche, el viernes 19', ['2026-06-19']],
    ['el viernes, y si llueve el sábado', ['2026-06-19', '2026-06-20']],
    ['el viernes 19, si no el 26', ['2026-06-19', '2026-06-26']],
  ])('ignores the condition of "%s" and reads its dates', (text, options) => {
    expect(told(text)).toEqual(understood(options));
  });

  it('reports what follows a date word that ended a condition', () => {
    expect(told('el viernes a las 8 de la tarde y si no pasado, ya veremos')).toEqual({
      options: ['2026-06-19 20:00'],
      notUnderstood: ['pasado', 'ya veremos'],
      notice: 'unclear',
      asked: [],
    });
  });
});

describe('read: what no answer shows', () => {
  it('keeps a count of things as not understood when the phrase has no date', () => {
    expect(read('propongo tres opciones').notUnderstood).toEqual(['tres']);
  });

  it('leaves no exception in the item when part of a day was excepted', () => {
    const [week] = read('toda la semana que viene menos el sábado mañana').items;

    expect(week?.except).toEqual([]);
  });

  it('marks the end of a morning that runs past noon as afternoon', () => {
    const [mornings] = read('las mañanas del 22 al 26 de 10 a 1').items;

    expect(mornings?.times.map((time) => [time.start?.mark, time.end?.mark])).toEqual([
      ['AM', 'PM'],
    ]);
  });
});

import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import type { DateInterpretation } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import type { NoticeLine } from './notice-box';
import { type QuestionLine, noticeLines, questionLines } from './reading-words';

type Notice = DateInterpretation['notices'][number];
type Question = DateInterpretation['questions'][number];
type LeftOut = Pick<DateInterpretation, 'timesLeftOut' | 'questionsNotAsked'>;

describe('the notices of a reading', () => {
  let transloco: TranslocoService;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideI18n()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    transloco = TestBed.inject(TranslocoService);
  });

  function lines(
    notices: readonly Notice[],
    { timesLeftOut = [], questionsNotAsked = [] }: Partial<LeftOut> = {},
  ): readonly NoticeLine[] {
    return noticeLines({ notices: [...notices], timesLeftOut, questionsNotAsked }, transloco);
  }

  it('are none for a reading with nothing to tell', () => {
    expect(lines([])).toEqual([]);
  });

  it('say a time not understood after the day that is marked, quoting its words', () => {
    expect(
      lines([{ kind: 'timeUnclear', fragment: 'por la tarde', dates: ['2026-06-19'] }]),
    ).toEqual([
      {
        lead: 'vie 19 jun',
        text: 'hemos marcado el día, pero no hemos entendido la hora («por la tarde»). Elígela en el paso siguiente.',
      },
    ]);
  });

  it('say a time range that ends too late after the day that is marked', () => {
    expect(lines([{ kind: 'tooLate', fragment: 'de 22 a 8', dates: ['2026-06-19'] }])).toEqual([
      {
        lead: 'vie 19 jun',
        text: 'hemos marcado el día, pero un horario puede terminar como mucho a las 6:00 del día siguiente. Elige la hora en el paso siguiente.',
      },
    ]);
  });

  it('speak of the days when the time was said of several', () => {
    const dates = ['2026-10-03', '2026-10-10'];

    expect(lines([{ kind: 'timeUnclear', fragment: 'por la tarde', dates }])[0]?.text).toBe(
      'hemos marcado los días, pero no hemos entendido la hora («por la tarde»). Elígela en el paso siguiente.',
    );
    expect(lines([{ kind: 'tooLate', fragment: 'de 22 a 8', dates }])[0]?.text).toBe(
      'hemos marcado los días, pero un horario puede terminar como mucho a las 6:00 del día siguiente. Elige la hora en el paso siguiente.',
    );
  });

  describe('name the days a line speaks of', () => {
    const lead = (...dates: string[]): string | null | undefined =>
      lines([{ kind: 'timeUnclear', fragment: 'por la tarde', dates }])[0]?.lead;

    it('with the weekday and the month once when the days share them', () => {
      expect(lead('2026-10-03', '2026-10-10')).toBe('sáb 3 y 10 oct');
      expect(lead('2026-10-03', '2026-10-10', '2026-10-17')).toBe('sáb 3, 10 y 17 oct');
    });

    it('with the weekday of each when they differ', () => {
      expect(lead('2026-06-19', '2026-06-20')).toBe('vie 19 y sáb 20 jun');
      expect(lead('2026-06-19', '2026-06-20', '2026-06-21')).toBe('vie 19, sáb 20 y dom 21 jun');
      expect(lead('2026-06-19', '2026-06-26', '2026-06-27')).toBe('vie 19, vie 26 y sáb 27 jun');
    });

    it('with the month of each when they differ', () => {
      expect(lead('2026-06-30', '2026-07-01')).toBe('mar 30 jun y mié 1 jul');
      expect(lead('2026-06-27', '2026-07-04')).toBe('sáb 27 jun y 4 jul');
      expect(lead('2026-06-01', '2027-06-01')).toBe('lun 1 jun y mar 1 jun');
    });

    it('in the order of the calendar', () => {
      expect(lead('2026-10-17', '2026-10-03', '2026-10-10')).toBe('sáb 3, 10 y 17 oct');
    });

    it('counted when they are more than three', () => {
      expect(lead('2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24')).toBe('4 fechas');
      expect(lead('2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31')).toBe(
        '5 fechas',
      );
    });
  });

  it('say that midnight of a weekday is the day marked', () => {
    expect(
      lines([
        {
          kind: 'dayNotWritten',
          fragment: 'a medianoche',
          dates: ['2026-06-21'],
          written: 'weekday',
        },
      ]),
    ).toEqual([{ lead: 'dom 21 jun', text: 'la medianoche del sábado es el domingo a las 0:00.' }]);
  });

  it('say that midnight of a date is the next day of the month', () => {
    expect(
      lines([
        { kind: 'dayNotWritten', fragment: 'a medianoche', dates: ['2026-06-21'], written: 'date' },
      ]),
    ).toEqual([
      { lead: 'dom 21 jun', text: 'la medianoche del 20 de junio es el día 21 a las 0:00.' },
    ]);
    expect(
      lines([
        { kind: 'dayNotWritten', fragment: 'a medianoche', dates: ['2026-07-01'], written: 'date' },
      ])[0]?.text,
    ).toBe('la medianoche del 30 de junio es el día 1 a las 0:00.');
  });

  it('say midnight of several days of one weekday with the weekdays', () => {
    expect(
      lines([
        {
          kind: 'dayNotWritten',
          fragment: 'a medianoche',
          dates: ['2026-06-21', '2026-06-28'],
          written: 'weekday',
        },
      ]),
    ).toEqual([
      { lead: 'dom 21 y 28 jun', text: 'la medianoche del sábado es el domingo a las 0:00.' },
    ]);
  });

  it('say midnight of several days that share no weekday, or written as dates, of each day', () => {
    const each = 'la medianoche de cada día es el día siguiente a las 0:00.';

    expect(
      lines([
        {
          kind: 'dayNotWritten',
          fragment: 'a medianoche',
          dates: ['2026-06-20', '2026-06-21'],
          written: 'weekday',
        },
      ]),
    ).toEqual([{ lead: 'sáb 20 y dom 21 jun', text: each }]);
    expect(
      lines([
        {
          kind: 'dayNotWritten',
          fragment: 'a medianoche',
          dates: ['2026-06-21', '2026-06-28'],
          written: 'date',
        },
      ]),
    ).toEqual([{ lead: 'dom 21 y 28 jun', text: each }]);
    expect(
      lines([
        {
          kind: 'dayNotWritten',
          fragment: 'a medianoche',
          dates: ['2026-06-21', '2026-06-28', '2026-06-29'],
          written: 'weekday',
        },
      ])[0]?.text,
    ).toBe(each);
  });

  it('say what gave no option without a day, quoting its words', () => {
    expect(
      lines([
        { kind: 'unclear', fragment: 'algún día' },
        { kind: 'mismatch', fragment: 'el 31 de junio' },
        { kind: 'past', fragment: 'el 1 de junio' },
        { kind: 'pastTime', fragment: 'a las 9' },
      ]),
    ).toEqual([
      {
        lead: null,
        text: 'No hemos entendido bien tu petición («algún día»). Prueba a ser más específico.',
      },
      {
        lead: null,
        text: 'Hay algo que no encaja en tu petición («el 31 de junio»). Revísala e inténtalo de nuevo.',
      },
      { lead: null, text: 'La fecha ya pasó («el 1 de junio»). Revísala e inténtalo de nuevo.' },
      { lead: null, text: 'Esa hora ya pasó («a las 9»). Revísala e inténtalo de nuevo.' },
    ]);
  });

  it('say what speaks of the whole phrase with no words quoted', () => {
    expect(
      lines([{ kind: 'unclear' }, { kind: 'mismatch' }, { kind: 'past' }, { kind: 'tooMany' }]),
    ).toEqual([
      { lead: null, text: 'No hemos entendido bien tu petición. Prueba a ser más específico.' },
      { lead: null, text: 'Hay algo que no encaja en tu petición. Revísala e inténtalo de nuevo.' },
      { lead: null, text: 'La fecha ya pasó. Revísala e inténtalo de nuevo.' },
      { lead: null, text: 'Son demasiadas fechas (máximo 60). Acota tu petición.' },
    ]);
  });

  it('say the dates beyond the twelve months without quoting them', () => {
    const text = 'Solo puedes proponer fechas de los próximos 12 meses.';

    expect(lines([{ kind: 'horizon', fragment: 'el 1 de julio de 2027' }])).toEqual([
      { lead: null, text },
    ]);
    expect(lines([{ kind: 'horizon' }])).toEqual([{ lead: null, text }]);
  });

  it('say a time said of no day as words not understood', () => {
    const text =
      'No hemos entendido bien tu petición («por la tarde»). Prueba a ser más específico.';

    expect(lines([{ kind: 'timeUnclear', fragment: 'por la tarde', dates: [] }])).toEqual([
      { lead: null, text },
    ]);
    expect(lines([{ kind: 'tooLate', fragment: 'por la tarde', dates: [] }])).toEqual([
      { lead: null, text },
    ]);
    expect(
      lines([{ kind: 'dayNotWritten', fragment: 'por la tarde', dates: [], written: 'date' }]),
    ).toEqual([{ lead: null, text }]);
  });

  it('say a time range no event can hold after its days, written as a time range', () => {
    expect(
      lines([], {
        timesLeftOut: [
          {
            time: { kind: 'range', start: '22:00', end: '03:00', nextDay: true },
            dates: ['2026-06-19'],
          },
          {
            time: { kind: 'range', start: '09:00', end: '09:45' },
            dates: ['2026-06-26', '2026-06-19'],
          },
        ],
      }),
    ).toEqual([
      {
        lead: 'vie 19 jun',
        text: 'hemos marcado el día, pero no hemos podido marcar el horario de 22:00 a 3:00 del día siguiente. Elige la hora en el paso siguiente.',
      },
      {
        lead: 'vie 19 y 26 jun',
        text: 'hemos marcado los días, pero no hemos podido marcar el horario de 9:00 a 9:45. Elige la hora en el paso siguiente.',
      },
    ]);
  });

  it('say a question not asked after its days, quoting the words it was said with', () => {
    const nineToHalfPast = {
      fragment: 'de 9 a 9:30',
      morning: { kind: 'range', start: '09:00', end: '09:30' },
      afternoon: { kind: 'range', start: '21:00', end: '21:30' },
    } as const;

    expect(
      lines([], {
        questionsNotAsked: [
          { ...nineToHalfPast, dates: ['2026-06-22'] },
          { ...nineToHalfPast, fragment: 'de 8 a 8:15', dates: ['2026-06-29', '2026-06-22'] },
        ],
      }),
    ).toEqual([
      {
        lead: 'lun 22 jun',
        text: 'hemos marcado el día, pero no hemos podido marcar el horario «de 9 a 9:30». Elige la hora en el paso siguiente.',
      },
      {
        lead: 'lun 22 y 29 jun',
        text: 'hemos marcado los días, pero no hemos podido marcar el horario «de 8 a 8:15». Elige la hora en el paso siguiente.',
      },
    ]);
  });

  it('come in the order of the phrase, the time ranges left out after them and then the questions not asked', () => {
    const told = lines(
      [
        { kind: 'mismatch', fragment: 'el 31 de junio' },
        { kind: 'timeUnclear', fragment: 'por la tarde', dates: ['2026-06-19'] },
        { kind: 'horizon' },
      ],
      {
        timesLeftOut: [
          {
            time: { kind: 'range', start: '22:00', end: '03:00', nextDay: true },
            dates: ['2026-06-20'],
          },
        ],
        questionsNotAsked: [
          {
            fragment: 'de 9 a 9:30',
            dates: ['2026-06-22'],
            morning: { kind: 'range', start: '09:00', end: '09:30' },
            afternoon: { kind: 'range', start: '21:00', end: '21:30' },
          },
        ],
      },
    );

    expect(told.map(({ lead }) => lead)).toEqual([
      null,
      'vie 19 jun',
      null,
      'sáb 20 jun',
      'lun 22 jun',
    ]);
    expect(told[2]?.text).toBe('Solo puedes proponer fechas de los próximos 12 meses.');
  });
});

describe('the questions of a reading', () => {
  let transloco: TranslocoService;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideI18n()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    transloco = TestBed.inject(TranslocoService);
  });

  function lines(questions: readonly Question[]): readonly QuestionLine[] {
    return questionLines(questions, transloco);
  }

  /** "a las 8" asked of these days. */
  function atEight(dates: readonly string[]): Question {
    return {
      fragment: 'a las 8',
      dates: [...dates],
      morning: { kind: 'single', at: '08:00' },
      afternoon: { kind: 'single', at: '20:00' },
    };
  }

  it('are none for a reading that asks nothing', () => {
    expect(lines([])).toEqual([]);
  });

  it('quote the time as it was said, name its day and give both readings of it', () => {
    expect(lines([atEight(['2026-06-20'])])).toEqual([
      {
        before: '«a las 8» del',
        days: 'sáb 20 jun',
        after: ': ¿mañana o tarde?',
        morning: { shown: '8:00 · mañana', heard: '8:00, mañana' },
        afternoon: { shown: '20:00 · tarde', heard: '20:00, tarde' },
      },
    ]);
  });

  it('keep the minutes of a time', () => {
    const [line] = lines([
      {
        fragment: 'a las 9 y media',
        dates: ['2026-06-20'],
        morning: { kind: 'single', at: '09:30' },
        afternoon: { kind: 'single', at: '21:30' },
      },
    ]);

    expect(line?.before).toBe('«a las 9 y media» del');
    expect(line?.morning).toEqual({ shown: '9:30 · mañana', heard: '9:30, mañana' });
    expect(line?.afternoon).toEqual({ shown: '21:30 · tarde', heard: '21:30, tarde' });
  });

  it('show a time range with an arrow, and say it in words to screen readers', () => {
    const [line] = lines([
      {
        fragment: 'de 5 a 7',
        dates: ['2026-06-20'],
        morning: { kind: 'range', start: '05:00', end: '07:00' },
        afternoon: { kind: 'range', start: '17:00', end: '19:00' },
      },
    ]);

    expect(line?.morning).toEqual({
      shown: '5:00 → 7:00 · mañana',
      heard: 'de 5:00 a 7:00, mañana',
    });
    expect(line?.afternoon).toEqual({
      shown: '17:00 → 19:00 · tarde',
      heard: 'de 17:00 a 19:00, tarde',
    });
  });

  it('name up to three days, in the order of the calendar and with what they share said once', () => {
    const [two, three] = lines([
      atEight(['2026-06-20', '2026-06-19']),
      atEight(['2026-10-03', '2026-10-10', '2026-10-17']),
    ]);

    expect([two?.before, two?.days]).toEqual(['«a las 8» del', 'vie 19 y sáb 20 jun']);
    expect([three?.before, three?.days]).toEqual(['«a las 8» del', 'sáb 3, 10 y 17 oct']);
  });

  it('count the days from four on', () => {
    const [line] = lines([atEight(['2026-07-03', '2026-07-10', '2026-07-17', '2026-07-24'])]);

    expect([line?.before, line?.days, line?.after]).toEqual([
      '«a las 8» de',
      '4 fechas',
      ': ¿mañana o tarde?',
    ]);
  });

  it('come in the order of the reading', () => {
    const asked = lines([
      { ...atEight(['2026-06-22']), fragment: 'a las 10' },
      { ...atEight(['2026-06-16']), fragment: 'a las 5' },
    ]);

    expect(asked.map(({ before, days }) => `${before} ${days}`)).toEqual([
      '«a las 10» del lun 22 jun',
      '«a las 5» del mar 16 jun',
    ]);
  });
});

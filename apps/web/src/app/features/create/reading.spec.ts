import type { DateInterpretation } from '@qando/contracts';
import { NO_DATES } from './date-selection';
import { type HalfOfDay, markingOf, timesLeftOut } from './reading';

type ReadOption = DateInterpretation['options'][number];
type ReadTime = ReadOption['time'];
type Question = DateInterpretation['questions'][number];

const on = (date: string, time: ReadTime = null): ReadOption => ({
  dates: { kind: 'single', date },
  time,
});
const days = (start: string, end: string): ReadOption => ({
  dates: { kind: 'range', start, end },
  time: null,
});
const at = (time: string) => ({ kind: 'single', at: time }) as const;
const from = (start: string, end: string) => ({ kind: 'range', start, end }) as const;
const asked = (question: number) => ({ kind: 'question', question }) as const;

type Notice = DateInterpretation['notices'][number];
type TimeLeftOut = DateInterpretation['timesLeftOut'][number];
type QuestionNotAsked = DateInterpretation['questionsNotAsked'][number];

function marking(
  options: readonly ReadOption[],
  {
    questions = [],
    answers = [],
    notices = [],
    timesLeftOut = [],
    questionsNotAsked = [],
    timed = false,
  }: {
    questions?: readonly Question[];
    answers?: readonly HalfOfDay[];
    notices?: readonly Notice[];
    timesLeftOut?: readonly TimeLeftOut[];
    questionsNotAsked?: readonly QuestionNotAsked[];
    timed?: boolean;
  } = {},
) {
  return markingOf(
    {
      options: [...options],
      questions: [...questions],
      notices: [...notices],
      timesLeftOut: [...timesLeftOut],
      questionsNotAsked: [...questionsNotAsked],
    },
    answers,
    timed,
  );
}

describe('what a reading leaves on the calendar', () => {
  it('is no date when the reading has no option', () => {
    expect(marking([])).toEqual(NO_DATES);
  });

  it('marks each day as a date of its own, in the order of the calendar', () => {
    const selection = marking([
      on('2026-07-13'),
      on('2026-07-06'),
      on('2026-07-27'),
      on('2026-07-20'),
    ]);

    expect(selection).toEqual({
      singles: ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27'],
      ranges: [],
      saved: [],
      times: {},
      timed: false,
    });
  });

  it('marks a range of days as one range, the ranges in the order of the calendar', () => {
    const selection = marking([days('2026-08-10', '2026-08-12'), days('2026-08-03', '2026-08-07')]);

    expect(selection.ranges).toEqual([
      { start: '2026-08-03', end: '2026-08-07' },
      { start: '2026-08-10', end: '2026-08-12' },
    ]);
    expect(selection.singles).toEqual([]);
    expect(selection.saved).toEqual([]);
  });

  it('keeps two ranges that touch as two', () => {
    const selection = marking([days('2026-06-20', '2026-06-21'), days('2026-06-22', '2026-06-23')]);

    expect(selection.ranges).toEqual([
      { start: '2026-06-20', end: '2026-06-21' },
      { start: '2026-06-22', end: '2026-06-23' },
    ]);
    expect(selection.saved).toEqual([]);
  });

  it('saves a range said after a day of its own that it takes in, at an end or between', () => {
    for (const day of ['2026-08-03', '2026-08-05', '2026-08-07']) {
      const selection = marking([on(day), days('2026-08-03', '2026-08-07')]);

      expect(selection.singles).toEqual([day]);
      expect(selection.ranges).toEqual([]);
      expect(selection.saved).toEqual([{ start: '2026-08-03', end: '2026-08-07' }]);
    }
  });

  it('marks a range beside the days of their own it does not take in', () => {
    const selection = marking([
      on('2026-08-02'),
      on('2026-08-08'),
      days('2026-08-03', '2026-08-07'),
    ]);

    expect(selection.singles).toEqual(['2026-08-02', '2026-08-08']);
    expect(selection.ranges).toEqual([{ start: '2026-08-03', end: '2026-08-07' }]);
    expect(selection.saved).toEqual([]);
  });

  it('saves the range marked before when a day of it is said on its own afterwards', () => {
    for (const day of ['2026-08-03', '2026-08-05', '2026-08-07']) {
      const selection = marking([
        days('2026-08-10', '2026-08-12'),
        days('2026-08-03', '2026-08-07'),
        on(day),
      ]);

      expect(selection.singles).toEqual([day]);
      expect(selection.ranges).toEqual([{ start: '2026-08-10', end: '2026-08-12' }]);
      expect(selection.saved).toEqual([{ start: '2026-08-03', end: '2026-08-07' }]);
    }
  });

  it('saves a range that shares a day with a range marked before', () => {
    for (const [start, end] of [
      ['2026-08-05', '2026-08-09'],
      ['2026-08-07', '2026-08-09'],
      ['2026-08-01', '2026-08-03'],
      ['2026-08-01', '2026-08-09'],
      ['2026-08-05', '2026-08-07'],
      ['2026-08-03', '2026-08-05'],
    ] as const) {
      const selection = marking([days('2026-08-03', '2026-08-07'), days(start, end)]);

      expect(selection.ranges).toEqual([{ start: '2026-08-03', end: '2026-08-07' }]);
      expect(selection.saved).toEqual([{ start, end }]);
    }
  });

  it('marks a range over the days of one that was saved before', () => {
    const selection = marking([
      days('2026-08-03', '2026-08-07'),
      on('2026-08-04'),
      days('2026-08-06', '2026-08-09'),
    ]);

    expect(selection.singles).toEqual(['2026-08-04']);
    expect(selection.ranges).toEqual([{ start: '2026-08-06', end: '2026-08-09' }]);
    expect(selection.saved).toEqual([{ start: '2026-08-03', end: '2026-08-07' }]);
  });

  it('keeps the saved ranges by first day, then by last day', () => {
    const selection = marking([
      on('2026-08-05'),
      days('2026-08-04', '2026-08-09'),
      days('2026-08-04', '2026-08-06'),
      days('2026-08-01', '2026-08-05'),
    ]);

    expect(selection.saved).toEqual([
      { start: '2026-08-01', end: '2026-08-05' },
      { start: '2026-08-04', end: '2026-08-06' },
      { start: '2026-08-04', end: '2026-08-09' },
    ]);
  });

  it('takes a range said twice once, marked or saved', () => {
    const twice = marking([days('2026-08-03', '2026-08-07'), days('2026-08-03', '2026-08-07')]);

    expect(twice.ranges).toEqual([{ start: '2026-08-03', end: '2026-08-07' }]);
    expect(twice.saved).toEqual([]);

    const saved = marking([
      days('2026-08-03', '2026-08-07'),
      on('2026-08-05'),
      days('2026-08-03', '2026-08-07'),
    ]);

    expect(saved.ranges).toEqual([]);
    expect(saved.saved).toEqual([{ start: '2026-08-03', end: '2026-08-07' }]);
  });

  it('gives a day its time, and asks for times', () => {
    const selection = marking([on('2026-06-19', at('21:00')), on('2026-06-20')]);

    expect(selection).toEqual({
      singles: ['2026-06-19', '2026-06-20'],
      ranges: [],
      saved: [],
      times: { '2026-06-19': { marked: [at('21:00')], saved: [] } },
      timed: true,
    });
  });

  it('gives a day a time range', () => {
    const selection = marking([on('2026-06-19', from('17:00', '19:30'))]);

    expect(selection.times).toEqual({
      '2026-06-19': { marked: [from('17:00', '19:30')], saved: [] },
    });
  });

  it('leaves times asked for, or not, as they were when it has no time', () => {
    expect(marking([on('2026-06-19')], { timed: true }).timed).toBe(true);
    expect(marking([on('2026-06-19')], { timed: false }).timed).toBe(false);
    expect(marking([on('2026-06-19', at('21:00'))], { timed: true }).timed).toBe(true);
  });

  it('asks for times when a time said of a day was not understood, or ends too late', () => {
    for (const kind of ['timeUnclear', 'tooLate'] as const) {
      const selection = marking([on('2026-06-19')], {
        notices: [{ kind, fragment: 'por la tarde', dates: ['2026-06-19'] }],
      });

      expect(selection.times).toEqual({});
      expect(selection.timed).toBe(true);
    }
  });

  it('leaves times as they were when what it tells is not the time of a day', () => {
    const selection = marking([on('2026-06-19')], {
      notices: [
        { kind: 'timeUnclear', fragment: 'por la tarde', dates: [] },
        { kind: 'tooLate', fragment: 'de 22 a 8', dates: [] },
        { kind: 'unclear', fragment: 'o así' },
        { kind: 'mismatch', fragment: 'el 31 de junio' },
        { kind: 'horizon' },
      ],
    });

    expect(selection.timed).toBe(false);
  });

  it('gives a day said with several times each of them, the day marked once', () => {
    const selection = marking([
      on('2026-06-19', at('21:00')),
      on('2026-06-20', at('12:00')),
      on('2026-06-19', at('18:00')),
    ]);

    expect(selection.singles).toEqual(['2026-06-19', '2026-06-20']);
    expect(selection.times).toEqual({
      '2026-06-19': { marked: [at('18:00'), at('21:00')], saved: [] },
      '2026-06-20': { marked: [at('12:00')], saved: [] },
    });
  });

  it('saves the time of a day that shares an hour with one said before', () => {
    const selection = marking([
      on('2026-06-19', at('18:00')),
      on('2026-06-19', from('17:00', '19:00')),
    ]);

    expect(selection.times).toEqual({
      '2026-06-19': { marked: [at('18:00')], saved: [from('17:00', '19:00')] },
    });
  });

  it('gives a day said whole and with a time that time alone', () => {
    const selection = marking([on('2026-06-19'), on('2026-06-19', at('21:00'))]);

    expect(selection.singles).toEqual(['2026-06-19']);
    expect(selection.times).toEqual({ '2026-06-19': { marked: [at('21:00')], saved: [] } });
  });

  it('gives a day inside a range marked before its time, the range saved', () => {
    const selection = marking([days('2026-08-03', '2026-08-07'), on('2026-08-05', at('21:00'))]);

    expect(selection).toEqual({
      singles: ['2026-08-05'],
      ranges: [],
      saved: [{ start: '2026-08-03', end: '2026-08-07' }],
      times: { '2026-08-05': { marked: [at('21:00')], saved: [] } },
      timed: true,
    });
  });

  describe('with questions', () => {
    const eight: Question = {
      fragment: 'a las 8',
      dates: ['2026-06-20'],
      morning: at('08:00'),
      afternoon: at('20:00'),
    };
    const fiveToSeven: Question = {
      fragment: 'de 5 a 7',
      dates: ['2026-06-21'],
      morning: from('05:00', '07:00'),
      afternoon: from('17:00', '19:00'),
    };
    const options = [on('2026-06-20', asked(0)), on('2026-06-21', asked(1))];
    const questions = [eight, fiveToSeven];

    it('gives each day the reading picked for its question', () => {
      expect(marking(options, { questions, answers: ['afternoon', 'morning'] }).times).toEqual({
        '2026-06-20': { marked: [at('20:00')], saved: [] },
        '2026-06-21': { marked: [from('05:00', '07:00')], saved: [] },
      });
      expect(marking(options, { questions, answers: ['morning', 'afternoon'] }).times).toEqual({
        '2026-06-20': { marked: [at('08:00')], saved: [] },
        '2026-06-21': { marked: [from('17:00', '19:00')], saved: [] },
      });
    });

    it('asks for times once a question is answered', () => {
      const selection = marking([on('2026-06-20', asked(0))], {
        questions: [eight],
        answers: ['morning'],
      });

      expect(selection.timed).toBe(true);
    });

    it('gives every day of a question the same reading', () => {
      const selection = marking([on('2026-06-20', asked(0)), on('2026-06-27', asked(0))], {
        questions: [{ ...eight, dates: ['2026-06-20', '2026-06-27'] }],
        answers: ['afternoon'],
      });

      expect(selection.times).toEqual({
        '2026-06-20': { marked: [at('20:00')], saved: [] },
        '2026-06-27': { marked: [at('20:00')], saved: [] },
      });
    });

    it('takes once a time that an answer makes like another of the day', () => {
      const selection = marking([on('2026-06-20', at('20:00')), on('2026-06-20', asked(0))], {
        questions: [eight],
        answers: ['afternoon'],
      });

      expect(selection.times).toEqual({ '2026-06-20': { marked: [at('20:00')], saved: [] } });
    });

    it('marks the day without a time when the reading has no such question', () => {
      const selection = marking([on('2026-06-20', asked(3))], {
        questions: [eight],
        answers: ['morning', 'morning', 'morning', 'morning'],
      });

      expect(selection.singles).toEqual(['2026-06-20']);
      expect(selection.times).toEqual({});
      expect(selection.timed).toBe(false);
    });

    it('marks the day without a time while its question has no answer', () => {
      const selection = marking(options, { questions, answers: ['afternoon'] });

      expect(selection.singles).toEqual(['2026-06-20', '2026-06-21']);
      expect(selection.times).toEqual({ '2026-06-20': { marked: [at('20:00')], saved: [] } });
    });

    it('marks the day without a time, and asks for times, when the reading picked is one no event can hold', () => {
      const eightToHalfPast: Question = {
        fragment: 'de 8 a 20:30',
        dates: ['2026-06-20'],
        morning: from('08:00', '20:30'),
        afternoon: from('20:00', '20:30'),
        leftOut: 'afternoon',
      };
      const picked = (answer: HalfOfDay) =>
        marking([on('2026-06-20', asked(0))], { questions: [eightToHalfPast], answers: [answer] });

      expect(picked('afternoon')).toEqual({
        singles: ['2026-06-20'],
        ranges: [],
        saved: [],
        times: {},
        timed: true,
      });
      expect(picked('morning').times).toEqual({
        '2026-06-20': { marked: [from('08:00', '20:30')], saved: [] },
      });
    });
  });

  describe('with what no event can hold', () => {
    const late = { kind: 'range', start: '22:00', end: '03:00', nextDay: true } as const;
    const nineToHalfPast: QuestionNotAsked = {
      fragment: 'de 9 a 9:30',
      dates: ['2026-06-22'],
      morning: from('09:00', '09:30'),
      afternoon: from('21:00', '21:30'),
    };

    it('marks the days as they are given, and asks for times, when a time range was left out', () => {
      const selection = marking([on('2026-06-19'), on('2026-06-20', at('18:00'))], {
        timesLeftOut: [{ time: late, dates: ['2026-06-19'] }],
      });

      expect(selection).toEqual({
        singles: ['2026-06-19', '2026-06-20'],
        ranges: [],
        saved: [],
        times: { '2026-06-20': { marked: [at('18:00')], saved: [] } },
        timed: true,
      });
    });

    it('asks for times when a question was not asked, with nothing to answer', () => {
      const selection = marking([on('2026-06-22')], { questionsNotAsked: [nineToHalfPast] });

      expect(selection.singles).toEqual(['2026-06-22']);
      expect(selection.times).toEqual({});
      expect(selection.timed).toBe(true);
    });
  });
});

describe('the time ranges a reading leaves out of their days', () => {
  const halfPastEight = from('20:00', '20:30');
  const eightToHalfPast: Question = {
    fragment: 'de 8 a 20:30',
    dates: ['2026-06-20', '2026-06-27'],
    morning: from('08:00', '20:30'),
    afternoon: halfPastEight,
    leftOut: 'afternoon',
  };
  const reading = (
    questions: Question[],
    left: DateInterpretation['timesLeftOut'] = [],
  ): DateInterpretation => ({
    options: [],
    questions,
    notices: [],
    timesLeftOut: left,
    questionsNotAsked: [],
  });

  it('are those of the reading while no answer picks a reading no event can hold', () => {
    const late = { kind: 'range', start: '22:00', end: '03:00', nextDay: true } as const;
    const left = [{ time: late, dates: ['2026-06-19'] }];

    expect(timesLeftOut(reading([eightToHalfPast], left), [])).toEqual(left);
    expect(timesLeftOut(reading([eightToHalfPast], left), ['morning'])).toEqual(left);
  });

  it('take in the reading picked that no event can hold, with every day of its question', () => {
    expect(timesLeftOut(reading([eightToHalfPast]), ['afternoon'])).toEqual([
      { time: halfPastEight, dates: ['2026-06-20', '2026-06-27'] },
    ]);
  });

  it('tell a range once with every day it was left out of, said as it is or picked', () => {
    const left = [
      { time: from('09:00', '09:30'), dates: ['2026-06-19'] },
      { time: halfPastEight, dates: ['2026-06-19', '2026-06-20'] },
    ];

    expect(timesLeftOut(reading([eightToHalfPast], left), ['afternoon'])).toEqual([
      { time: from('09:00', '09:30'), dates: ['2026-06-19'] },
      { time: halfPastEight, dates: ['2026-06-19', '2026-06-20', '2026-06-27'] },
    ]);
  });

  it('keep apart a range picked and the same one ending on the next day', () => {
    const nextDay = { ...halfPastEight, nextDay: true } as const;

    expect(
      timesLeftOut(reading([eightToHalfPast], [{ time: nextDay, dates: ['2026-06-19'] }]), [
        'afternoon',
      ]),
    ).toEqual([
      { time: nextDay, dates: ['2026-06-19'] },
      { time: halfPastEight, dates: ['2026-06-20', '2026-06-27'] },
    ]);
  });
});

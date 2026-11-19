import type { DateInterpretation } from '@qando/contracts';
import { NO_DATES } from './date-selection';
import { type HalfOfDay, markingOf } from './reading';

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
const untilNextDay = (start: string, end: string) =>
  ({ kind: 'range', start, end, nextDay: true }) as const;
const asked = (question: number) => ({ kind: 'question', question }) as const;

type Notice = DateInterpretation['notices'][number];

function marking(
  options: readonly ReadOption[],
  {
    questions = [],
    answers = [],
    notices = [],
    timed = false,
  }: {
    questions?: readonly Question[];
    answers?: readonly HalfOfDay[];
    notices?: readonly Notice[];
    timed?: boolean;
  } = {},
) {
  return markingOf(
    { options: [...options], questions: [...questions], notices: [...notices] },
    answers,
    timed,
  );
}

describe('what a reading leaves on the calendar', () => {
  it('is no date when the reading has no option', () => {
    expect(marking([])).toEqual({ selection: NO_DATES, notHeld: [] });
  });

  it('marks each day as a date of its own, in the order of the calendar', () => {
    const { selection, notHeld } = marking([
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
    expect(notHeld).toEqual([]);
  });

  it('marks a range of days as one range, the ranges in the order of the calendar', () => {
    const { selection } = marking([
      days('2026-08-10', '2026-08-12'),
      days('2026-08-03', '2026-08-07'),
    ]);

    expect(selection.ranges).toEqual([
      { start: '2026-08-03', end: '2026-08-07' },
      { start: '2026-08-10', end: '2026-08-12' },
    ]);
    expect(selection.singles).toEqual([]);
    expect(selection.saved).toEqual([]);
  });

  it('keeps two ranges that touch as two', () => {
    const { selection } = marking([
      days('2026-06-20', '2026-06-21'),
      days('2026-06-22', '2026-06-23'),
    ]);

    expect(selection.ranges).toEqual([
      { start: '2026-06-20', end: '2026-06-21' },
      { start: '2026-06-22', end: '2026-06-23' },
    ]);
    expect(selection.saved).toEqual([]);
  });

  it('saves a range said after a day of its own that it takes in, at an end or between', () => {
    for (const day of ['2026-08-03', '2026-08-05', '2026-08-07']) {
      const { selection } = marking([on(day), days('2026-08-03', '2026-08-07')]);

      expect(selection.singles).toEqual([day]);
      expect(selection.ranges).toEqual([]);
      expect(selection.saved).toEqual([{ start: '2026-08-03', end: '2026-08-07' }]);
    }
  });

  it('marks a range beside the days of their own it does not take in', () => {
    const { selection } = marking([
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
      const { selection } = marking([
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
      const { selection } = marking([days('2026-08-03', '2026-08-07'), days(start, end)]);

      expect(selection.ranges).toEqual([{ start: '2026-08-03', end: '2026-08-07' }]);
      expect(selection.saved).toEqual([{ start, end }]);
    }
  });

  it('marks a range over the days of one that was saved before', () => {
    const { selection } = marking([
      days('2026-08-03', '2026-08-07'),
      on('2026-08-04'),
      days('2026-08-06', '2026-08-09'),
    ]);

    expect(selection.singles).toEqual(['2026-08-04']);
    expect(selection.ranges).toEqual([{ start: '2026-08-06', end: '2026-08-09' }]);
    expect(selection.saved).toEqual([{ start: '2026-08-03', end: '2026-08-07' }]);
  });

  it('keeps the saved ranges by first day, then by last day', () => {
    const { selection } = marking([
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

    expect(twice.selection.ranges).toEqual([{ start: '2026-08-03', end: '2026-08-07' }]);
    expect(twice.selection.saved).toEqual([]);

    const saved = marking([
      days('2026-08-03', '2026-08-07'),
      on('2026-08-05'),
      days('2026-08-03', '2026-08-07'),
    ]);

    expect(saved.selection.ranges).toEqual([]);
    expect(saved.selection.saved).toEqual([{ start: '2026-08-03', end: '2026-08-07' }]);
  });

  it('gives a day its time, and asks for times', () => {
    const { selection } = marking([on('2026-06-19', at('21:00')), on('2026-06-20')]);

    expect(selection).toEqual({
      singles: ['2026-06-19', '2026-06-20'],
      ranges: [],
      saved: [],
      times: { '2026-06-19': { marked: [at('21:00')], saved: [] } },
      timed: true,
    });
  });

  it('gives a day a time range', () => {
    const { selection } = marking([on('2026-06-19', from('17:00', '19:30'))]);

    expect(selection.times).toEqual({
      '2026-06-19': { marked: [from('17:00', '19:30')], saved: [] },
    });
  });

  it('leaves times asked for, or not, as they were when it has no time', () => {
    expect(marking([on('2026-06-19')], { timed: true }).selection.timed).toBe(true);
    expect(marking([on('2026-06-19')], { timed: false }).selection.timed).toBe(false);
    expect(marking([on('2026-06-19', at('21:00'))], { timed: true }).selection.timed).toBe(true);
  });

  it('asks for times when a time said of a day was not understood, or ends too late', () => {
    for (const kind of ['timeUnclear', 'tooLate'] as const) {
      const { selection } = marking([on('2026-06-19')], {
        notices: [{ kind, fragment: 'por la tarde', dates: ['2026-06-19'] }],
      });

      expect(selection.times).toEqual({});
      expect(selection.timed).toBe(true);
    }
  });

  it('leaves times as they were when what it tells is not the time of a day', () => {
    const { selection } = marking([on('2026-06-19')], {
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
    const { selection } = marking([
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
    const { selection } = marking([
      on('2026-06-19', at('18:00')),
      on('2026-06-19', from('17:00', '19:00')),
    ]);

    expect(selection.times).toEqual({
      '2026-06-19': { marked: [at('18:00')], saved: [from('17:00', '19:00')] },
    });
  });

  it('gives a day said whole and with a time that time alone', () => {
    const { selection } = marking([on('2026-06-19'), on('2026-06-19', at('21:00'))]);

    expect(selection.singles).toEqual(['2026-06-19']);
    expect(selection.times).toEqual({ '2026-06-19': { marked: [at('21:00')], saved: [] } });
  });

  it('gives a day inside a range marked before its time, the range saved', () => {
    const { selection } = marking([
      days('2026-08-03', '2026-08-07'),
      on('2026-08-05', at('21:00')),
    ]);

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
      expect(
        marking(options, { questions, answers: ['afternoon', 'morning'] }).selection.times,
      ).toEqual({
        '2026-06-20': { marked: [at('20:00')], saved: [] },
        '2026-06-21': { marked: [from('05:00', '07:00')], saved: [] },
      });
      expect(
        marking(options, { questions, answers: ['morning', 'afternoon'] }).selection.times,
      ).toEqual({
        '2026-06-20': { marked: [at('08:00')], saved: [] },
        '2026-06-21': { marked: [from('17:00', '19:00')], saved: [] },
      });
    });

    it('asks for times once a question is answered', () => {
      const { selection } = marking([on('2026-06-20', asked(0))], {
        questions: [eight],
        answers: ['morning'],
      });

      expect(selection.timed).toBe(true);
    });

    it('gives every day of a question the same reading', () => {
      const { selection } = marking([on('2026-06-20', asked(0)), on('2026-06-27', asked(0))], {
        questions: [{ ...eight, dates: ['2026-06-20', '2026-06-27'] }],
        answers: ['afternoon'],
      });

      expect(selection.times).toEqual({
        '2026-06-20': { marked: [at('20:00')], saved: [] },
        '2026-06-27': { marked: [at('20:00')], saved: [] },
      });
    });

    it('takes once a time that an answer makes like another of the day', () => {
      const { selection } = marking([on('2026-06-20', at('20:00')), on('2026-06-20', asked(0))], {
        questions: [eight],
        answers: ['afternoon'],
      });

      expect(selection.times).toEqual({ '2026-06-20': { marked: [at('20:00')], saved: [] } });
    });

    it('marks the day without a time when the reading has no such question', () => {
      const { selection } = marking([on('2026-06-20', asked(3))], {
        questions: [eight],
        answers: ['morning', 'morning', 'morning', 'morning'],
      });

      expect(selection.singles).toEqual(['2026-06-20']);
      expect(selection.times).toEqual({});
      expect(selection.timed).toBe(false);
    });

    it('marks the day without a time while its question has no answer', () => {
      const { selection, notHeld } = marking(options, { questions, answers: ['afternoon'] });

      expect(selection.singles).toEqual(['2026-06-20', '2026-06-21']);
      expect(selection.times).toEqual({ '2026-06-20': { marked: [at('20:00')], saved: [] } });
      expect(notHeld).toEqual([]);
    });
  });

  describe('with a time the hours of a day cannot hold', () => {
    it('marks the day without it and says which time and day, for a range that ends the next day', () => {
      const { selection, notHeld } = marking([on('2026-06-19', untilNextDay('22:00', '03:00'))]);

      expect(selection).toEqual({
        singles: ['2026-06-19'],
        ranges: [],
        saved: [],
        times: {},
        timed: true,
      });
      expect(notHeld).toEqual([{ time: untilNextDay('22:00', '03:00'), dates: ['2026-06-19'] }]);
    });

    it('marks the day without it and says which time and day, for a range within one hour', () => {
      const { selection, notHeld } = marking([on('2026-06-19', from('17:00', '17:45'))]);

      expect(selection.singles).toEqual(['2026-06-19']);
      expect(selection.times).toEqual({});
      expect(selection.timed).toBe(true);
      expect(notHeld).toEqual([{ time: from('17:00', '17:45'), dates: ['2026-06-19'] }]);
    });

    it('says a time said of several days once, with its days in the order they were said', () => {
      const { notHeld } = marking([
        on('2026-06-26', untilNextDay('22:00', '03:00')),
        on('2026-06-19', from('17:00', '17:45')),
        on('2026-06-19', untilNextDay('22:00', '03:00')),
        on('2026-06-20', from('22:00', '23:00')),
      ]);

      expect(notHeld).toEqual([
        { time: untilNextDay('22:00', '03:00'), dates: ['2026-06-26', '2026-06-19'] },
        { time: from('17:00', '17:45'), dates: ['2026-06-19'] },
      ]);
    });

    it('tells a range that ends the next day from one with the same ends that does not', () => {
      const { selection, notHeld } = marking([
        on('2026-06-19', untilNextDay('02:00', '05:00')),
        on('2026-06-20', from('02:00', '05:00')),
      ]);

      expect(notHeld).toEqual([{ time: untilNextDay('02:00', '05:00'), dates: ['2026-06-19'] }]);
      expect(selection.times).toEqual({
        '2026-06-20': { marked: [from('02:00', '05:00')], saved: [] },
      });
    });

    it('keeps the other times of the day, and its answer', () => {
      const { selection, notHeld } = marking(
        [on('2026-06-19', at('18:00')), on('2026-06-19', asked(0))],
        {
          questions: [
            {
              fragment: 'de 10 a 3',
              dates: ['2026-06-19'],
              morning: from('10:00', '15:00'),
              afternoon: untilNextDay('22:00', '03:00'),
            },
          ],
          answers: ['afternoon'],
        },
      );

      expect(selection.times).toEqual({ '2026-06-19': { marked: [at('18:00')], saved: [] } });
      expect(selection.timed).toBe(true);
      expect(notHeld).toEqual([{ time: untilNextDay('22:00', '03:00'), dates: ['2026-06-19'] }]);
    });
  });
});

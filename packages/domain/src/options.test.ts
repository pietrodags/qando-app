import { describe, expect, it } from 'vitest';
import {
  MAX_OPTIONS,
  type OptionProblem,
  type OptionTime,
  type ProposedOption,
  latestOptionDate,
  validateOptions,
} from './options.js';

describe('latestOptionDate', () => {
  it('is the same day twelve months after today', () => {
    expect(latestOptionDate('2026-06-15')).toBe('2027-06-15');
    expect(latestOptionDate('2026-11-16')).toBe('2027-11-16');
  });

  it('keeps the first and the last day of a year', () => {
    expect(latestOptionDate('2026-01-01')).toBe('2027-01-01');
    expect(latestOptionDate('2026-12-31')).toBe('2027-12-31');
  });

  it('is 28 February a year after a 29 February', () => {
    expect(latestOptionDate('2028-02-29')).toBe('2029-02-28');
  });

  it('does not move the days around a 29 February', () => {
    expect(latestOptionDate('2027-02-28')).toBe('2028-02-28');
    expect(latestOptionDate('2028-03-01')).toBe('2029-03-01');
  });
});

describe('MAX_OPTIONS', () => {
  it('is 60 options for an event', () => {
    expect(MAX_OPTIONS).toBe(60);
  });
});

/** Monday 15 June 2026: the last day an event can propose is 15 June 2027. */
const TODAY = '2026-06-15';

/** One date, the whole day or with `time`: "18:15" is one time, "20:00-22:00" a time range. */
function on(date: string, time?: string): ProposedOption {
  return { dates: { kind: 'single', date }, time: time === undefined ? null : timeOf(time) };
}

/** A range of dates, both ends included; `time` only to build an option the rules refuse. */
function from(start: string, end: string, time?: string): ProposedOption {
  return { dates: { kind: 'range', start, end }, time: time === undefined ? null : timeOf(time) };
}

function timeOf(time: string): OptionTime {
  const [start = '', end] = time.split('-');
  return end === undefined ? { kind: 'single', at: start } : { kind: 'range', start, end };
}

/** The days from 1 July 2026 on, one option each. */
function julyDays(count: number): ProposedOption[] {
  return Array.from({ length: count }, (_, day) =>
    on(new Date(Date.UTC(2026, 6, 1 + day)).toISOString().slice(0, 10)),
  );
}

function problemsOf(options: readonly ProposedOption[]): readonly OptionProblem[] {
  const validation = validateOptions(options, TODAY);
  return validation.ok ? [] : validation.problems;
}

describe('validateOptions', () => {
  describe('what an event can propose', () => {
    it('takes a whole day, a range of days, a time and a time range', () => {
      const options = [
        on('2026-07-06'),
        from('2026-07-07', '2026-07-08'),
        on('2026-07-09', '18:15'),
        on('2026-07-09', '20:00-22:00'),
      ];

      expect(validateOptions(options, TODAY)).toEqual({ ok: true, options });
    });

    it('keeps options that overlap as they are', () => {
      const options = [
        from('2026-07-06', '2026-07-09'),
        on('2026-07-08'),
        from('2026-07-08', '2026-07-12'),
        on('2026-07-13', '10:00-12:00'),
        on('2026-07-13', '11:00-13:00'),
      ];

      expect(validateOptions(options, TODAY)).toEqual({ ok: true, options });
    });

    it('takes times on a day that a range of days starts on', () => {
      const options = [from('2026-07-06', '2026-07-09'), on('2026-07-06', '18:00')];

      expect(validateOptions(options, TODAY)).toEqual({ ok: true, options });
    });
  });

  describe('how many options', () => {
    it('refuses an event without options', () => {
      expect(validateOptions([], TODAY)).toEqual({
        ok: false,
        problems: [{ code: 'NO_OPTIONS' }],
      });
    });

    it('takes one option', () => {
      expect(problemsOf([on('2026-07-06')])).toEqual([]);
    });

    it('takes 60 options', () => {
      expect(problemsOf(julyDays(60))).toEqual([]);
    });

    it('refuses 61 options', () => {
      expect(problemsOf(julyDays(61))).toEqual([{ code: 'TOO_MANY_OPTIONS' }]);
    });
  });

  describe('how far its dates can be', () => {
    it('takes today', () => {
      expect(problemsOf([on('2026-06-15')])).toEqual([]);
    });

    it('refuses yesterday', () => {
      expect(problemsOf([on('2026-06-14')])).toEqual([{ code: 'DATE_PAST', index: 0 }]);
    });

    it('takes the same day twelve months later', () => {
      expect(problemsOf([on('2027-06-15')])).toEqual([]);
    });

    it('refuses the day after that one', () => {
      expect(problemsOf([on('2027-06-16')])).toEqual([{ code: 'DATE_TOO_FAR', index: 0 }]);
    });

    it('takes a range of days from today to the last day', () => {
      expect(problemsOf([from('2026-06-15', '2027-06-15')])).toEqual([]);
    });

    it('refuses a range of days that starts before today', () => {
      expect(problemsOf([from('2026-06-14', '2026-06-16')])).toEqual([
        { code: 'DATE_PAST', index: 0 },
      ]);
    });

    it('refuses a range of days that ends after the last day', () => {
      expect(problemsOf([from('2027-06-14', '2027-06-16')])).toEqual([
        { code: 'DATE_TOO_FAR', index: 0 },
      ]);
    });
  });

  describe('ranges of days', () => {
    it('takes a range of two days', () => {
      expect(problemsOf([from('2026-07-06', '2026-07-07')])).toEqual([]);
    });

    it('refuses a range of one day', () => {
      expect(problemsOf([from('2026-07-06', '2026-07-06')])).toEqual([
        { code: 'DATE_RANGE_DEGENERATE', index: 0 },
      ]);
    });

    it('refuses a range that ends before it starts', () => {
      expect(problemsOf([from('2026-07-07', '2026-07-06')])).toEqual([
        { code: 'DATE_RANGE_DEGENERATE', index: 0 },
      ]);
    });

    it('refuses a time on a range of days', () => {
      expect(problemsOf([from('2026-07-06', '2026-07-07', '18:00')])).toEqual([
        { code: 'TIME_ON_DATE_RANGE', index: 0 },
      ]);
    });

    it('refuses a time range on a range of days', () => {
      expect(problemsOf([from('2026-07-06', '2026-07-07', '18:00-20:00')])).toEqual([
        { code: 'TIME_ON_DATE_RANGE', index: 0 },
      ]);
    });
  });

  describe('times', () => {
    it.each(['18:00', '18:15', '18:30', '18:45', '00:00', '23:45'])('takes %s', (time) => {
      expect(problemsOf([on('2026-07-06', time)])).toEqual([]);
    });

    it.each(['18:10', '18:01', '18:14', '18:16', '18:59'])('refuses %s', (time) => {
      expect(problemsOf([on('2026-07-06', time)])).toEqual([
        { code: 'TIME_OFF_QUARTER', index: 0 },
      ]);
    });

    it('refuses a time range that starts off the quarters', () => {
      expect(problemsOf([on('2026-07-06', '18:10-20:00')])).toEqual([
        { code: 'TIME_OFF_QUARTER', index: 0 },
      ]);
    });

    it('refuses a time range that ends off the quarters', () => {
      expect(problemsOf([on('2026-07-06', '18:00-20:10')])).toEqual([
        { code: 'TIME_OFF_QUARTER', index: 0 },
      ]);
    });

    it('says once that a time range is off the quarters at both ends', () => {
      expect(problemsOf([on('2026-07-06', '18:10-20:10')])).toEqual([
        { code: 'TIME_OFF_QUARTER', index: 0 },
      ]);
    });

    it('takes a time range of a quarter of an hour', () => {
      expect(problemsOf([on('2026-07-06', '20:00-20:15')])).toEqual([]);
    });

    it('refuses a time range that ends when it starts', () => {
      expect(problemsOf([on('2026-07-06', '20:00-20:00')])).toEqual([
        { code: 'TIME_RANGE_DEGENERATE', index: 0 },
      ]);
    });

    it('refuses a time range that ends before it starts', () => {
      expect(problemsOf([on('2026-07-06', '20:00-19:00')])).toEqual([
        { code: 'TIME_RANGE_DEGENERATE', index: 0 },
      ]);
    });
  });

  describe('a day and its times', () => {
    it('refuses the whole day of a date that has a time', () => {
      expect(problemsOf([on('2026-07-06'), on('2026-07-06', '18:00')])).toEqual([
        { code: 'WHOLE_DAY_WITH_TIMES', index: 0 },
      ]);
    });

    it('refuses it wherever the whole day is in the list, also with a time range', () => {
      expect(
        problemsOf([on('2026-07-07'), on('2026-07-06', '18:00-20:00'), on('2026-07-06')]),
      ).toEqual([{ code: 'WHOLE_DAY_WITH_TIMES', index: 2 }]);
    });
  });

  describe('options alike', () => {
    it('does not take a day and its 0:00 for options alike', () => {
      expect(problemsOf([on('2026-07-06'), on('2026-07-06', '00:00')])).toEqual([
        { code: 'WHOLE_DAY_WITH_TIMES', index: 0 },
      ]);
    });

    it('refuses the second of two equal whole days', () => {
      expect(problemsOf([on('2026-07-06'), on('2026-07-06')])).toEqual([
        { code: 'DUPLICATE', index: 1 },
      ]);
    });

    it('refuses every repetition of an option', () => {
      expect(
        problemsOf([on('2026-07-06'), on('2026-07-07'), on('2026-07-06'), on('2026-07-06')]),
      ).toEqual([
        { code: 'DUPLICATE', index: 2 },
        { code: 'DUPLICATE', index: 3 },
      ]);
    });

    it('refuses two equal ranges of days, two equal times and two equal time ranges', () => {
      expect(
        problemsOf([
          from('2026-07-06', '2026-07-09'),
          from('2026-07-06', '2026-07-09'),
          on('2026-07-10', '18:00'),
          on('2026-07-10', '18:00'),
          on('2026-07-10', '20:00-22:00'),
          on('2026-07-10', '20:00-22:00'),
        ]),
      ).toEqual([
        { code: 'DUPLICATE', index: 1 },
        { code: 'DUPLICATE', index: 3 },
        { code: 'DUPLICATE', index: 5 },
      ]);
    });

    it('takes options that share only a part of what they say', () => {
      expect(
        problemsOf([
          from('2026-07-06', '2026-07-08'),
          from('2026-07-06', '2026-07-09'),
          from('2026-07-05', '2026-07-09'),
          on('2026-07-10', '18:00'),
          on('2026-07-11', '18:00'),
          on('2026-07-10', '18:00-20:00'),
          on('2026-07-10', '18:00-21:00'),
          on('2026-07-10', '17:00-21:00'),
          on('2026-07-10', '00:00'),
          on('2026-07-12', '00:00-02:00'),
          from('2026-07-12', '2026-07-13'),
        ]),
      ).toEqual([]);
    });
  });

  describe('several problems', () => {
    it('lists the problems of the list first, then each option’s in the list’s order', () => {
      const options = [...julyDays(61), on('2026-06-14'), on('2027-06-16'), on('2026-07-01')];

      expect(problemsOf(options)).toEqual([
        { code: 'TOO_MANY_OPTIONS' },
        { code: 'DATE_PAST', index: 61 },
        { code: 'DATE_TOO_FAR', index: 62 },
        { code: 'DUPLICATE', index: 63 },
      ]);
    });

    it('lists every problem of one option: its dates, its time, then the options like it', () => {
      const option = from('2026-06-14', '2026-06-14', '18:10-18:00');
      const beyond = from('2027-06-16', '2027-06-16');

      expect(problemsOf([option, option, beyond])).toEqual([
        { code: 'DATE_PAST', index: 0 },
        { code: 'DATE_RANGE_DEGENERATE', index: 0 },
        { code: 'TIME_ON_DATE_RANGE', index: 0 },
        { code: 'TIME_OFF_QUARTER', index: 0 },
        { code: 'TIME_RANGE_DEGENERATE', index: 0 },
        { code: 'DATE_PAST', index: 1 },
        { code: 'DATE_RANGE_DEGENERATE', index: 1 },
        { code: 'TIME_ON_DATE_RANGE', index: 1 },
        { code: 'TIME_OFF_QUARTER', index: 1 },
        { code: 'TIME_RANGE_DEGENERATE', index: 1 },
        { code: 'DUPLICATE', index: 1 },
        { code: 'DATE_TOO_FAR', index: 2 },
        { code: 'DATE_RANGE_DEGENERATE', index: 2 },
      ]);
    });

    it('says a whole day with times before saying it is repeated', () => {
      expect(problemsOf([on('2026-07-06'), on('2026-07-06'), on('2026-07-06', '18:00')])).toEqual([
        { code: 'WHOLE_DAY_WITH_TIMES', index: 0 },
        { code: 'WHOLE_DAY_WITH_TIMES', index: 1 },
        { code: 'DUPLICATE', index: 1 },
      ]);
    });
  });

  describe('the order of the options', () => {
    /** The valid options in order, whatever the order they are given in. */
    function inOrder(options: readonly ProposedOption[]): readonly ProposedOption[] {
      const validation = validateOptions(options.toReversed(), TODAY);
      const again = validateOptions(options, TODAY);
      expect(again).toEqual(validation);
      return validation.ok ? validation.options : [];
    }

    it('puts the options by their first day', () => {
      const options = [
        on('2026-07-06'),
        from('2026-07-07', '2026-07-20'),
        on('2026-07-08', '09:00'),
        on('2026-07-09'),
        on('2027-01-02'),
      ];

      expect(inOrder(options)).toEqual(options);
    });

    it('puts the times of a day by when they start, a time before a range from it', () => {
      const options = [
        on('2026-07-06', '10:00'),
        on('2026-07-06', '10:00-12:00'),
        on('2026-07-06', '10:00-13:00'),
        on('2026-07-06', '10:15-10:30'),
        on('2026-07-06', '18:00'),
      ];

      expect(inOrder(options)).toEqual(options);
    });

    it('puts a day before the ranges of days from it, and those by their last day', () => {
      const options = [
        on('2026-07-06'),
        from('2026-07-06', '2026-07-08'),
        from('2026-07-06', '2026-07-10'),
        on('2026-07-07', '08:00'),
      ];

      expect(inOrder(options)).toEqual(options);
    });

    it('counts a range of days from 0:00 of its first day', () => {
      const options = [
        on('2026-07-06', '00:00'),
        from('2026-07-06', '2026-07-09'),
        on('2026-07-06', '00:00-02:00'),
        on('2026-07-06', '00:15'),
        on('2026-07-06', '10:00-12:00'),
      ];

      expect(inOrder(options)).toEqual(options);
    });

    it('leaves the list it is given as it was', () => {
      const options = [on('2026-07-07'), on('2026-07-06')];

      validateOptions(options, TODAY);

      expect(options).toEqual([on('2026-07-07'), on('2026-07-06')]);
    });
  });
});

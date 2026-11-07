import type { Option } from '@qando/contracts';
import { type CalendarDay, type CalendarMonth, calendarMonths, shapeIn } from './calendar-months';

let nextId = 0;

function single(date: string): Option {
  nextId += 1;
  return { id: `option-${String(nextId)}`, dates: { kind: 'single', date }, time: null };
}

function range(start: string, end: string): Option {
  nextId += 1;
  return { id: `option-${String(nextId)}`, dates: { kind: 'range', start, end }, time: null };
}

function firstMonth(options: readonly Option[]): CalendarMonth {
  const [month] = calendarMonths(options);
  if (!month) throw new Error('No month to draw');
  return month;
}

function day(days: readonly CalendarDay[], date: string): CalendarDay | undefined {
  return days.find((candidate) => candidate.date === date);
}

describe('calendarMonths', () => {
  it('shows one month per month with a proposed date, in order, skipping empty months', () => {
    const months = calendarMonths([single('2026-07-06'), single('2026-09-01')]);

    expect(months.map(({ year, month }) => [year, month])).toEqual([
      [2026, 7],
      [2026, 9],
    ]);
  });

  it('shows no month when nothing is proposed', () => {
    expect(calendarMonths([])).toEqual([]);
  });

  it('lists every day of the month, after blanks for the weekdays before the 1st (Monday first)', () => {
    // 1 July 2026 is a Wednesday: Monday and Tuesday are blank.
    const [july] = calendarMonths([single('2026-07-06')]);

    expect(july?.leadingBlanks).toBe(2);
    expect(july?.days.map(({ day }) => day)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(july?.days[0]?.date).toBe('2026-07-01');
    expect(july?.days[30]?.date).toBe('2026-07-31');
  });

  it('counts February days in leap and common years, and needs no blank when the 1st is a Monday', () => {
    const [february2028] = calendarMonths([single('2028-02-10')]);
    const [june2026] = calendarMonths([single('2026-06-10')]);

    expect(february2028?.days).toHaveLength(29);
    expect(june2026?.leadingBlanks).toBe(0);
    // 1 February 2026 is a Sunday: six blanks.
    expect(calendarMonths([single('2026-02-10')])[0]?.leadingBlanks).toBe(6);
  });

  it('links each proposed day to its option and leaves the other days without one', () => {
    const sixth = single('2026-07-06');
    const [july] = calendarMonths([sixth]);

    expect(day(july?.days ?? [], '2026-07-06')?.optionIds).toEqual([sixth.id]);
    expect(day(july?.days ?? [], '2026-07-07')?.optionIds).toEqual([]);
  });

  it('keeps consecutive single dates apart: only a range joins its days', () => {
    const [july] = calendarMonths([single('2026-07-06'), single('2026-07-07')]);
    const sixth = day(july?.days ?? [], '2026-07-06');

    // Monday 6 starts a row: a single date there is still not cut.
    expect(sixth).toMatchObject({
      joinsPrevious: false,
      joinsNext: false,
      cutBefore: false,
      cutAfter: false,
    });
    expect(day(july?.days ?? [], '2026-07-07')).toMatchObject({
      joinsPrevious: false,
      joinsNext: false,
    });
  });

  it('joins the days of a range inside a week row', () => {
    const party = range('2026-07-07', '2026-07-09');
    const days = calendarMonths([party])[0]?.days ?? [];

    expect(day(days, '2026-07-07')).toMatchObject({
      optionIds: [party.id],
      joinsPrevious: false,
      joinsNext: true,
      cutBefore: false,
      cutAfter: false,
    });
    expect(day(days, '2026-07-08')).toMatchObject({ joinsPrevious: true, joinsNext: true });
    expect(day(days, '2026-07-09')).toMatchObject({ joinsPrevious: true, joinsNext: false });
  });

  it('cuts a range where it wraps to the next week row', () => {
    // Saturday 11 → Monday 13 July 2026: Sunday ends a row, Monday starts the next.
    const days = calendarMonths([range('2026-07-11', '2026-07-13')])[0]?.days ?? [];

    expect(day(days, '2026-07-12')).toMatchObject({
      joinsPrevious: true,
      joinsNext: false,
      cutAfter: true,
    });
    expect(day(days, '2026-07-13')).toMatchObject({
      joinsPrevious: false,
      joinsNext: false,
      cutBefore: true,
      cutAfter: false,
    });
  });

  it('tells the middle days of a range from its first and last days, across rows and months', () => {
    // Saturday 11 → Monday 13 July 2026 wraps a row; 31 July → 1 August changes the month.
    const days = calendarMonths([range('2026-07-11', '2026-07-13')])[0]?.days ?? [];
    const months = calendarMonths([range('2026-07-30', '2026-08-02')]);
    const july = months[0]?.days ?? [];
    const august = months[1]?.days ?? [];

    expect(['11', '12', '13'].map((d) => day(days, `2026-07-${d}`)?.middle)).toEqual([
      false,
      true,
      false,
    ]);
    expect(day(july, '2026-07-31')?.middle).toBe(true);
    expect(day(august, '2026-08-01')?.middle).toBe(true);
    expect(day(august, '2026-08-02')?.middle).toBe(false);
    expect(day(days, '2026-07-14')?.middle).toBe(false);
  });

  it('shows a range across two months in both, cut at the month change', () => {
    const months = calendarMonths([range('2026-07-30', '2026-08-02')]);
    const july = months[0]?.days ?? [];
    const august = months[1]?.days ?? [];

    expect(months.map(({ month }) => month)).toEqual([7, 8]);
    expect(day(july, '2026-07-31')).toMatchObject({ joinsNext: false, cutAfter: true });
    expect(day(august, '2026-08-01')).toMatchObject({ joinsPrevious: false, cutBefore: true });
    expect(day(august, '2026-08-02')).toMatchObject({ joinsPrevious: true, cutAfter: false });
  });

  it('adds every month a long range crosses, even one with only middle days', () => {
    const months = calendarMonths([range('2026-07-30', '2026-09-02')]);

    expect(months.map(({ month }) => month)).toEqual([7, 8, 9]);
  });

  it('crosses the year end', () => {
    const months = calendarMonths([range('2026-12-31', '2027-01-01')]);

    expect(months.map(({ year, month }) => [year, month])).toEqual([
      [2026, 12],
      [2027, 1],
    ]);
  });
  it('links a day with times to every option of that day, in order', () => {
    const morning: Option = {
      id: 'morning',
      dates: { kind: 'single', date: '2026-07-06' },
      time: { kind: 'single', at: '09:00' },
    };
    const evening: Option = {
      id: 'evening',
      dates: { kind: 'single', date: '2026-07-06' },
      time: { kind: 'range', start: '18:00', end: '20:00' },
    };
    const days = calendarMonths([morning, evening])[0]?.days ?? [];

    expect(day(days, '2026-07-06')).toMatchObject({
      optionIds: ['morning', 'evening'],
      joinsPrevious: false,
      joinsNext: false,
    });
  });

  it('keeps a single day apart from a range that only touches it', () => {
    const party = range('2026-07-07', '2026-07-09');
    const before = single('2026-07-06');
    const after = single('2026-07-10');
    const days = calendarMonths([before, party, after])[0]?.days ?? [];

    expect(day(days, '2026-07-06')?.optionIds).toEqual([before.id]);
    expect(day(days, '2026-07-07')?.optionIds).toEqual([party.id]);
    expect(day(days, '2026-07-10')?.optionIds).toEqual([after.id]);
    expect(calendarMonths([before, party, after])[0]?.chips).toEqual([]);
  });

  describe('options that overlap', () => {
    it('outlines every day of the overlap, answered by none of them alone', () => {
      const first = range('2026-07-07', '2026-07-10');
      const second = range('2026-07-08', '2026-07-11');
      const days = calendarMonths([first, second])[0]?.days ?? [];

      expect(day(days, '2026-07-07')).toMatchObject({
        optionIds: [],
        overlaps: [{ optionIds: [first.id], start: '2026-07-07', end: '2026-07-10' }],
      });
      expect(day(days, '2026-07-09')?.overlaps.map(({ optionIds }) => optionIds)).toEqual([
        [first.id],
        [second.id],
      ]);
      expect(day(days, '2026-07-11')?.overlaps.map(({ optionIds }) => optionIds)).toEqual([
        [second.id],
      ]);
      expect(day(days, '2026-07-06')?.overlaps).toEqual([]);
      expect(day(days, '2026-07-12')?.overlaps).toEqual([]);
    });

    it('joins the outline over the whole overlap, cut where it wraps a row', () => {
      // Friday 10 → Monday 13 and Saturday 11 → Tuesday 14 July 2026: the row ends on Sunday 12.
      const days =
        calendarMonths([range('2026-07-10', '2026-07-13'), range('2026-07-11', '2026-07-14')])[0]
          ?.days ?? [];

      expect(day(days, '2026-07-10')).toMatchObject({ joinsPrevious: false, joinsNext: true });
      expect(day(days, '2026-07-12')).toMatchObject({ joinsPrevious: true, cutAfter: true });
      expect(day(days, '2026-07-13')).toMatchObject({ cutBefore: true, joinsNext: true });
      expect(day(days, '2026-07-14')).toMatchObject({ joinsPrevious: true, joinsNext: false });
    });

    it('offers one chip per option of the overlap, by start date, a single date first', () => {
      const long = range('2026-07-07', '2026-07-10');
      const lone = single('2026-07-07');
      const late = range('2026-07-08', '2026-07-11');
      const apart = single('2026-07-20');
      const [july] = calendarMonths([long, lone, late, apart]);

      expect(july?.chips).toEqual([
        { optionIds: [lone.id], start: '2026-07-07', end: '2026-07-07' },
        { optionIds: [long.id], start: '2026-07-07', end: '2026-07-10' },
        { optionIds: [late.id], start: '2026-07-08', end: '2026-07-11' },
      ]);
    });

    it('answers a day with times inside a range by one chip for all of its times', () => {
      const party = range('2026-07-07', '2026-07-09');
      const morning: Option = {
        id: 'morning',
        dates: { kind: 'single', date: '2026-07-08' },
        time: { kind: 'single', at: '09:00' },
      };
      const evening: Option = { ...morning, id: 'evening', time: { kind: 'single', at: '20:00' } };
      const [july] = calendarMonths([party, morning, evening]);

      expect(july?.chips.map(({ optionIds }) => optionIds)).toEqual([
        [party.id],
        ['morning', 'evening'],
      ]);
    });

    it('keeps two separate overlaps apart, and chains options that overlap one another', () => {
      // 1–3 overlaps 3–5, which overlaps 5–6: one outline from 1 to 6. 20–21 and 21 are another.
      const [july] = calendarMonths([
        range('2026-07-01', '2026-07-03'),
        range('2026-07-03', '2026-07-05'),
        range('2026-07-05', '2026-07-06'),
        range('2026-07-20', '2026-07-21'),
        single('2026-07-21'),
      ]);
      const days = july?.days ?? [];

      expect(july?.chips).toHaveLength(5);
      // Thursday 2 → Friday 3 → Saturday 4 is inside one week row.
      expect(day(days, '2026-07-04')).toMatchObject({ joinsPrevious: true, joinsNext: true });
      expect(day(days, '2026-07-20')).toMatchObject({ joinsPrevious: false, joinsNext: true });
      expect(day(days, '2026-07-21')).toMatchObject({ joinsPrevious: true, joinsNext: false });
    });

    it('offers the chips of an overlap in every month it touches, and only there', () => {
      const [july, august, september] = calendarMonths([
        range('2026-07-30', '2026-08-02'),
        single('2026-08-01'),
        single('2026-09-10'),
      ]);

      expect(july?.chips).toHaveLength(2);
      expect(august?.chips).toHaveLength(2);
      expect(september?.chips).toEqual([]);
    });
  });

  describe('shapeIn', () => {
    it('joins the days of a choice in the month as a range would be, and leaves out the rest', () => {
      // Saturday 11 → Monday 13 July 2026 wraps a row.
      const july = firstMonth([range('2026-07-11', '2026-07-13'), single('2026-07-12')]);
      const shape = shapeIn(july, { optionIds: [], start: '2026-07-11', end: '2026-07-13' });

      expect([...shape.keys()]).toEqual(['2026-07-11', '2026-07-12', '2026-07-13']);
      expect(shape.get('2026-07-11')).toEqual({
        joinsPrevious: false,
        joinsNext: true,
        cutBefore: false,
        cutAfter: false,
        middle: false,
      });
      expect(shape.get('2026-07-12')).toMatchObject({ cutAfter: true, middle: true });
      expect(shape.get('2026-07-13')).toMatchObject({ cutBefore: true, joinsNext: false });
    });

    it('keeps only the days of the month', () => {
      const july = firstMonth([range('2026-07-30', '2026-08-02'), single('2026-07-31')]);
      const shape = shapeIn(july, { optionIds: [], start: '2026-07-30', end: '2026-08-02' });

      expect([...shape.keys()]).toEqual(['2026-07-30', '2026-07-31']);
      expect(shape.get('2026-07-31')).toMatchObject({ cutAfter: true });
    });
  });
});

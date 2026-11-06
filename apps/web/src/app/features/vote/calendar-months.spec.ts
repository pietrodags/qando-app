import type { Option } from '@qando/contracts';
import { type CalendarDay, calendarMonths } from './calendar-months';

let nextId = 0;

function single(date: string): Option {
  nextId += 1;
  return { id: `option-${String(nextId)}`, dates: { kind: 'single', date }, time: null };
}

function range(start: string, end: string): Option {
  nextId += 1;
  return { id: `option-${String(nextId)}`, dates: { kind: 'range', start, end }, time: null };
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

  it('gives a day in two overlapping options to the first one, until overlaps get their design', () => {
    const long = range('2026-07-07', '2026-07-10');
    const days = calendarMonths([long, range('2026-07-08', '2026-07-11')])[0]?.days ?? [];

    expect(day(days, '2026-07-08')?.optionIds).toEqual([long.id]);
  });
});

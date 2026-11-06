import type { Option } from '@qando/contracts';

/** One day of a month grid. Dates are calendar values in the event's time zone, as `YYYY-MM-DD`. */
export interface CalendarDay {
  readonly date: string;
  readonly day: number;
  /** The option the participant answers by tapping this day; `null` when it was not proposed. */
  readonly optionId: string | null;
  /** Drawn joined to the day before / after: both are in the same range and on the same row. */
  readonly joinsPrevious: boolean;
  readonly joinsNext: boolean;
  /** The range goes on before / after this day, but on another week row or in another month. */
  readonly cutBefore: boolean;
  readonly cutAfter: boolean;
}

/** A month to draw: blanks for the weekdays before the 1st (Monday first), then every day. */
export interface CalendarMonth {
  readonly year: number;
  /** 1 = January. */
  readonly month: number;
  readonly leadingBlanks: number;
  readonly days: readonly CalendarDay[];
}

interface Placement {
  readonly optionId: string;
  readonly start: string;
  readonly end: string;
}

/**
 * The months the participant pages through: every month with at least one proposed day, in
 * order. A single date is a day of its own, even next to another one; only a range joins its
 * days, and is cut where it wraps to the next week row or month.
 */
export function calendarMonths(options: readonly Option[]): CalendarMonth[] {
  const placements = new Map<string, Placement>();
  for (const option of options) {
    const { start, end } =
      option.dates.kind === 'single'
        ? { start: option.dates.date, end: option.dates.date }
        : option.dates;
    for (const date of datesFrom(start, end)) {
      // Options that overlap are drawn by their own design (a later change); the first one wins.
      if (!placements.has(date)) placements.set(date, { optionId: option.id, start, end });
    }
  }
  // Options come in chronological order, so their months do too.
  const months = [...new Set([...placements.keys()].map((date) => date.slice(0, 7)))];
  return months.map((yearMonth) => monthOf(yearMonth, placements));
}

function monthOf(yearMonth: string, placements: ReadonlyMap<string, Placement>): CalendarMonth {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = Array.from({ length }, (_, index) => {
    const date = `${yearMonth}-${String(index + 1).padStart(2, '0')}`;
    const placement = placements.get(date);
    const weekday = mondayFirstWeekday(date);
    const inRangeBefore = placement !== undefined && date > placement.start;
    const inRangeAfter = placement !== undefined && date < placement.end;
    const rowStarts = weekday === 0 || index === 0;
    const rowEnds = weekday === 6 || index === length - 1;
    return {
      date,
      day: index + 1,
      optionId: placement?.optionId ?? null,
      joinsPrevious: inRangeBefore && !rowStarts,
      joinsNext: inRangeAfter && !rowEnds,
      cutBefore: inRangeBefore && rowStarts,
      cutAfter: inRangeAfter && rowEnds,
    };
  });
  return { year, month, leadingBlanks: mondayFirstWeekday(`${yearMonth}-01`), days };
}

const DAY_MS = 86_400_000;

function datesFrom(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let time = Date.parse(start); time <= Date.parse(end); time += DAY_MS) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

/** 0 = Monday … 6 = Sunday. A date-only ISO string is read as UTC, as it is shown. */
function mondayFirstWeekday(date: string): number {
  return (new Date(Date.parse(date)).getUTCDay() + 6) % 7;
}

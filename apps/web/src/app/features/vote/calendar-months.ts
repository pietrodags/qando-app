import type { Option } from '@qando/contracts';

/**
 * What one tap answers: a date with every one of its times, or a range. Dates are calendar
 * values in the event's time zone, as `YYYY-MM-DD`.
 */
export interface DateChoice {
  readonly optionIds: readonly string[];
  readonly start: string;
  readonly end: string;
}

/** How a day joins its neighbours in the shape of a range, an overlap or a painted choice. */
export interface Shape {
  /** Drawn joined to the day before / after: both are in the same shape and on the same row. */
  readonly joinsPrevious: boolean;
  readonly joinsNext: boolean;
  /** The shape goes on before / after this day, but on another week row or in another month. */
  readonly cutBefore: boolean;
  readonly cutAfter: boolean;
  /** Inside the shape, neither its first nor its last day: drawn fainter, so the ends stand out. */
  readonly middle: boolean;
}

/** One day of a month grid. */
export interface CalendarDay extends Shape {
  readonly date: string;
  readonly day: number;
  /**
   * The options the participant answers by tapping this day: its one option, or every time of
   * the day; none when it was not proposed or is in options that overlap.
   */
  readonly optionIds: readonly string[];
  /**
   * The choices on this day when it is in options that overlap: the day is only outlined, and
   * each choice is answered by its chip. Empty otherwise.
   */
  readonly overlaps: readonly DateChoice[];
}

/** A month to draw: blanks for the weekdays before the 1st (Monday first), then every day. */
export interface CalendarMonth {
  readonly year: number;
  /** 1 = January. */
  readonly month: number;
  readonly leadingBlanks: number;
  readonly days: readonly CalendarDay[];
  /**
   * One chip per choice of every overlap that touches the month, by start date, a single date
   * before a range that starts with it.
   */
  readonly chips: readonly DateChoice[];
}

/** The choices that share a day, directly or through one another, and the days they cover. */
interface Overlap {
  readonly choices: readonly DateChoice[];
  readonly start: string;
  readonly end: string;
}

/** What a proposed day is part of: one choice alone, or an overlap. */
type Placement =
  | { readonly kind: 'choice'; readonly choice: DateChoice }
  | { readonly kind: 'overlap'; readonly overlap: Overlap };

/**
 * The months the participant pages through: every month with at least one proposed day, in
 * order. A single date is a day of its own, even next to another one; only a range joins its
 * days, and is cut where it wraps to the next week row or month. Options that share a day are
 * drawn together as one outline and answered by their chips.
 */
export function calendarMonths(options: readonly Option[]): CalendarMonth[] {
  const placements = new Map<string, Placement>();
  for (const overlap of overlapsOf(choicesOf(options))) {
    const [only] = overlap.choices;
    const placement: Placement =
      overlap.choices.length === 1 && only
        ? { kind: 'choice', choice: only }
        : { kind: 'overlap', overlap };
    for (const date of datesFrom(overlap.start, overlap.end)) placements.set(date, placement);
  }
  // The overlaps come in chronological order, so their months do too.
  const months = [...new Set([...placements.keys()].map((date) => date.slice(0, 7)))];
  return months.map((yearMonth) => monthOf(yearMonth, placements));
}

/**
 * The shape of a choice inside a month, by date: how each of its days in the month joins the
 * next, as a range is drawn. Days of the choice outside the month are left out.
 */
export function shapeIn(month: CalendarMonth, choice: DateChoice): ReadonlyMap<string, Shape> {
  const shape = new Map<string, Shape>();
  const grid = { leadingBlanks: month.leadingBlanks, length: month.days.length };
  for (const { date } of month.days) {
    if (date >= choice.start && date <= choice.end) {
      shape.set(date, shapeOf(date, choice.start, choice.end, grid));
    }
  }
  return shape;
}

/** Each date with all of its times, and each range: by start date, a single date first. */
function choicesOf(options: readonly Option[]): DateChoice[] {
  const singles = new Map<string, string[]>();
  const ranges: DateChoice[] = [];
  for (const { id, dates } of options) {
    if (dates.kind === 'single') {
      singles.set(dates.date, [...(singles.get(dates.date) ?? []), id]);
    } else {
      ranges.push({ optionIds: [id], start: dates.start, end: dates.end });
    }
  }
  const dated = [...singles].map(([date, optionIds]) => ({ optionIds, start: date, end: date }));
  return [...dated, ...ranges].sort(
    (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
  );
}

/**
 * The choices grouped by the days they share. Sorted by start date, a choice overlaps the
 * group so far exactly when it starts before the group ends.
 */
function overlapsOf(choices: readonly DateChoice[]): Overlap[] {
  const overlaps: { choices: DateChoice[]; start: string; end: string }[] = [];
  for (const choice of choices) {
    const last = overlaps.at(-1);
    if (last && choice.start <= last.end) {
      last.choices.push(choice);
      if (choice.end > last.end) last.end = choice.end;
    } else {
      overlaps.push({ choices: [choice], start: choice.start, end: choice.end });
    }
  }
  return overlaps;
}

function monthOf(yearMonth: string, placements: ReadonlyMap<string, Placement>): CalendarMonth {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const grid = { leadingBlanks: mondayFirstWeekday(`${yearMonth}-01`), length };
  const chips = new Set<DateChoice>();
  const days = Array.from({ length }, (_, index): CalendarDay => {
    const date = `${yearMonth}-${String(index + 1).padStart(2, '0')}`;
    const placement = placements.get(date);
    const base = { date, day: index + 1 };
    if (!placement)
      return { ...base, ...shapeOf(date, date, date, grid), optionIds: [], overlaps: [] };
    if (placement.kind === 'choice') {
      const { choice } = placement;
      return {
        ...base,
        ...shapeOf(date, choice.start, choice.end, grid),
        optionIds: choice.optionIds,
        overlaps: [],
      };
    }
    const { overlap } = placement;
    for (const choice of overlap.choices) chips.add(choice);
    return {
      ...base,
      ...shapeOf(date, overlap.start, overlap.end, grid),
      optionIds: [],
      overlaps: overlap.choices.filter(({ start, end }) => start <= date && date <= end),
    };
  });
  return { year, month, leadingBlanks: grid.leadingBlanks, days, chips: [...chips] };
}

/** The shape of a day in a span of days, in a month of the given length and first weekday. */
function shapeOf(
  date: string,
  start: string,
  end: string,
  { leadingBlanks, length }: { readonly leadingBlanks: number; readonly length: number },
): Shape {
  const index = Number(date.slice(8, 10)) - 1;
  const weekday = (leadingBlanks + index) % 7;
  const before = date > start;
  const after = date < end;
  const rowStarts = weekday === 0 || index === 0;
  const rowEnds = weekday === 6 || index === length - 1;
  return {
    joinsPrevious: before && !rowStarts,
    joinsNext: after && !rowEnds,
    cutBefore: before && rowStarts,
    cutAfter: after && rowEnds,
    middle: before && after,
  };
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

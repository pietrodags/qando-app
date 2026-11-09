import type { Option } from '@qando/contracts';
import { type Answers, dayState } from './answers';

/** One option of a column, as the organizer chose its time: `null` is the whole day. */
export interface TimeBlock {
  readonly optionId: string;
  readonly time: Option['time'];
}

/** A day, or a range of days, with the options the voter answers in step 3. */
export interface TimeColumn {
  /** Its days, which no other column has: "2026-07-06", or "2026-07-11/2026-07-12" for a range. */
  readonly key: string;
  readonly dates: Option['dates'];
  readonly blocks: readonly TimeBlock[];
  /** How many blocks show before the column scrolls; `null` when they all show. */
  readonly fold: number | null;
}

/** What step 3 shows at a time: some columns and the years they fall in, in order. */
export interface TimePage {
  readonly columns: readonly TimeColumn[];
  readonly years: readonly number[];
}

/**
 * The pages of step 3: one column per day (or range of days) the voter can still make, in the
 * event's order, with its options as the organizer chose them; `perPage` columns to a page.
 * A day whose every option is unavailable, as step 2 marks it, is left out.
 */
export function timePages(
  options: readonly Option[],
  answers: Answers,
  perPage: number,
): TimePage[] {
  const columns = columnsOf(options).filter(
    ({ blocks }) =>
      dayState(
        answers,
        blocks.map(({ optionId }) => optionId),
      ) === 'available',
  );
  return Array.from({ length: Math.ceil(columns.length / perPage) }, (_, index) => {
    const shown = columns.slice(index * perPage, (index + 1) * perPage);
    return { columns: shown, years: yearsOf(shown) };
  });
}

/** A column shows blocks worth this many units, and then scrolls. */
const FOLD_UNITS = 10;

function columnsOf(options: readonly Option[]): TimeColumn[] {
  const byDates = new Map<string, { key: string; dates: Option['dates']; blocks: TimeBlock[] }>();
  for (const { id, dates, time } of options) {
    const key = dates.kind === 'single' ? dates.date : `${dates.start}/${dates.end}`;
    const column = byDates.get(key) ?? { key, dates, blocks: [] };
    column.blocks.push({ optionId: id, time });
    byDates.set(key, column);
  }
  // Options come in chronological order, and a map keeps the order its keys first came in.
  return [...byDates.values()].map((column) => ({ ...column, fold: foldOf(column.blocks) }));
}

/**
 * The blocks a column shows before it scrolls: those that fit in 10 units (a time 1, a range of
 * times 2, the whole day 3, as tall as they are drawn). A column of 11 units that ends in a time
 * still shows whole: one more short block is better than an arrow to reach it.
 */
function foldOf(blocks: readonly TimeBlock[]): number | null {
  const sizes = blocks.map(({ time }) => unitsOf(time));
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total <= FOLD_UNITS) return null;
  if (total === FOLD_UNITS + 1 && sizes.at(-1) === 1) return null;
  let used = 0;
  return sizes.findIndex((size) => (used += size) > FOLD_UNITS);
}

function unitsOf(time: TimeBlock['time']): number {
  if (time === null) return 3;
  return time.kind === 'single' ? 1 : 2;
}

function yearsOf(columns: readonly TimeColumn[]): number[] {
  const years = columns.flatMap(({ dates }) =>
    dates.kind === 'single' ? [dates.date] : [dates.start, dates.end],
  );
  return [...new Set(years.map((date) => Number(date.slice(0, 4))))];
}

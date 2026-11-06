import type { Option } from '@qando/contracts';
import { type Answers, dayState } from './answers';

/** One option of a column, as the organizer chose its time: `null` is the whole day. */
export interface TimeBlock {
  readonly optionId: string;
  readonly time: Option['time'];
}

/** A day, or a range of days, with the options the voter answers in step 3. */
export interface TimeColumn {
  readonly dates: Option['dates'];
  readonly blocks: readonly TimeBlock[];
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

function columnsOf(options: readonly Option[]): TimeColumn[] {
  const byDates = new Map<string, { dates: Option['dates']; blocks: TimeBlock[] }>();
  for (const { id, dates, time } of options) {
    const key = JSON.stringify(dates);
    const column = byDates.get(key) ?? { dates, blocks: [] };
    column.blocks.push({ optionId: id, time });
    byDates.set(key, column);
  }
  // Options come in chronological order, and a map keeps the order its keys first came in.
  return [...byDates.values()];
}

function yearsOf(columns: readonly TimeColumn[]): number[] {
  const years = columns.flatMap(({ dates }) =>
    dates.kind === 'single' ? [dates.date] : [dates.start, dates.end],
  );
  return [...new Set(years.map((date) => Number(date.slice(0, 4))))];
}

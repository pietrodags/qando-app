/** How a day joins its neighbours in a band of days in a row: a range, an overlap, a painted choice. */
export interface Shape {
  /** Drawn joined to the day before / after: both are in the same band and on the same row. */
  readonly joinsPrevious: boolean;
  readonly joinsNext: boolean;
  /** The band goes on before / after this day, but on another week row or in another month. */
  readonly cutBefore: boolean;
  readonly cutAfter: boolean;
  /** Inside the band, neither its first nor its last day: drawn fainter, so the ends stand out. */
  readonly middle: boolean;
}

/** Days laid out in rows of seven, after some blanks. */
export interface DayRows {
  readonly leadingBlanks: number;
  readonly days: readonly unknown[];
}

/**
 * The shape of the day at `index` of a grid, in a band of days from `start` to `end` (dates as
 * `YYYY-MM-DD`): the grid's rows of seven start after its blanks, and the grid ends with its last
 * day. A band of one day joins nothing.
 */
export function shapeOf(
  index: number,
  date: string,
  { start, end }: { readonly start: string; readonly end: string },
  { leadingBlanks, days }: DayRows,
): Shape {
  const column = (leadingBlanks + index) % 7;
  const before = date > start;
  const after = date < end;
  const rowStarts = column === 0 || index === 0;
  const rowEnds = column === 6 || index === days.length - 1;
  return {
    joinsPrevious: before && !rowStarts,
    joinsNext: after && !rowEnds,
    cutBefore: before && rowStarts,
    cutAfter: after && rowEnds,
    middle: before && after,
  };
}

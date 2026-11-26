// The options of an event, the dates and times its organizer proposes: what one is, which lists
// of them an event can have and the order they are shown in. The wizard stops at the same limits
// and the API refuses what goes beyond them, so the two agree.

/** The most options an event can have; each date, range of dates or time proposed is one. */
export const MAX_OPTIONS = 60;

/**
 * The last day an event created on `today` can propose: the same day twelve months later (a
 * 29 February gives the 28th). Both are calendar dates as `YYYY-MM-DD`.
 */
export function latestOptionDate(today: string): string {
  const nextYear = String(Number(today.slice(0, 4)) + 1);
  const monthAndDay = today.slice(4);
  // The year after a leap year never has a 29 February.
  return `${nextYear}${monthAndDay === '-02-29' ? '-02-28' : monthAndDay}`;
}

/**
 * The days of an option: one date, or a range of dates with both ends included. Calendar dates as
 * `YYYY-MM-DD`, read in the event's time zone.
 */
export type OptionDates =
  | { readonly kind: 'single'; readonly date: string }
  | { readonly kind: 'range'; readonly start: string; readonly end: string };

/** The time of an option: one time or a time range of the same day. Clock times as `HH:MM`. */
export type OptionTime =
  | { readonly kind: 'single'; readonly at: string }
  | { readonly kind: 'range'; readonly start: string; readonly end: string };

/** An option as the organizer proposes it; without a time it is the whole day, or days. */
export interface ProposedOption {
  readonly dates: OptionDates;
  readonly time: OptionTime | null;
}

/** What can be wrong with one option of a list. */
type OptionFault =
  /** It starts before today. */
  | 'DATE_PAST'
  /** It ends after the last day an event can propose (`latestOptionDate`). */
  | 'DATE_TOO_FAR'
  /** A range of dates of fewer than two days. */
  | 'DATE_RANGE_DEGENERATE'
  /** Only one date can have a time. */
  | 'TIME_ON_DATE_RANGE'
  /** Minutes other than 00, 15, 30 and 45. */
  | 'TIME_OFF_QUARTER'
  /** A time range that does not end after it starts. */
  | 'TIME_RANGE_DEGENERATE'
  /** A time range that ends after it starts, but in the same clock hour (`withinOneHour`). */
  | 'TIME_RANGE_WITHIN_ONE_HOUR'
  /** The whole day of a date that another option gives a time: a date is one or the other. */
  | 'WHOLE_DAY_WITH_TIMES'
  /** An option before it in the list says the same. */
  | 'DUPLICATE';

/** A problem of the list as a whole, or of the option at `index` in it. */
export type OptionProblem =
  | { readonly code: 'NO_OPTIONS' }
  | { readonly code: 'TOO_MANY_OPTIONS' }
  | { readonly code: OptionFault; readonly index: number };

export type OptionsValidation =
  | { readonly ok: true; readonly options: readonly ProposedOption[] }
  | { readonly ok: false; readonly problems: readonly OptionProblem[] };

/**
 * Checks the options proposed for an event on `today` (a calendar date in the event's time zone)
 * and lists every problem at once: those of the list, then each option's in the list's order.
 * Options may overlap; two that say the same may not. Dates and times must be well formed.
 *
 * Valid options are given back in the order every page and email shows them: by first day, then
 * by when they start, an option without a time counting from 0:00; a day or a time before a
 * range that starts with it; ranges of days by their last day, then time ranges by their end.
 */
export function validateOptions(
  options: readonly ProposedOption[],
  today: string,
): OptionsValidation {
  const problems: OptionProblem[] = [];
  if (options.length === 0) problems.push({ code: 'NO_OPTIONS' });
  if (options.length > MAX_OPTIONS) problems.push({ code: 'TOO_MANY_OPTIONS' });

  const latest = latestOptionDate(today);
  const datesWithTimes = new Set(
    options.flatMap(({ dates, time }) => (dates.kind === 'single' && time ? [dates.date] : [])),
  );
  const keyed = options.map((option) => ({ key: keyOf(option), option }));
  const seen = new Set<string>();
  keyed.forEach(({ key, option: { dates, time } }, index) => {
    const faults = [...dateFaults(dates, today, latest), ...timeFaults(dates, time)];
    if (dates.kind === 'single' && !time && datesWithTimes.has(dates.date)) {
      faults.push('WHOLE_DAY_WITH_TIMES');
    }
    if (seen.has(key)) faults.push('DUPLICATE');
    seen.add(key);
    problems.push(...faults.map((code) => ({ code, index })));
  });
  if (problems.length > 0) return { ok: false, problems };

  // No two valid options have the same key.
  keyed.sort((a, b) => (a.key < b.key ? -1 : 1));
  return { ok: true, options: keyed.map(({ option }) => option) };
}

function dateFaults(dates: OptionDates, today: string, latest: string): OptionFault[] {
  const [first, last] =
    dates.kind === 'single' ? [dates.date, dates.date] : [dates.start, dates.end];
  const faults: OptionFault[] = [];
  if (first < today) faults.push('DATE_PAST');
  if (last > latest) faults.push('DATE_TOO_FAR');
  if (dates.kind === 'range' && last <= first) faults.push('DATE_RANGE_DEGENERATE');
  return faults;
}

function timeFaults(dates: OptionDates, time: OptionTime | null): OptionFault[] {
  if (!time) return [];
  const [start, end] = time.kind === 'single' ? [time.at, time.at] : [time.start, time.end];
  const faults: OptionFault[] = [];
  if (dates.kind === 'range') faults.push('TIME_ON_DATE_RANGE');
  if (!onQuarter(start) || !onQuarter(end)) faults.push('TIME_OFF_QUARTER');
  if (time.kind === 'range' && end <= start) faults.push('TIME_RANGE_DEGENERATE');
  else if (withinOneHour(time)) faults.push('TIME_RANGE_WITHIN_ONE_HOUR');
  return faults;
}

/**
 * Whether a clock time (`HH:MM`) is on a quarter of its hour: :00, :15, :30 or :45, the only
 * minutes an option's time can have.
 */
export function onQuarter(time: string): boolean {
  return Number(time.slice(3)) % 15 === 0;
}

/**
 * Whether a time is a range that starts and ends within the same clock hour (20:00–20:30,
 * 20:15–20:45): the hours a day is shown in cannot hold one, as a range is drawn from the hour it
 * starts in to a later one, so no option has one (`validateOptions`) and a reading leaves it out.
 * 20:30–21:00 ends in a later hour. One time is never such a range.
 */
export function withinOneHour(time: OptionTime): boolean {
  return time.kind === 'range' && time.start.slice(0, 2) === time.end.slice(0, 2);
}

/**
 * What an option says, as a text of its own: two options with the same key are alike, and the
 * keys in alphabetical order put the options in theirs. Each part is as long in every key. After
 * the first day and the start come a day or a time (0), a range of days (1) and a time range (2).
 */
function keyOf({ dates, time }: ProposedOption): string {
  const start = !time ? '00:00' : time.kind === 'single' ? time.at : time.start;
  const end = !time ? '' : time.kind === 'single' ? 'at' : time.end;
  return dates.kind === 'range'
    ? `${dates.start} ${start} 1 ${dates.end} ${end}`
    : `${dates.date} ${start} ${time?.kind === 'range' ? 2 : 0} ${end}`;
}

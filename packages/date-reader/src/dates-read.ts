// What the reader answers for a phrase: the options to mark, the questions to ask first about
// a time whose half of the day was not said, and every notice the organizer sees. Options,
// questions and notices follow the order of the phrase. Dates are calendar values (YYYY-MM-DD)
// and times clock values (HH:MM), with no zone; a fragment is the words of the phrase quoted.

/** The day of an option, or its first and last day. */
export type ReadDates =
  { kind: 'single'; date: string } | { kind: 'range'; start: string; end: string };

/** A clock time or a range of them; `nextDay` when the range ends on the day after it starts. */
export type ClockTime =
  { kind: 'single'; at: string } | { kind: 'range'; start: string; end: string; nextDay?: true };

/**
 * The time of an option. `question`: the half of the day was not said, and the time is one of
 * the two readings of that question (its place in `questions`), for the organizer to pick.
 */
export type ReadTime = ClockTime | { kind: 'question'; question: number };

/** One option read from the phrase; `time` is null for a whole day or a range of days. */
export interface ReadOption {
  dates: ReadDates;
  time: ReadTime | null;
}

/**
 * A time to ask "morning or afternoon?" about: the words that said it, every date it is asked
 * of and its two readings.
 */
export interface TimeQuestion {
  fragment: string;
  dates: string[];
  morning: ClockTime;
  afternoon: ClockTime;
}

/** What a notice tells; see `ReadNotice`. */
export type NoticeKind = ReadNotice['kind'];

/**
 * One thing the organizer is told about a fragment of the phrase.
 *
 * About days that are marked (`dates`: the first day of each option the fragment speaks of;
 * none when a vague time was said of no day):
 * - `timeUnclear`: the time was not understood, the day is kept;
 * - `tooLate`: the time range ends after 06:00 of the next day, the day is kept with no time;
 * - `dayNotWritten`: midnight said of a day is 00:00 of the next one, the day marked;
 *   `written` says whether the phrase wrote a date ("el 20 de junio") or not (a weekday,
 *   "mañana"), for the words the notice names the day with.
 *
 * About what gave no option (`fragment` is absent when the notice speaks of the whole phrase):
 * - `unclear`: not understood;
 * - `mismatch`: something does not fit, a date that does not exist;
 * - `past`: a date, or a time today, already past;
 * - `horizon`: beyond 12 months; a range that crosses them is kept up to them;
 * - `tooMany`: above 60 options; nothing is marked.
 */
export type ReadNotice =
  | { kind: 'timeUnclear' | 'tooLate'; fragment: string; dates: string[] }
  | { kind: 'dayNotWritten'; fragment: string; dates: string[]; written: 'weekday' | 'date' }
  | { kind: 'unclear' | 'mismatch' | 'past' | 'horizon'; fragment?: string }
  | { kind: 'tooMany' };

/** The answer of the reader for one phrase. */
export interface DatesRead {
  /** The options, in the phrase's order; none with `tooMany` or when nothing is understood. */
  options: ReadOption[];
  /** One question per distinct time whose half of the day was not said, in the phrase's order. */
  questions: TimeQuestion[];
  /** One notice per fragment, every one that applies, in the phrase's order. */
  notices: ReadNotice[];
}

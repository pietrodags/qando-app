// What the reader answers for a phrase: the options the organizer reviews, what was not
// understood, the one notice shown and what to ask about a time whose half of the day was not
// said. Dates are calendar values (YYYY-MM-DD) and times clock values (HH:MM), with no zone.

/** The day of an option, or its first and last day. */
export type ReadDates =
  { kind: 'single'; date: string } | { kind: 'range'; start: string; end: string };

/** A clock time or a range of them; `nextDay` when the range ends on the day after it starts. */
export type ClockTime =
  { kind: 'single'; at: string } | { kind: 'range'; start: string; end: string; nextDay?: true };

/**
 * The time of an option. `pending`: the half of the day was not said, so both readings are
 * given for the organizer to pick from.
 */
export type ReadTime = ClockTime | { kind: 'pending'; morning: ClockTime; afternoon: ClockTime };

/** One option read from the phrase; `time` is null for a whole day or a range of days. */
export interface ReadOption {
  dates: ReadDates;
  time: ReadTime | null;
}

/**
 * The notice the organizer sees: `unclear` (not understood), `mismatch` (something does not fit,
 * a date that does not exist), `past`, `horizon` (beyond 12 months), `tooMany` (above 60
 * options), `timeUnclear` (the date is kept, its vague time is not understood) or `tooLate` (the
 * date is kept, its time range ends after 06:00 of the next day).
 */
export type ReadNotice =
  'unclear' | 'mismatch' | 'past' | 'horizon' | 'tooMany' | 'timeUnclear' | 'tooLate';

/** A time to ask "morning or afternoon?" about: the words that said it and its two readings. */
export interface TimeQuestion {
  text: string;
  morning: ClockTime;
  afternoon: ClockTime;
}

/** The answer of the reader for one phrase. */
export interface DatesRead {
  /** The options, sorted by day and time. */
  options: ReadOption[];
  /** The fragments of the phrase that were not understood. */
  notUnderstood: string[];
  notice: ReadNotice | null;
  /** One question per distinct time whose half of the day was not said. */
  questions: TimeQuestion[];
}

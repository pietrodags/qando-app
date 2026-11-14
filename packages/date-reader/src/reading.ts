// The reading of a phrase: the parts the phrase names, as said, before any calendar arithmetic.
// The phrase reader writes it and the calendar turns it into options; any other reader must
// write the same shape.

/** The half of the day. */
export type Half = 'AM' | 'PM';

/**
 * A day as said: any of its weekday (0 = Sunday … 6 = Saturday), day of the month, month (1–12)
 * and year; or the last day of a month (`endOfMonth`, alone). `yearOffset` is 1 for "del año que
 * viene": the calendar adds it to today's year (R4).
 */
export interface DayRef {
  weekday?: number | undefined;
  day?: number | undefined;
  month?: number | undefined;
  year?: number | undefined;
  yearOffset?: number | undefined;
  endOfMonth?: number | undefined;
}

/** A month, with its year when said (`yearOffset` as in a day). */
export interface MonthRef {
  month: number;
  year?: number | undefined;
  yearOffset?: number | undefined;
}

/**
 * A stretch of time said as such, in one of these forms: the `months` named (one or several:
 * "de julio y agosto"; `through` when said from one to another, which alone is one range); the
 * month `monthOffset` months from this one; the week `weekOffset` weeks from this one; the days
 * `before` a day; the days `from` a day (today when absent) `to` another.
 */
export interface Period {
  months?: MonthRef[];
  through?: true;
  monthOffset?: number;
  weekOffset?: number;
  before?: DayRef;
  from?: DayRef;
  to?: DayRef;
}

/** One ordinal ("el último": -1) or several ("el primero y el último"). */
export type Nth = number | number[];

export interface DayExpr {
  kind: 'day';
  ref: DayRef;
  /** "El próximo San Juan" said on the day itself: next year's. */
  following?: true;
}
/** A weekday; `weeks`: that many weeks after the coming one ("a fortnight on Saturday", R21). */
export interface WeekdayExpr {
  kind: 'weekday';
  weekday: number;
  weeks?: number;
}
export interface RangeExpr {
  kind: 'range';
  start: DayRef;
  end: DayRef;
  /** Two weekdays of the week that many weeks from this one. */
  week?: number;
}
export interface WeekExpr {
  kind: 'week';
  offset?: number;
  containing?: DayRef;
}
/** A weekend: the coming one (`after`: that many later), the one `containing` a day, or the nth of some months. */
export interface WeekendExpr {
  kind: 'weekend';
  nth?: Nth;
  months?: MonthRef[];
  monthOffset?: number;
  containing?: DayRef;
  after?: number;
}
/** Several weekends: those of a period (`take`: the first or the last n of them) or the coming `count`. */
export interface WeekendsExpr {
  kind: 'weekends';
  period?: Period;
  count?: number;
  take?: number;
}
/** A weekday pattern: those weekdays of a period, or the coming `count` of them. */
export interface PatternExpr {
  kind: 'pattern';
  weekdays: number[] | 'all';
  period?: Period;
  count?: number;
}
/** The nth weekdays of the months named or of the month `monthOffset` months from this one. */
export interface NthExpr {
  kind: 'nth';
  nth: Nth;
  weekday: number;
  months?: MonthRef[];
  monthOffset?: number;
}
export interface NthEachMonthExpr {
  kind: 'nthEachMonth';
  nth: Nth;
  weekday: number;
  until?: DayRef | undefined;
}

/** The date expression of an item. */
export type Expr =
  | DayExpr
  | { kind: 'offset'; days: number }
  | WeekdayExpr
  | { kind: 'weekdayInWeek'; weekday: number; week: number }
  // a Saturday or a Sunday of a weekend; `weeks`: of the weekend that many after it (R25)
  | { kind: 'weekendDay'; weekday: number; weekend: WeekendExpr | WeekendsExpr; weeks?: number }
  | RangeExpr
  | WeekExpr
  | WeekendExpr
  | WeekendsExpr
  | { kind: 'span'; period: Period }
  | PatternExpr
  | NthExpr
  | NthEachMonthExpr
  | { kind: 'half'; nth: number; month: number }
  // every day of `of` as its own option ("cualquier tarde de la semana que viene", R9/R16);
  // `weekdays`: only those, Monday to Friday for "entre semana", "weekday"
  | { kind: 'days'; of: Expr; weekdays?: number[] }
  | { kind: 'past' }
  | { kind: 'unbounded'; weekday?: number | undefined }
  | { kind: 'unknown' };

/**
 * A clock time as written (R28 and R11 are applied by the calendar). `h` = 24 is midnight at the
 * end of the day named: "medianoche", "las 12 de la noche", "24:00" (R29). `zero`: written with
 * a leading zero ("09:00") or otherwise exact.
 */
export interface Clock {
  h: number;
  m: number;
  mark: Half | null;
  zero: boolean;
}

/** One clock time said of an item. */
export interface TimeAt {
  at: Clock;
  /** The words of the phrase that say it. */
  text: string;
  start?: never;
  end?: never;
  unreadable?: never;
}
/** A range of clock times said of an item. */
export interface TimeRange {
  start: Clock;
  end: Clock;
  text: string;
  at?: never;
  unreadable?: never;
}
/** An hour that does not exist ("a las 25"): still a time, reported, never read as a day. */
export interface TimeUnreadable {
  unreadable: true;
  text: string;
  at?: never;
  start?: never;
  end?: never;
}
/** A time said of an item. */
export type Time = TimeAt | TimeRange | TimeUnreadable;

/** Days left out of an item: the nth stretch, a weekday, a day (of a month), a whole month. */
export type Except =
  | { nth: number; weekday?: never; day?: never; month?: never }
  | { weekday: number; nth?: never; day?: never; month?: never }
  | { day: number; month?: number; nth?: never; weekday?: never }
  | { month: number; nth?: never; weekday?: never; day?: never };

/** One thing the phrase names: a date expression with its times and exceptions. */
export interface Item {
  expr: Expr;
  times: Time[];
  except: Except[];
  /** The vague times said of it ("por la tarde"): reported, the date is kept (R9). */
  vague: string[];
  /** Nothing not understood stands between the item before and this one. */
  joined: boolean;
  /** The words of the phrase that say it. */
  text: string;
  /** Added with "y también" to the item before: a bare weekday then belongs to its week (R5). */
  also?: true;
  /** Joined by "o" to the item before: a bare weekday after a dated day is the first one after it (R5). */
  orElse?: true;
  /** The weekday said again of a one-day item ("que es martes"): the day must fall on it (R24). */
  restated?: number;
  /** The days said again of a weekend ("el primer finde de agosto, el 1 y el 2"): they must be its days (R2). */
  dates?: number[];
  /** Its times were said before it: they are also for the days joined after it (R13). */
  timesFirst?: true;
}

export interface Reading {
  /** The phrase, trimmed. */
  text: string;
  items: Item[];
  notUnderstood: string[];
  /** Vague times said of no date: reported as a time (R9). */
  vague: string[];
  /** A number was left unread. */
  numbers: boolean;
  /** False when no word of the phrase speaks of dates or times (R30). */
  aboutWhen: boolean;
  /** The half of the day a meal word says for the bare hours of the phrase (R28). */
  half: Half | null;
  /** The bare hours that word speaks for, from the first to the last; all of them when absent. */
  halfHours?: readonly [number, number];
}

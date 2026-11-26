// The calendar: turns a reading (see `reading.ts` for its shape) into the options the organizer
// reviews. All calendar arithmetic and all the owner's reading rules that need "today" live here
// (R3–R7, R11–R13, R16, R18–R20, R22, R24, R26, R28), so every reader shares them. Dates are
// calendar values (YYYY-MM-DD), no zones. The answer carries every notice the organizer sees,
// each with its fragment and the dates it speaks of, and, for a time whose half of the day was
// not said, what to ask and of which dates (see `dates-read.ts`).
import { MAX_OPTIONS, latestOptionDate } from '@qando/domain';
import type { ClockTime, DatesRead, ReadDates, ReadNotice, TimeQuestion } from './dates-read.js';
import { known } from './known.js';
import type {
  Clock,
  DayExpr,
  DayRef,
  Except,
  Expr,
  Fragment,
  Half,
  Item,
  MonthRef,
  Nth,
  Period,
  RangeExpr,
  Reading,
  Time,
} from './reading.js';

/** A day this many days away is beyond the twelve months, as is any day further ("dentro de 4294967296 días"). */
const FAR_AWAY = 1000;
/** A day and month this many days back (or fewer) is a past date, not next year's (R4; owner, 2026-11-11). */
const PAST_GRACE_DAYS = 30;
/** A stretch of days, from the first to the last (a single day has both the same). */
type Stretch = [from: string, to: string];
/** Why an item gives no option. */
type Why = 'unclear' | 'mismatch' | 'past' | 'horizon';
/** Why an expression gives no option, when it is not plain "not understood". */
interface Failure {
  why: 'mismatch' | 'past';
}
const fail = (why: Failure['why']): Failure => ({ why });
const pad = (n: number) => String(n).padStart(2, '0');
const utc = (day: string) => new Date(`${day}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const plus = (day: string, n: number) => iso(new Date(utc(day).getTime() + n * 86_400_000));
const dow = (day: string) => utc(day).getUTCDay();
const yearOf = (day: string) => Number(day.slice(0, 4));
const monthOf = (day: string) => Number(day.slice(5, 7));
const dateOf = (day: string) => Number(day.slice(8, 10));
/** A calendar date, or null when it does not exist (31 June). */
const ymd = (y: number, m: number, d: number): string | null => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return m >= 1 && m <= 12 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? iso(date)
    : null;
};
/** A day every month has (the 1st, the 15th, the 16th) of a month the vocabulary named. */
const monthDay = (y: number, m: number, d: number) => iso(new Date(Date.UTC(y, m - 1, d)));
const monthEnd = (y: number, m: number) => iso(new Date(Date.UTC(y, m, 0)));
const monthOfYear = (y: number, m: number): Stretch => [monthDay(y, m, 1), monthEnd(y, m)];
const monday = (day: string) => plus(day, -((dow(day) + 6) % 7));
const daysBetween = (from: string, to: string) => {
  const days: string[] = [];
  for (let day = from; day <= to; day = plus(day, 1)) days.push(day);
  return days;
};
/**
 * The first `count` days from `first` on that pass `wanted`, whatever the number written ("los
 * próximos 4294967296 lunes"): they stop a week past the twelve months, where one day beyond them
 * is enough for the notice (R19).
 */
function counted(first: string, count: number, today: string, wanted: (day: string) => boolean) {
  const last = plus(latestOptionDate(today), 7);
  const days: string[] = [];
  for (let day = first; days.length < count && day <= last; day = plus(day, 1)) {
    if (wanted(day)) days.push(day);
  }
  return days;
}
/** First day on that weekday strictly after `day` (R5: never the same day). */
const comingWeekday = (day: string, weekday: number) =>
  plus(day, ((weekday - dow(day) + 6) % 7) + 1);
/** The year a month named without one belongs to: this year, or next if already past (R4). */
const yearOfMonth = (month: number, after: string) =>
  month >= monthOf(after) ? yearOf(after) : yearOf(after) + 1;
/** R4: a day and month named without a year that passed a few days ago. */
const justPast = ({ day, month, year }: DayRef, today: string) =>
  day !== undefined &&
  month !== undefined &&
  year === undefined &&
  [yearOf(today), yearOf(today) - 1].some((y) => {
    const date = ymd(y, month, day);
    return date !== null && date < today && plus(date, PAST_GRACE_DAYS) >= today;
  });
/** A day and month that do not exist in the years they can mean: the year written, or this year and the next (R4, R19: "31 de junio", "29 de febrero"). */
const impossible = ({ day, month, year }: DayRef, today: string) =>
  day !== undefined &&
  month !== undefined &&
  !(year !== undefined ? [year] : [yearOf(today), yearOf(today) + 1]).some(
    (y) => ymd(y, month, day) !== null,
  );
/** R24: the weekday written next to a day number is not that date's weekday. */
const clashes = (ref: DayRef, day: string) =>
  ref.weekday !== undefined && ref.day !== undefined && dow(day) !== ref.weekday;

/** A day reference → a date on or after `after`, or null. */
function resolveDay(ref: DayRef, after: string): string | null {
  const Y = yearOf(after);
  const M = monthOf(after);
  if (ref.endOfMonth) return monthEnd(yearOfMonth(ref.endOfMonth, after), ref.endOfMonth);
  if (ref.day !== undefined && ref.month !== undefined) {
    if (ref.year !== undefined) return ymd(ref.year, ref.month, ref.day);
    for (const y of [Y, Y + 1, Y + 2]) {
      const day = ymd(y, ref.month, ref.day);
      if (day && day >= after) return day;
    }
    return null;
  }
  if (ref.day !== undefined) {
    // R7: its next occurrence
    for (let k = 0; k < 13; k++) {
      const day = ymd(Y + Math.floor((M - 1 + k) / 12), ((M - 1 + k) % 12) + 1, ref.day);
      if (day && day >= after) return day;
    }
    return null;
  }
  return ref.weekday !== undefined ? comingWeekday(after, ref.weekday) : null;
}

/** R31: a range of days and months already started gives what is left of it, from today. */
function underway(s: DayRef, e: DayRef, today: string): Stretch[] | Failure | null {
  if (
    s.day === undefined ||
    s.month === undefined ||
    e.day === undefined ||
    e.month === undefined ||
    s.year !== undefined ||
    e.year !== undefined
  ) {
    return null;
  }
  for (const year of [yearOf(today), yearOf(today) - 1]) {
    const from = ymd(year, s.month, s.day);
    const to = ymd(e.month < s.month ? year + 1 : year, e.month, e.day);
    if (from && to && from < today && to >= today) {
      return clashes(s, from) || clashes(e, to) ? fail('mismatch') : [[today, to]];
    }
  }
  return null;
}

/**
 * A month said at one end of a range of days is the month of both ends: "del 28 al 3 de enero", "entre el 1 y
 * el 15 de septiembre" (09-01…09-15), "del 28 de julio al 3" (R22; owner, 2026-11-13). Fills `s` and `e` in place.
 */
function shareMonth(s: DayRef, e: DayRef): void {
  if (s.month === undefined && s.day !== undefined && e.month !== undefined) {
    s.month = e.day !== undefined && s.day > e.day ? ((e.month + 10) % 12) + 1 : e.month; // "del 28 al 3 de enero"
    if (e.year !== undefined) s.year = s.month > e.month ? e.year - 1 : e.year;
  }
  if (e.month === undefined && e.day !== undefined && s.month !== undefined) {
    e.month = s.day !== undefined && e.day < s.day ? (s.month % 12) + 1 : s.month;
  }
}

function resolveRange(
  start: DayRef,
  end: DayRef,
  today: string,
  week: number | undefined,
): Stretch[] | Failure | null {
  const s = { ...start };
  const e = { ...end };
  if (week !== undefined) {
    // two weekdays of a named week; what is left of it when it has started
    const first = plus(monday(today), 7 * week);
    const from = plus(first, (known(s.weekday) + 6) % 7);
    const to = comingWeekday(plus(from, -1), known(e.weekday));
    return to < today ? fail('past') : [[from < today ? today : from, to]];
  }
  shareMonth(s, e);
  if (impossible(s, today) || impossible(e, today)) return fail('mismatch');
  if (justPast(e, today)) return fail('past');
  const left = underway(s, e, today);
  if (left) return left;
  const from = resolveDay(s, today);
  const to = from ? resolveDay(e, from) : null;
  if (!from || !to) return null;
  if (clashes(s, from) || clashes(e, to)) return fail('mismatch');
  if (to < from) return fail(to < today ? 'past' : 'mismatch'); // written backwards: "del 20 de agosto de 2026 al 10 de agosto de 2026"
  return [[from < today && to >= today ? today : from, to]]; // under way with its year written (R31)
}

/**
 * The stretches of days a period covers, today included (R3, R18); `whole` keeps the days already
 * past of one under way. One already over is given whole, for the *past* notice (R19).
 */
function spans(period: Period, today: string, whole = false): Stretch[] | Failure | null {
  const clip = (from: string, to: string): Stretch => [
    whole || from >= today || to < today ? from : today,
    to,
  ];
  if (period.through) return throughMonths(known(period.months), today, whole); // "todos los lunes de mayo a julio": this year's, what is left (R31)
  if (period.months) {
    return period.months.map(({ month, year }) =>
      clip(...monthOfYear(year ?? yearOfMonth(month, today), month)),
    );
  }
  if (period.monthOffset !== undefined) {
    const index = monthOf(today) - 1 + period.monthOffset;
    return [clip(...monthOfYear(yearOf(today) + Math.floor(index / 12), (index % 12) + 1))];
  }
  if (period.weekOffset !== undefined) {
    const start = plus(monday(today), 7 * period.weekOffset);
    return [clip(start, plus(start, 6))];
  }
  if (period.before) {
    const limit = resolveDay(period.before, today);
    if (!limit) return null;
    return limit > today ? [[today, plus(limit, -1)]] : fail('past'); // "antes de hoy"
  }
  const { from, to = {} } = period;
  if (from) return resolveRange(from, to, today, undefined); // the same days as the range said alone (R31)
  const until = resolveDay(to, today);
  if (!until) return null;
  return until < today ? fail('past') : [[today, until]];
}
/**
 * "De julio a septiembre" said alone: one range, from the first day of one month to the last of the
 * other (owner, 2026-11-12); one already started gives what is left of it (R31).
 */
function throughMonths(months: MonthRef[], today: string, whole = false): Stretch[] {
  const [first, last] = [known(months[0]), known(months.at(-1))];
  const endYear = last.year ?? yearOfMonth(last.month, today);
  const from = monthDay(first.month > last.month ? endYear - 1 : endYear, first.month, 1);
  const to = monthEnd(endYear, last.month);
  return [[!whole && from < today && to >= today ? today : from, to]];
}
const daysIn = (stretches: Stretch[]) => stretches.flatMap(([from, to]) => daysBetween(from, to));
const nthOf = <T>(list: T[], nth: number): T | undefined =>
  list[nth > 0 ? nth - 1 : list.length + nth];
const weekdaysOfMonth = (y: number, m: number, weekday: number) =>
  daysBetween(monthDay(y, m, 1), monthEnd(y, m)).filter((day) => dow(day) === weekday);
/** The nth weekdays of a month, `nth` one ordinal or a list ("el primero y el último"); undefined where there is none (a fifth Monday). */
const nthDays = (nth: Nth, weekday: number, y: number, m: number) =>
  [nth].flat().map((n) => nthOf(weekdaysOfMonth(y, m, weekday), n));
/** The list when none of it is missing. */
const whole = <T>(list: (T | null | undefined)[]): T[] | null =>
  list.every((entry): entry is T => Boolean(entry)) ? list : null;
/** nth weekdays of a month named without a year: this year's while one of them is still to come. */
function nthInMonth(nth: Nth, weekday: number, month: number, today: string): string[] | null {
  const y = yearOfMonth(month, today);
  const days = whole(nthDays(nth, weekday, y, month));
  return days?.every((day) => day < today) ? whole(nthDays(nth, weekday, y + 1, month)) : days;
}
/**
 * The nth weekdays of the months named ("de julio y de agosto", "de marzo de 2027") or of the month
 * `monthOffset` months from this one; null when one of them does not exist.
 */
function nthWeekdays(
  nth: Nth,
  { months, monthOffset }: { months?: MonthRef[]; monthOffset?: number },
  weekday: number,
  today: string,
): string[] | null {
  if (monthOffset !== undefined) {
    const index = monthOf(today) - 1 + monthOffset; // a past day is dropped by R19, never moved to the next month
    return whole(nthDays(nth, weekday, yearOf(today) + Math.floor(index / 12), (index % 12) + 1));
  }
  const each = known(months).map(({ month, year }) =>
    year === undefined
      ? nthInMonth(nth, weekday, month, today)
      : whole(nthDays(nth, weekday, year, month)),
  );
  return whole(each)?.flat() ?? null;
}

const one = (day: string | null): Stretch[] | null => (day ? [[day, day]] : null);
const eachDay = (days: string[]): Stretch[] => days.map((day) => [day, day]);
const weekendOf = (saturday: string): Stretch => [saturday, plus(saturday, 1)];
/** This weekend's Saturday, today when it is one, or the coming one. */
const thisSaturday = (today: string) => (dow(today) === 6 ? today : comingWeekday(today, 6));
/** The day that names a week ("la semana del 15 de junio"): one earlier in this week is this week's, never next year's. */
const dayOfWeekNamed = (ref: DayRef, today: string) => resolveDay(ref, monday(today));

/** One item's date expression → stretches [from, to] (a single day has from = to), or a reason. */
function expand(expr: Expr, today: string): Stretch[] | Failure | null {
  switch (expr.kind) {
    case 'day': {
      const { ref } = expr;
      const numberOnly =
        ref.day !== undefined && ref.month === undefined && ref.weekday === undefined;
      if (numberOnly && ref.day === dateOf(today)) return null; // R7: today's own number is never guessed
      if (impossible(ref, today)) return fail('mismatch');
      if (justPast(ref, today)) return fail('past');
      const day = resolveDay(ref, expr.following ? plus(today, 1) : today); // "el próximo San Juan" said on 24 June: next year's
      return day && clashes(ref, day) ? fail('mismatch') : one(day);
    }
    case 'span':
      // R22: a month named alone is one range
      return expr.period.through
        ? throughMonths(known(expr.period.months), today)
        : spans(expr.period, today);
    case 'offset':
      return one(plus(today, Math.min(expr.days, FAR_AWAY)));
    case 'weekday':
      return one(plus(comingWeekday(today, expr.weekday), 7 * (expr.weeks ?? 0))); // "a fortnight on Saturday": weeks 2 (R21)
    case 'weekendDay': {
      // "el sábado o el domingo del finde que viene" (R6, R25)
      const weekends = expand(expr.weekend, today);
      const later = 7 * (expr.weeks ?? 0); // "este finde o el siguiente sábado": the weekend after (R25)
      return Array.isArray(weekends)
        ? weekends.map(([, sunday]): Stretch => {
            // from its Sunday: a weekend said on its Sunday holds no more than that day
            const day = plus(sunday, (expr.weekday === 6 ? -1 : 0) + later);
            return [day, day];
          })
        : weekends;
    }
    case 'weekdayInWeek':
      return one(plus(monday(today), 7 * expr.week + ((expr.weekday + 6) % 7)));
    case 'range':
      return resolveRange(expr.start, expr.end, today, expr.week);
    case 'week': {
      const day = expr.containing ? dayOfWeekNamed(expr.containing, today) : today;
      if (!day) return null;
      const start = plus(monday(day), 7 * (expr.offset ?? 0));
      const end = plus(start, 6);
      if (end < today) return fail('past'); // "la semana del 1 de junio de 2026", two weeks later
      return [[start < today ? today : start, end]]; // what is left of it when it has started
    }
    case 'weekend': {
      if (expr.nth !== undefined) {
        return nthWeekdays(expr.nth, expr, 6, today)?.map(weekendOf) ?? null;
      }
      if (expr.containing || expr.week !== undefined) {
        // the weekend of a day's week or of a week named; said on its Sunday, what is left of it (owner, 2026-11-26)
        const day = expr.containing
          ? dayOfWeekNamed(expr.containing, today)
          : plus(monday(today), 7 * known(expr.week));
        if (!day) return null;
        const [saturday, sunday] = weekendOf(plus(monday(day), 5));
        if (sunday < today) return fail('past'); // "el finde del 21 de junio de 2026", a day later
        return [[saturday < today ? today : saturday, sunday]];
      }
      return [weekendOf(plus(thisSaturday(today), 7 * (expr.after ?? 0)))]; // R25
    }
    case 'weekends': {
      const { count, take } = expr;
      if (count !== undefined) {
        if (!count) return fail('mismatch'); // "los próximos 0 fines de semana"
        return counted(today, count, today, (day) => dow(day) === 6).map(weekendOf);
      }
      const stretches = spans(known(expr.period), today, take !== undefined);
      if (!Array.isArray(stretches)) return stretches;
      const all = daysIn(stretches)
        .filter((day) => dow(day) === 6)
        .map(weekendOf); // R26: by its Saturday
      return take ? (take > 0 ? all.slice(0, take) : all.slice(take)) : all;
    }
    case 'pattern': {
      const { weekdays, count } = expr;
      const wanted = (day: string) => weekdays === 'all' || weekdays.includes(dow(day));
      if (count !== undefined) {
        if (!count) return fail('mismatch'); // "los próximos 0 lunes"
        return eachDay(counted(plus(today, 1), count, today, wanted));
      }
      const period = known(expr.period);
      const stretches = spans(period, today);
      if (!Array.isArray(stretches)) return stretches;
      const days = daysIn(stretches).filter(wanted);
      const only = period.months?.length === 1 ? period.months[0] : undefined;
      if (!days.length && only && only.year === undefined) {
        // none left this month: next year's (R4)
        const next = monthOfYear(yearOf(today) + 1, only.month);
        return eachDay(daysBetween(...next).filter(wanted));
      }
      return eachDay(days);
    }
    case 'nth': {
      const days = nthWeekdays(expr.nth, expr, expr.weekday, today);
      return days ? eachDay(days) : null;
    }
    case 'days': {
      // one option per day (R9, R16); only Monday to Friday for "entre semana", "weekday" (owner, 2026-11-13)
      const { weekdays } = expr;
      const all = expand(expr.of, today);
      return Array.isArray(all)
        ? eachDay(daysIn(all).filter((day) => !weekdays || weekdays.includes(dow(day))))
        : all;
    }
    case 'nthEachMonth': {
      const until = expr.until ? resolveDay(expr.until, today) : plus(today, 366);
      if (!until) return null;
      const days: string[] = [];
      for (let k = 0; k < 13; k++) {
        const index = monthOf(today) - 1 + k;
        const [y, m] = [yearOf(today) + Math.floor(index / 12), (index % 12) + 1];
        for (const day of nthDays(expr.nth, expr.weekday, y, m)) {
          if (day && day > today && day <= until) days.push(day);
        }
      }
      return eachDay(days);
    }
    case 'half': {
      const pick = (y: number): Stretch =>
        expr.nth === 1
          ? [monthDay(y, expr.month, 1), monthDay(y, expr.month, 15)]
          : [monthDay(y, expr.month, 16), monthEnd(y, expr.month)];
      const y = yearOfMonth(expr.month, today);
      return expr.nth === 1 || expr.nth === 2 ? [pick(y)[0] < today ? pick(y + 1) : pick(y)] : null;
    }
    case 'past':
    case 'unbounded':
    case 'unknown':
      return null;
  }
}

/** R16: take days out; what is left regroups into stretches (a lone day stays single). */
function without(stretches: Stretch[], except: Except): Stretch[] {
  if (except.nth !== undefined) {
    const gone = nthOf(stretches, except.nth);
    return stretches.filter((stretch) => stretch !== gone);
  }
  const hit = (day: string) =>
    except.day !== undefined
      ? dateOf(day) === except.day && (except.month === undefined || monthOf(day) === except.month)
      : except.month !== undefined
        ? monthOf(day) === except.month
        : dow(day) === except.weekday;
  return stretches.flatMap(([from, to]) => {
    const left: Stretch[] = [];
    for (const day of daysBetween(from, to)) {
      if (hit(day)) continue;
      const last = left.at(-1);
      if (last && plus(last[1], 1) === day) last[1] = day;
      else left.push([day, day]);
    }
    return left;
  });
}

const DAY = 24 * 60;
/** What a meal word says of the bare hours of the phrase: their half of the day, for the hours it speaks for (R28). */
interface HalfSaid {
  is: Half;
  hours: readonly [number, number];
}
/**
 * R28 and R11: the minutes of the day a clock as written can mean. One value, or
 * two (morning, afternoon) when the hour is 1–11 and nothing says which half:
 * no mark ("de la tarde", "pm"), no leading zero ("09:00") and no meal word.
 * Minutes before the hour ("la una menos cuarto") are taken off once the hour has its half:
 * 00:45 or 12:45, and before 00:00 they stay in the day named ("a las 0 menos cuarto": 23:45).
 */
function meanings(
  { h, m, mark, zero }: Clock,
  half: HalfSaid | null,
): [number] | [number, number] | null {
  if (h > 24 || m > 59) return null;
  // hour 24 stays past the day's end (R29); minutes before 00:00 are of the last hour of the day named
  const at = (hour: number) => {
    const minutes = (hour === 0 && m < 0 ? 24 : hour) * 60 + m;
    return minutes - (minutes % 15);
  };
  if (mark === 'PM') return [at(h < 12 ? h + 12 : h)];
  if (mark === 'AM') return [at(h === 12 ? 0 : h)];
  const before12 = h === 12 && m < 0 && !zero; // "a las 12 menos cuarto": before noon or before midnight, as an hour of the 11
  if (!before12 && (zero || h === 0 || h >= 12)) return [at(h)]; // "a las 12" is noon
  const said = before12 ? 11 : h;
  if (half && said >= half.hours[0] && said <= half.hours[1]) {
    return [at(half.is === 'PM' ? h + 12 : h)];
  }
  return [at(h), at(h + 12)];
}
const hhmm = (total: number) => `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
const single = (at: number): ClockTime => ({ kind: 'single', at: hhmm(at) });
const range = ([start, end]: [number, number]): ClockTime => ({
  kind: 'range',
  start: hhmm(start),
  end: hhmm(end),
});
/** A time whose half of the day was not said: both readings, for the organizer to pick from. */
interface Pending {
  kind: 'pending';
  morning: ClockTime;
  afternoon: ClockTime;
}
const LATEST_END = 6 * 60; // a range may end on the next day up to 06:00 (+1) (R29)
const TOO_LATE = { kind: 'tooLate' } as const; // what `timeOf` answers for a range that ends later than that
/**
 * R29: midnight said of a day is 00:00 of the next one (a single time, or a range
 * that starts then); a time range that ends at midnight or later stays one option
 * on the day it starts, its end on the next day (`nextDay: true`).
 */
function placed(day: string, time: ClockTime): { date: string; time: ClockTime } {
  const early = (clock: string) => `${pad(Number(clock.slice(0, 2)) - 24)}${clock.slice(2)}`; // the same clock, one day on
  if (time.kind === 'single' && time.at >= '24:00') {
    return { date: plus(day, 1), time: { kind: 'single', at: early(time.at) } };
  }
  if (time.kind === 'range' && time.start >= '24:00') {
    // "de medianoche a 2"
    const moved: ClockTime = { kind: 'range', start: early(time.start), end: early(time.end) };
    return { date: plus(day, 1), time: moved };
  }
  if (time.kind === 'range' && time.end >= '24:00') {
    return {
      date: day,
      time: { kind: 'range', start: time.start, end: early(time.end), nextDay: true },
    };
  }
  return { date: day, time };
}
const pending = (morning: ClockTime, afternoon: ClockTime): Pending => ({
  kind: 'pending',
  morning,
  afternoon,
});
function timeOf(time: Time, half: HalfSaid | null): ClockTime | Pending | typeof TOO_LATE | null {
  if (time.unreadable) return null; // "a las 25"
  if (time.at) {
    const at = meanings(time.at, half);
    return at && (at.length === 1 ? single(at[0]) : pending(single(at[0]), single(at[1])));
  }
  const start = { ...time.start };
  const end = { ...time.end };
  if (end.h === 0 && end.m === 0) end.h = 24; // "de 22:00 a 00:00" ends at midnight
  if (end.h === 24 && !end.mark && !start.mark && start.h < 12) start.mark = 'PM'; // "de 10 a medianoche"
  if (!start.mark && end.mark) {
    // "de 5 a 7 de la tarde" and "de 5 a 5:30 de la tarde" mark both; "de 10 a 2 de la tarde" leaves 10 as written
    const earlier = start.h < end.h || (start.h === end.h && start.m < end.m);
    if (earlier && start.h < 12) start.mark = end.mark;
    else if (end.mark === 'AM' && start.h < 12)
      start.mark = 'PM'; // "de 10 a 2 de la madrugada" starts the evening before
    else if (
      start.h === 12 &&
      !start.zero && // "de mediodía a 1 de la madrugada": noon said in words is noon
      (end.mark === 'AM' || (end.h === 24 && start.m < end.m))
    )
      start.h = 24; // "de las 12 a las 3 de la madrugada", "de 12 a 12:30 de la noche" start at midnight (R29)
    else start.zero = true;
  }
  const from = meanings(start, half);
  const to = meanings(end, half);
  if (!from || !to) return null;
  const forward = (pairs: [number, number][]) => pairs.filter(([a, b]) => b > a);
  let pairs: [number, number][];
  if (from.length === 2 && to.length === 2) {
    // "de 5 a 7": both in the same half, one question
    pairs = forward([
      [from[0], to[0]],
      [from[1], to[1]],
    ]);
    if (!pairs.length) pairs = [[from[0], to[1]]]; // "de 10 a 2" can only cross noon
  } else pairs = forward(from.flatMap((a) => to.map((b): [number, number] => [a, b])));
  if (!pairs.length && from.length === 1 && from[0] >= DAY / 2 && to[0] < from[0]) {
    pairs = [[from[0], to[0] + DAY]]; // past midnight (R29)
  }
  if (!pairs.length) return null;
  pairs = pairs.filter(([, last]) => last <= DAY + LATEST_END);
  const [first, second] = pairs;
  if (!first) return TOO_LATE; // "de 22 a 8" (R29)
  return second ? pending(range(first), range(second)) : range(first);
}

/**
 * R24 (owner, 2026-11-12): a day given the month of a later one ("el lunes 29 o el miércoles 1 de julio") whose
 * weekday does not fit that month but fits the month before is in the month before: a pair across a month change.
 */
function monthBefore(target: DayRef, source: DayRef, today: string): void {
  if (target.weekday === undefined || source.day === undefined) return;
  const anchor = resolveDay(source, today);
  if (!anchor) return;
  const [inMonth, day] = [known(target.month), known(target.day)];
  const here = ymd(yearOf(anchor), inMonth, day);
  if (here && !clashes(target, here)) return;
  const [year, month] = inMonth === 1 ? [yearOf(anchor) - 1, 12] : [yearOf(anchor), inMonth - 1];
  const there = ymd(year, month, day);
  if (there && !clashes(target, there)) Object.assign(target, { month, year });
}

/** Month and time written once for several days joined by "y"/"o" (R13). */
function inherit(items: Item[], today: string): void {
  const monthSource = (expr: Expr): DayRef | null =>
    expr.kind === 'days'
      ? monthSource(expr.of)
      : expr.kind === 'day'
        ? expr.ref
        : expr.kind === 'range'
          ? expr.end.month !== undefined
            ? expr.end
            : expr.start
          : null;
  const needsMonth = (expr: Expr): expr is DayExpr | RangeExpr =>
    (expr.kind === 'day' && expr.ref.day !== undefined && expr.ref.month === undefined) ||
    (expr.kind === 'range' &&
      expr.start.month === undefined &&
      expr.end.month === undefined &&
      expr.end.day !== undefined);
  const give = (expr: DayExpr | RangeExpr, source: DayRef) => {
    const target = expr.kind === 'day' ? expr.ref : expr.end;
    target.month = source.month;
    if (source.year !== undefined) target.year = source.year;
  };
  for (let n = 1; n < items.length; n++) {
    // "a las 8 el viernes o el sábado": a time said first is for every day joined after it
    const [before, item] = [known(items[n - 1]), known(items[n])];
    if (before.timesFirst && item.joined && !item.times.length && !item.vague.length) {
      item.times = before.times;
      item.timesFirst = true;
    }
  }
  for (let n = items.length - 2; n >= 0; n--) {
    // "el 3, el 5 y el 12 de julio"
    const [item, next] = [known(items[n]), known(items[n + 1])];
    if (!next.joined) continue;
    const source = monthSource(next.expr);
    if (item.expr.kind === 'day' && needsMonth(item.expr) && source?.month !== undefined) {
      give(item.expr, source);
      monthBefore(item.expr.ref, source, today);
    }
    if (item.expr.kind === 'weekday' && next.expr.kind === 'weekdayInWeek') {
      // "el martes o el miércoles de la semana que viene" (R5)
      item.expr = { kind: 'weekdayInWeek', weekday: item.expr.weekday, week: next.expr.week };
    }
    if (!item.times.length && !item.vague.length && next.times.length) item.times = next.times;
  }
  for (let n = 1; n < items.length; n++) {
    // "del 3 al 7 de agosto o del 10 al 14"
    const [before, item] = [known(items[n - 1]), known(items[n])];
    const source = monthSource(before.expr);
    if (item.joined && needsMonth(item.expr) && source?.month !== undefined) {
      give(item.expr, source);
    }
  }
}

/**
 * R5 (owner, 2026-11-12): a bare weekday added with "y también" to a week, or to a stretch inside
 * one week, is that week's ("la semana que viene … y también el sábado"); null when it is not, or when
 * that day is today or already past (then it is the first coming one).
 */
function sameWeek(item: Item, before: Stretch[] | null, today: string): Stretch[] | null {
  if (!item.also || item.expr.kind !== 'weekday' || !before?.length) return null;
  const week = monday(known(before[0])[0]);
  if (monday(known(before.at(-1))[1]) !== week) return null;
  const day = plus(week, (item.expr.weekday + 6) % 7);
  return day > today ? [[day, day]] : null;
}

/** R5 (owner, 2026-11-12): "el viernes 26 o el sábado": a bare weekday joined by "o" right after a dated day is the first one after it. */
function afterDated(
  item: Item,
  previous: Item | undefined,
  before: Stretch[] | null,
): Stretch[] | null {
  if (
    !item.orElse ||
    item.expr.kind !== 'weekday' ||
    previous?.expr.kind !== 'day' ||
    previous.expr.ref.day === undefined ||
    before?.length !== 1
  ) {
    return null;
  }
  return one(comingWeekday(known(before[0])[1], item.expr.weekday));
}

const isRecord = (node: unknown): node is Record<string, unknown> =>
  typeof node === 'object' && node !== null;
/** "del año que viene" (owner, 2026-11-13): a reference to the coming year, wherever the expression holds one, is today's year plus one (R4). */
function yearsOf(node: unknown, today: string): void {
  if (!isRecord(node)) return;
  if (typeof node.yearOffset === 'number') {
    node.year = yearOf(today) + node.yearOffset;
    delete node.yearOffset;
  }
  for (const value of Object.values(node)) yearsOf(value, today);
}

/** R24 (owner, 2026-11-13): "el 7 de julio, que es martes": the weekday said again must be that day's, or nothing fits; R2 the same for a weekend's days. */
const restates = ({ restated, dates }: Item, expanded: Stretch[] | Failure | null) =>
  !Array.isArray(expanded) ||
  ((restated === undefined ||
    expanded.every(([from, to]) => from === to && dow(from) === restated)) &&
    (dates === undefined || expanded.every(([from, to]) => sameDays(from, to, dates))));
/** "el primer finde de agosto, el 1 y el 2" (R2; owner, 2026-11-13): the days said again are exactly the stretch's days. */
function sameDays(from: string, to: string, dates: number[]): boolean {
  const days: number[] = [];
  for (let day = from; day <= to; day = plus(day, 1)) days.push(dateOf(day));
  return days.length === dates.length && days.every((day) => dates.includes(day));
}

/** Whether an expression writes its day as a date (a day of the month), not as a weekday or a word. */
const writesDate = (expr: Expr): boolean =>
  expr.kind === 'days'
    ? writesDate(expr.of)
    : expr.kind === 'day'
      ? expr.ref.day !== undefined
      : expr.kind === 'range' && expr.start.day !== undefined;

/** What is told of a fragment: its notice without the words, which the fragment brings. */
type Telling =
  | { kind: 'timeUnclear' | 'tooLate'; dates: string[] }
  | { kind: 'dayNotWritten'; dates: string[]; written: 'weekday' | 'date' }
  | { kind: Why | 'pastTime' };
/**
 * The notices of an answer while it is built: one per fragment, kind and way of writing the
 * day, the dates it speaks of added as they are found; given back in the phrase's order.
 */
function noticeBoard() {
  const told = new Map<string, { offset: number; notice: ReadNotice }>();
  return {
    /** Tells a notice of a fragment; told again, its dates are added to the ones it has. */
    tell(telling: Telling, { text, offset }: Fragment): void {
      const key = JSON.stringify([
        offset,
        text,
        telling.kind,
        'written' in telling && telling.written,
      ]);
      const before = told.get(key)?.notice;
      if (!before) told.set(key, { offset, notice: { ...telling, fragment: text } });
      else if ('dates' in before && 'dates' in telling) {
        before.dates = [...new Set([...before.dates, ...telling.dates])];
      }
    },
    /** Every notice told, in the phrase's order; those of one place, in the order told. */
    inOrder(): ReadNotice[] {
      return [...told.values()].sort((a, b) => a.offset - b.offset).map(({ notice }) => notice);
    },
  };
}

/** The question of a bare hour while the answer is built: where its words are, and its dates as they are found. */
interface Asked extends TimeQuestion {
  offset: number;
}
/** An option while the answer is built: an asked time is its question itself. */
interface Found {
  dates: ReadDates;
  time: ClockTime | Asked | null;
}
const isAsked = (time: ClockTime | Asked | null): time is Asked =>
  time !== null && 'fragment' in time;
const startOf = (time: ClockTime): string => (time.kind === 'single' ? time.at : time.start);
/** An answer that marks nothing and gives one notice alone. */
const alone = (notice: ReadNotice): DatesRead => ({
  options: [],
  questions: [],
  notices: [notice],
});

/**
 * The answer a reading gives on a day (`today`, YYYY-MM-DD): its options, the questions about
 * the hours whose half of the day was not said and the notices, all in the phrase's order.
 * `now` (HH:MM): the time of day, which makes the earlier times of today past ones.
 */
export function resolve(reading: Reading, today: string, now?: string): DatesRead {
  const horizon = latestOptionDate(today);
  const board = noticeBoard();
  const options = new Map<string, Found>();
  const questions = new Map<string, Asked>(); // R28: one "¿mañana o tarde?" per distinct time whose half is not said
  for (const item of reading.items) yearsOf(item.expr, today);
  inherit(reading.items, today);
  for (const fragment of reading.notUnderstood) board.tell({ kind: 'unclear' }, fragment);
  for (const fragment of reading.vague) board.tell({ kind: 'timeUnclear', dates: [] }, fragment);
  // a meal word (R28)
  const said: HalfSaid | null = reading.half
    ? { is: reading.half, hours: reading.halfHours ?? [1, 11] }
    : null;
  const passed = (date: string, time: ClockTime) =>
    date === today && now !== undefined && startOf(time) < now;
  let before: Stretch[] | null = null; // the stretches of the item before, for a weekday added to its week
  for (const [n, item] of reading.items.entries()) {
    const read: Stretch[] | Failure | null =
      sameWeek(item, before, today) ??
      afterDated(item, reading.items[n - 1], before) ??
      expand(item.expr, today);
    const expanded: Stretch[] | Failure | null = restates(item, read) ? read : fail('mismatch');
    before = Array.isArray(expanded) ? expanded : null;
    const failed = expanded !== null && !Array.isArray(expanded) ? expanded.why : undefined;
    let why: Why = failed ?? (item.expr.kind === 'past' ? 'past' : 'unclear');
    let all = Array.isArray(expanded) ? expanded : [];
    for (const except of item.except) all = without(all, except);
    let beyond = all.some(([, to]) => to > horizon);
    const stretches = all
      .filter(([from]) => from >= today && from <= horizon) // R19
      .map(([from, to]): Stretch => [from, to > horizon ? horizon : to]); // a range that crosses the limit is cut at it
    if (all.some(([from]) => from < today)) why = 'past';
    else if (beyond) why = 'horizon';
    if (!stretches.length) {
      board.tell({ kind: why }, item); // its vague times are inside its words
      continue;
    }
    const meant: { said: Time; time: ClockTime | Pending }[] = [];
    const unread: { said: Time; kind: 'timeUnclear' | 'tooLate' }[] = []; // the date is kept (R9, R29)
    for (const time of item.times) {
      const value = timeOf(time, said);
      if (!value || value.kind === 'tooLate') {
        unread.push({ said: time, kind: value ? 'tooLate' : 'timeUnclear' });
      } else meant.push({ said: time, time: value });
    }
    /** The option of a day at a time said of it, or null when it is left out and told why. */
    const timed = (day: string, { said: words, time }: (typeof meant)[number]): Found | null => {
      if (time.kind === 'pending') {
        // a reading already past is not asked about: the other one is taken
        if (passed(day, time.afternoon)) {
          board.tell({ kind: 'pastTime' }, words);
          return null;
        }
        if (!passed(day, time.morning)) {
          // both readings start within the day; one that ends after midnight ends on the next (R29)
          const morning = placed(day, time.morning).time;
          const afternoon = placed(day, time.afternoon).time;
          const key = JSON.stringify([morning, afternoon]);
          const asked = questions.get(key) ?? {
            fragment: words.text,
            dates: [],
            morning,
            afternoon,
            offset: words.offset,
          };
          questions.set(key, asked);
          if (!asked.dates.includes(day)) asked.dates.push(day);
          return { dates: { kind: 'single', date: day }, time: asked };
        }
      }
      const at = placed(day, time.kind === 'pending' ? time.afternoon : time);
      if (at.date > horizon) {
        beyond = true; // midnight of the last day is the day after (R29)
        return null;
      }
      if (passed(at.date, at.time)) {
        board.tell({ kind: 'pastTime' }, words);
        return null;
      }
      if (at.date !== day) {
        const written = writesDate(item.expr) ? 'date' : 'weekday';
        board.tell({ kind: 'dayNotWritten', dates: [at.date], written }, words);
      }
      return { dates: { kind: 'single', date: at.date }, time: at.time };
    };
    const found: Found[] = meant.length
      ? daysIn(stretches).flatMap((day) => meant.flatMap((time) => timed(day, time) ?? [])) // R12
      : stretches.map(([from, to]) => ({
          dates:
            from === to ? { kind: 'single', date: from } : { kind: 'range', start: from, end: to },
          time: null,
        }));
    const dates = [
      ...new Set(
        found.map((option) => ('date' in option.dates ? option.dates.date : option.dates.start)),
      ),
    ];
    // R9: the date is kept and the time is reported. When the date keeps no option, nothing says
    // "the day is marked": beyond the twelve months its notice quotes it whole; with every time
    // understood already past, the other times are plainly not understood.
    const left = [
      ...item.vague.map((fragment) => ({ fragment, kind: 'timeUnclear' as const })),
      ...unread.map(({ said: fragment, kind }) => ({ fragment, kind })),
    ];
    for (const { fragment, kind } of left) {
      if (dates.length) board.tell({ kind, dates }, fragment);
      else if (!beyond) board.tell({ kind: 'unclear' }, fragment);
    }
    // the part within the twelve months is kept, and the notice says there was more (R19)
    if (beyond) board.tell({ kind: 'horizon' }, item);
    for (const option of found) {
      // an asked time is told apart by its readings: two of them may share their words
      const { dates: on, time } = option;
      const key = JSON.stringify([on, isAsked(time) ? [time.morning, time.afternoon] : time]);
      if (!options.has(key)) options.set(key, option);
    }
  }
  const withTime = new Set(
    [...options.values()].flatMap(({ dates, time }) => (time && 'date' in dates ? dates.date : [])),
  );
  // a whole day gives way to the same day with a time
  const kept = [...options.values()].filter(
    ({ dates, time }) => time !== null || !('date' in dates) || !withTime.has(dates.date),
  );
  if (kept.length > MAX_OPTIONS) return alone({ kind: 'tooMany' }); // R20
  const notices = board.inOrder();
  if (!kept.length) {
    // what does not fit, is past or lies beyond the twelve months is told fragment by fragment
    const saysWhy = ({ kind }: ReadNotice) =>
      kind === 'mismatch' || kind === 'past' || kind === 'pastTime' || kind === 'horizon';
    if (notices.some(saysWhy)) return { options: [], questions: [], notices };
    const offTopic = !reading.items.length && (reading.numbers || !reading.aboutWhen);
    return alone({ kind: offTopic ? 'mismatch' : 'unclear' });
  }
  const asked = [...questions.values()].sort((a, b) => a.offset - b.offset);
  return {
    options: kept.map(({ dates, time }) => ({
      dates,
      time: isAsked(time) ? { kind: 'question', question: asked.indexOf(time) } : time,
    })),
    questions: asked.map(({ fragment, dates, morning, afternoon }) => ({
      fragment,
      dates,
      morning,
      afternoon,
    })),
    notices,
  };
}

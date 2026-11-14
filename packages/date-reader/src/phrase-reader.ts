// The phrase reader: turns the organizer's phrase into a *reading* (the parts the phrase names,
// see `reading.ts` for its shape), with no calendar arithmetic. The calendar (`calendar.ts`)
// turns a reading into options. The grammar reads tokens and never names a word: the words are
// in the vocabulary.
import { known } from './known.js';
import type {
  Clock,
  DayRef,
  Except,
  Expr,
  Half,
  Item,
  MonthRef,
  Nth,
  NthEachMonthExpr,
  NthExpr,
  Period,
  RangeExpr,
  Reading,
  Time,
  TimeAt,
  TimeRange,
} from './reading.js';
import { isYear, plain, tokenize, type Token, type TokenType } from './tokenizer.js';

// Words that speak of dates: inside a condition unrelated to dates (R27) they are still read or reported,
// never ignored ("mañana a las 9 y si no pasado"; owner, 2026-11-12).
const SAYS_WHEN = new Set<TokenType>([
  'WD',
  'PAST',
  'WEEK',
  'WEEKS',
  'WEEKEND',
  'WEEKENDPL',
  'MONTH',
  'EACHMONTH',
  'TODAY',
  'TOMORROW',
  'DAYAFTER',
  'YESTERDAY',
  'TODAYPART',
  'HOLIDAY',
  'MOVABLE',
  'HALF',
  'AFTERNEXT',
]);
// Tokens that never make a fragment worth reporting on their own.
const NOISE = new Set<TokenType>([
  'EACH',
  'NAMELY',
  'WHEN',
  'ART',
  'ARTPL',
  'DE',
  'DEL',
  'A',
  'AL',
  'IN',
  'FILLER',
  'COND',
  'ORDSUF',
  'AT',
  'H',
  'COMMA',
  'DASH',
  'AND',
  'OR',
  'ABOUT',
  'ALLDAY',
]);

/** "el sábado a las 10, no, a las 11": a phrase that corrects itself (R30; owner, 2026-11-12). */
const corrects = (toks: readonly Token[]) =>
  toks.some(
    (token, k) => token.t === 'NEG' && k > 0 && toks[k + 1]?.t === 'COMMA' && k + 2 < toks.length,
  );

/** Words that name what a plan is for ("para el vermut", "for the quiz"), and the tokens such a name may hold (R27). */
const PURPOSE = new Set(['para', 'pa', 'per', 'for', 'xa']);
const PLAIN_WORDS = new Set<TokenType>([
  'UNK',
  'FILLER',
  'ART',
  'ARTPL',
  'DE',
  'DEL',
  'A',
  'AL',
  'IN',
  'AND',
  'COMMA',
  'DASH',
]);
/** Expressions of one day, which a weekday said again can name ("mañana, o sea el martes"). */
const ONE_DAY = new Set<Expr['kind']>(['day', 'weekday', 'offset', 'weekdayInWeek', 'weekendDay']);
/** Expressions of a stretch of days, which "entre semana" or "cualquier día" after them split into days. */
const STRETCH = new Set<Expr['kind']>([
  'range',
  'pattern',
  'week',
  'span',
  'weekend',
  'weekends',
  'days',
]);
/** Monday to Friday. */
const WORKWEEK = [1, 2, 3, 4, 5];

/**
 * An item while the phrase is read: the item of the reading with the reader's own marks, which
 * are not part of the reading.
 */
interface Draft extends Item {
  /** Joined by a word ("y", "o", a comma) to what stands before it. */
  linked?: true;
  /** Set off by a comma. */
  apposed?: true;
  /** A holiday's own date. */
  holiday?: true;
  /** A weekend said whole ("tot el cap de setmana"). */
  whole?: true;
  /** A weekday said "siguiente", "following". */
  following?: true;
  /** Said after "que es", "o sea". */
  namely?: true;
  /** A day number said again of a named weekend. */
  days?: true;
}

/** The item of the reading: the draft without the reader's own marks. */
function itemOf(draft: Draft): Item {
  const item = { ...draft };
  delete item.linked;
  delete item.apposed;
  delete item.holiday;
  delete item.whole;
  delete item.following;
  delete item.namely;
  delete item.days;
  return item;
}

/**
 * "next week, Wednesday or Thursday at 8 pm", "la semana que viene el martes": a week said right before
 * weekdays is the week they belong to, never an option of its own (R5; owner, 2026-11-13). A weekday
 * joined to the week by "y" or "o" is not framed ("la semana que viene y el sábado").
 */
function framedByWeeks(items: Draft[]): Draft[] {
  const dropped = new Set<Draft>();
  items.forEach((item, n) => {
    if (
      item.expr.kind !== 'week' ||
      item.expr.offset === undefined ||
      item.times.length ||
      item.vague.length ||
      item.except.length
    ) {
      return;
    }
    const week = item.expr.offset;
    const days: { day: Draft; weekday: number }[] = [];
    for (let k = n + 1; ; k++) {
      const day = items[k];
      if (day?.expr.kind !== 'weekday' || !day.joined) break;
      if (!(k === n + 1 ? !day.linked || day.apposed : day.linked)) break;
      days.push({ day, weekday: day.expr.weekday });
    }
    if (!days.length) return;
    for (const { day, weekday } of days) day.expr = { kind: 'weekdayInWeek', weekday, week };
    dropped.add(item);
  });
  return items.filter((item) => !dropped.has(item));
}

/**
 * "el 7 de julio a las 21:30, que es martes", "el divendres 26 per la nit, o sea el viernes, a les 10": a bare
 * weekday after "que es", "o sea", "es decir", "és a dir", "i.e." names the day said just before it, never a new
 * one; the calendar gives the *mismatch* notice when it is not that day's weekday (R24; owner, 2026-11-13).
 */
function restatedDays(items: Draft[]): Draft[] {
  return items.filter((item, n) => {
    const before = items[n - 1];
    if (
      !item.namely ||
      !item.joined ||
      item.expr.kind !== 'weekday' ||
      item.expr.weeks ||
      before === undefined ||
      !ONE_DAY.has(before.expr.kind) ||
      before.restated !== undefined
    ) {
      return true;
    }
    before.restated = item.expr.weekday;
    if (!before.times.length && !before.vague.length) {
      before.times = item.times;
      before.vague = item.vague;
    }
    before.text = `${before.text} ${item.text}`;
    return false;
  });
}

/** The weekday of a bare weekday ("viernes") or of one said of several days ("both Fridays"). */
const bareWeekday = (expr: Expr): number | undefined =>
  expr.kind === 'weekday'
    ? expr.weeks
      ? undefined
      : expr.weekday
    : expr.kind === 'unbounded'
      ? expr.weekday
      : undefined;

/**
 * "el 3 o el 10 de julio, viernes los dos", "the 3rd or the 10th of July, both Fridays", "el 3 de julio, viernes":
 * a bare weekday set right after dated days that name no weekday says which weekday they are, never a new day;
 * the calendar gives the *mismatch* notice when one is not (R24; owner, 2026-11-13). A weekday joined to them by
 * "y" or "o", or listed with another weekday, is an option of its own ("el 3 de julio o el viernes").
 */
function confirmedDays(items: Draft[]): Draft[] {
  const bareDay = (item: Draft | undefined) =>
    item?.expr.kind === 'day' &&
    item.expr.ref.day !== undefined &&
    item.expr.ref.weekday === undefined &&
    item.restated === undefined;
  return items.filter((item, n) => {
    const weekday = item.except.length ? undefined : bareWeekday(item.expr);
    const next = items[n + 1];
    const listed =
      next?.linked === true && (next.expr.kind === 'weekday' || next.expr.kind === 'unbounded');
    const before = items[n - 1];
    if (
      weekday === undefined ||
      !item.joined ||
      (item.linked && !item.apposed) ||
      listed ||
      before === undefined ||
      !bareDay(before)
    ) {
      return true;
    }
    let k = n - 1;
    while (bareDay(items[k - 1]) && known(items[k]).linked) k--;
    for (const day of items.slice(k, n)) day.restated = weekday;
    if (!before.times.length && !before.vague.length) {
      before.times = item.times;
      before.vague = item.vague;
    }
    before.text = `${before.text} ${item.text}`;
    return false;
  });
}

/**
 * "el cap de setmana del 18 i 19 de juliol, quedem tot el cap de setmana": a weekend said whole right after
 * a weekend already named is that one, said again; "el primer finde de agosto, el 1 y el 2": day numbers set
 * after a named weekend and listed with "y" are its days, said again, and the calendar gives the *mismatch*
 * notice when they are not (R2; owner, 2026-11-13).
 */
function restatedWeekends(items: Draft[]): Draft[] {
  let named: Draft | null = null; // the weekend whose days are being said: "el primer finde de agosto, el 1 y el 2"
  return items.filter((item, n) => {
    const before = items[n - 1];
    const again =
      item.whole === true &&
      Object.keys(item.expr).length === 1 &&
      item.joined &&
      before !== undefined &&
      (before.expr.kind === 'weekend' || before.expr.kind === 'weekends');
    // a day number alone ("el 1"), not joined by "o"
    const day =
      item.expr.kind === 'day' &&
      Object.keys(item.expr.ref).join() === 'day' &&
      item.joined &&
      !item.orElse &&
      !item.except.length
        ? item.expr.ref.day
        : undefined;
    if (
      day !== undefined &&
      before?.expr.kind === 'weekend' &&
      Object.keys(before.expr).length > 1 &&
      item.apposed
    ) {
      named = before;
    } else if (!(day !== undefined && named && before?.days)) named = null;
    const days = named && (named === before || before?.days) ? named : null;
    if (days) {
      item.days = true; // for the next day number of the list
      days.dates = [...(days.dates ?? []), known(day)];
      days.text = `${days.text} ${item.text}`;
    }
    const said = again ? before : days;
    if (said && !said.times.length && !said.vague.length) {
      said.times = item.times;
      said.vague = item.vague;
    }
    return !said;
  });
}

const datedExpr = (expr: Expr) =>
  (expr.kind === 'day' && expr.ref.day !== undefined) ||
  (expr.kind === 'range' && (expr.start.day !== undefined || expr.end.day !== undefined));
/**
 * "este finde, o si no el siguiente sábado o domingo", "this weekend or the following Saturday or Sunday": a
 * Saturday or a Sunday said "siguiente", "following" as an option after a named weekend, and the weekend days
 * listed with it, are the days of the weekend after that one (R25; owner, 2026-11-13). Alone, "el siguiente
 * sábado" is the coming one (R5).
 */
function followingWeekend(items: Draft[]): Draft[] {
  /** The weekday of a Saturday or a Sunday joined by a word to what stands before it. */
  const weekendDay = (item: Draft | undefined) =>
    item?.expr.kind === 'weekday' &&
    [6, 0].includes(item.expr.weekday) &&
    !item.expr.weeks &&
    item.linked
      ? item.expr.weekday
      : undefined;
  items.forEach((item, n) => {
    const next = items[n + 1];
    if (
      item.expr.kind !== 'weekend' ||
      !next?.following ||
      !next.orElse ||
      weekendDay(next) === undefined
    ) {
      return;
    }
    const weekend = item.expr;
    for (let k = n + 1; ; k++) {
      const day = items[k];
      const weekday = weekendDay(day);
      if (day === undefined || weekday === undefined) break;
      day.expr = { kind: 'weekendDay', weekday, weekend, weeks: 1 };
    }
  });
  return items;
}

/**
 * A weekend beside the days it frames is no option of its own: before dates not joined to it, it names
 * the kind of plan ("weekend trip from Friday 17 to Sunday 19 July", R2); after a Saturday or a Sunday it
 * says which weekend they are ("el sábado o el domingo del finde que viene", R6, R25).
 */
function framedByWeekends(items: Draft[]): Draft[] {
  const dropped = new Set<Draft>();
  /** The weekday of a Saturday or a Sunday. */
  const weekendDay = (other: Draft | undefined) =>
    other?.expr.kind === 'weekday' && [6, 0].includes(other.expr.weekday)
      ? other.expr.weekday
      : undefined;
  items.forEach((item, n) => {
    const weekend = item.expr;
    // several weekends: only the days said beside them, below
    if (weekend.kind !== 'weekends' && weekend.kind !== 'weekend') return;
    const frame = (days: Draft[]) => {
      for (const day of days) {
        day.expr = { kind: 'weekendDay', weekday: known(weekendDay(day)), weekend };
        if (!day.times.length && !day.vague.length) {
          day.times = item.times;
          day.vague = item.vague;
        }
      }
      dropped.add(item);
    };
    const next = items[n + 1];
    if (
      Object.keys(weekend).length === 1 &&
      !item.times.length &&
      next &&
      !next.linked &&
      datedExpr(next.expr)
    ) {
      dropped.add(item);
      return;
    }
    let after = n; // "todos los fines de semana de julio, sábado y domingo": the days beside them say which (R2)
    for (;;) {
      const day = items[after + 1];
      if (weekendDay(day) === undefined || !(after === n ? day?.apposed : day?.linked)) break;
      after++;
    }
    if (after > n) {
      frame(items.slice(n + 1, after + 1));
      return;
    }
    let k = n;
    while (k > 0 && weekendDay(items[k - 1]) !== undefined && (k === n || known(items[k]).linked)) {
      k--;
    }
    if (k === n || item.linked) return;
    frame(items.slice(k, n));
  });
  return items.filter((item) => !dropped.has(item));
}

/**
 * A holiday adds its date only when the phrase gives no date of its own; beside one it names the plan
 * ("los sábados 5, 12 y 19 de diciembre para la cena de navidad" adds no 25 December), unless it is
 * listed with the dates by "y", "o" or a comma ("Nochebuena o el 26"). R17, owner, 2026-11-12.
 */
function holidaysAsNames(items: Draft[]): Draft[] {
  const dated = items.some(
    (item) => !item.holiday && !['unknown', 'past', 'unbounded'].includes(item.expr.kind),
  );
  if (!dated) return items;
  const name = (item: Draft, n: number) =>
    item.holiday === true && !item.linked && !items[n + 1]?.linked;
  items.forEach((item, n) => {
    // its time is the date's: "el divendres 11 de setembre, que és la Diada, de 10:00 a 13:00"
    if (!name(item, n) || (!item.times.length && !item.vague.length)) return;
    const near = [items[n - 1], items[n + 1]].find(
      (other, side) =>
        other !== undefined &&
        !name(other, side ? n + 1 : n - 1) &&
        !other.times.length &&
        !other.vague.length,
    );
    if (near) {
      near.times = item.times;
      near.vague = item.vague;
    }
  });
  return items.filter((item, n) => !name(item, n));
}

/**
 * The same hour said again with "también" takes the half of the day said for it once ("hoy a las 10 de
 * la noche o mañana a las 10 también": 22:00 both days; R13, owner, 2026-11-12).
 */
function sameHourAgain(items: readonly Item[]): void {
  const clocks = items.flatMap((item) => item.times.flatMap((time) => (time.at ? [time.at] : [])));
  for (const clock of clocks) {
    if (clock.mark) continue;
    const marks = new Set(
      clocks.flatMap((other) =>
        other.mark && other.h === clock.h && other.m === clock.m ? [other.mark] : [],
      ),
    );
    const [mark] = marks;
    if (marks.size === 1 && mark) clock.mark = mark;
  }
}

/** Takes out of a list, in place, the fragments said. */
function removeFrom(list: string[], said: ReadonlySet<string>): void {
  list.splice(0, list.length, ...list.filter((fragment) => !said.has(fragment)));
}

/** What a rule of the grammar read at a token: a date expression and the token after it. */
interface Hit {
  expr: Expr;
  next: number;
  /** A holiday's own date, or what a movable one names. */
  holiday?: true;
  /** A weekend said whole. */
  whole?: true;
  /** A vague time said inside the date ("los sábados por la noche de julio"). */
  vague?: string;
  /** The half of the day the date itself says ("esta tarde"). */
  half?: Half | undefined;
}
interface RefAt {
  ref: DayRef;
  next: number;
}
interface PeriodAt {
  period: Period;
  next: number;
}
/** A year said after a date or a month. */
interface YearSaid {
  year?: number | undefined;
  yearOffset?: number | undefined;
}
interface ClockAt {
  clock: Clock;
  next: number;
}
interface TimeRead {
  time: Time;
  next: number;
  /** More ranges with the same start: "hasta las 3 o las 4". */
  also?: Time[];
}
type TimeFace = Omit<TimeAt, 'text'> | Omit<TimeRange, 'text'> | { unreadable: true };
/** A vague word said of the times being read. */
interface Word {
  half: Half | null;
  text: string;
  used: boolean;
}
/** Tokens between items that no rule read. */
interface Run {
  from: number;
  to: number;
  content: boolean;
}

/**
 * Reads a phrase into its reading. `region`: the organizer's browser region ("ES", "US"…), for
 * dates in figures (R34).
 */
export function read(text: string, region?: string): Reading {
  const toks = tokenize(text, region);
  if (corrects(toks)) {
    // not understood, never guessed
    return {
      text: text.trim(),
      items: [],
      notUnderstood: [text.trim()],
      vague: [],
      numbers: false,
      aboutWhen: true,
      half: null,
    };
  }
  const tok = (i: number): Token => known(toks[i]);
  const T = (i: number): TokenType | undefined => toks[i]?.t;
  const is = (i: number, ...types: TokenType[]): boolean => {
    const type = T(i);
    return type !== undefined && types.includes(type);
  };
  const skip = (i: number, ...types: TokenType[]): number => {
    while (is(i, ...types)) i++;
    return i;
  };
  const frag = (from: number, to: number): string => text.slice(tok(from).start, tok(to - 1).end);
  /** The value of a token whose kind has one. */
  const val = (i: number): number => known(tok(i).v);
  const num = (i: number, weak = false): number | null =>
    T(i) === 'NUM' && (weak || !tok(i).weak) ? val(i) : null;
  const yearAt = (i: number): boolean => {
    const v = num(i);
    return v !== null && isYear(v);
  };
  const timeTail = (i: number): boolean => is(i, 'H', 'PM', 'AM', 'MIN', 'ABOUT', 'QUARTS');
  const dayNum = (i: number): number | null => {
    const v = num(i);
    return v !== null && v >= 1 && v <= 31 && !timeTail(i + 1) ? v : null;
  };
  /** Ordinals that end in "of" a month are days of it: "el primero de julio", "the sixth through the tenth of july" (R16). */
  const ordinalDay = (k: number): boolean =>
    is(k, 'ORD') &&
    val(k) > 0 &&
    ((is(k + 1, 'DE') && is(k + 2, 'MO')) ||
      (is(k + 1, 'TO', 'AL', 'A', 'DASH', 'UNTIL', 'AND', 'OR', 'COMMA') &&
        ordinalDay(skip(k + 2, 'ART'))));
  const yearAfter = (ref: YearSaid, j: number): number => {
    const k = skip(j, 'DE', 'DEL', 'COMMA');
    if (yearAt(k)) {
      ref.year = val(k);
      return k + 1;
    }
    if (is(k, 'NEXTYEAR')) {
      ref.yearOffset = 1; // "del año que viene" (R4; owner, 2026-11-13)
      return k + 1;
    }
    return j;
  };
  /** The year said once for several months is the year of each. */
  const inYear = (months: MonthRef[], { year, yearOffset }: YearSaid): void => {
    if (year) for (const month of months) month.year = year;
    if (yearOffset) for (const month of months) month.yearOffset = yearOffset;
  };

  // ── the phrase ────────────────────────────────────────────────────────────
  const items: Draft[] = [];
  const notUnderstood: string[] = [];
  const vague: string[] = []; // vague times said of no date ("el viernes a las 8 y por la tarde"): reported as a time (R9)
  const loose: { half: Half | undefined; text: string }[] = []; // vague times said before their date ("por la noche, el sábado"): they are that date's
  let numbers = false; // a number was left unread: the phrase talks about something that is not a date
  const counts: string[] = []; // numbers that count things ("tres opciones"): ignored beside dates, reported when there are none (R30)
  let silent = false; // inside a condition unrelated to dates (R27): nothing is reported until the next date
  let run: Run | null = null; // tokens between items that no rule read
  let gap = false; // something not understood stood between the last item and here
  let addedAt = -1; // the token after ", y" that closed an exception: what follows is added to the phrase (R16)
  const ahead: Time[] = []; // times said before their date ("a las 18 o a las 20 el viernes"), or after a date that has its own
  /** The months said before a colon or with the coming year frame what follows (owner, 2026-11-13). */
  let framing: MonthRef[] | null = null;
  let framedFrom = -1;

  /** "the twenty first of august or the twenty second": an ordinal listed after a day of the month is a day too (R16; owner, 2026-11-13). */
  const listedOrdinal = (k: number): boolean => {
    if (
      !is(k, 'ORD') ||
      val(k) < 1 ||
      val(k) > 31 ||
      is(k + 1, 'WD', 'WEEKEND', 'WEEKENDPL', 'WEEK', 'WEEKS')
    ) {
      return false;
    }
    let b = k - 1;
    while (is(b, 'ART')) b--;
    const last = items.at(-1);
    return (
      is(b, 'OR', 'AND', 'COMMA') &&
      !run &&
      last?.expr.kind === 'day' &&
      last.expr.ref.day !== undefined
    );
  };
  const framedMonths = (): MonthRef[] | null =>
    framing ? framing.map((month) => ({ ...month })) : null;
  /** The framing months as the period of what is read up to `next`. */
  const framed = (next: number): PeriodAt | null => {
    const months = framedMonths();
    return months ? { period: { months }, next } : null;
  };
  /**
   * "dic: los sábados 5, 12 y 19", "next January: Saturday the 9th", "el año que viene en enero el sábado 9",
   * "en enero del año que viene el sábado 16": a month said before a colon, or with the coming year before a
   * day, is the month of the days that follow (R4, R24; owner, 2026-11-13).
   */
  function monthFrame(i: number): { months: MonthRef[]; next: number } | null {
    let j = skip(i, 'ART');
    const yearFirst = is(j, 'NEXTYEAR');
    j = skip(yearFirst ? j + 1 : i, 'IN', 'DE', 'NEXT', 'ART');
    if (!is(j, 'MO')) return null;
    const month: MonthRef = { month: val(j) };
    let k = j + 1;
    const yearLater = is(skip(k, 'DE', 'DEL'), 'NEXTYEAR');
    if (yearLater) k = skip(k, 'DE', 'DEL') + 1;
    if (yearFirst || yearLater) month.yearOffset = 1;
    if (is(k, 'COMMA') && tok(k).colon) return { months: [month], next: k + 1 };
    const day = skip(k, 'COMMA');
    const r = yearFirst || yearLater ? dayRef(day) : null;
    return r?.ref.day !== undefined && r.ref.month === undefined
      ? { months: [month], next: day }
      : null;
  }

  // ── day references ────────────────────────────────────────────────────────
  function dayRef(i: number, weekdayOnly = false): RefAt | null {
    let j = skip(i, 'ART');
    if (is(j, 'DMY')) {
      const { day, month, year } = tok(j);
      return { ref: { day, month, year }, next: j + 1 };
    }
    // "June 24", "Aug 3rd, 2026", "July the 3rd"
    const monthFirst = (k: number, ref: DayRef): RefAt | null => {
      if (!is(k, 'MO')) return null;
      const at = is(k + 1, 'ART') && dayNum(k + 2) !== null ? k + 2 : k + 1;
      const day = dayNum(at);
      if (day === null) return null;
      ref.month = val(k);
      ref.day = day;
      return { ref, next: yearAfter(ref, skip(at + 1, 'ORDSUF')) };
    };
    const ref: DayRef = {};
    const english = monthFirst(j, ref);
    if (english) return english;
    if (is(j, 'DAY') && dayNum(j + 1) !== null) j++;
    else if (is(j, 'ARTPL') && is(j + 1, 'DAYS') && dayNum(j + 2) !== null) j += 2; // "los días 3, 4 y 5 de julio" (R14)
    if (is(j, 'WD')) {
      ref.weekday = val(j);
      j++;
      const k = skip(j, 'COMMA', 'DAY', 'ART');
      const afterWeekday = monthFirst(k, ref);
      if (afterWeekday) return afterWeekday;
      if (dayNum(k) !== null) j = k;
    }
    let day = dayNum(j);
    if (day === null && (ordinalDay(j) || listedOrdinal(j))) day = val(j); // "el primero de julio", "from the sixth through the tenth of july"
    if (day === null) return ref.weekday !== undefined && weekdayOnly ? { ref, next: j } : null;
    ref.day = day;
    j = skip(j + 1, 'ORDSUF');
    const k = is(j, 'DE', 'DEL') ? j + 1 : j;
    if (is(k, 'MO')) {
      ref.month = val(k);
      j = yearAfter(ref, k + 1);
    }
    return { ref, next: j };
  }
  function endRef(i: number): RefAt | null {
    let j = skip(i, 'ART');
    if (is(j, 'END')) {
      j = skip(j + 1, 'DE', 'DEL', 'ART');
      return is(j, 'MO') ? { ref: { endOfMonth: val(j) }, next: j + 1 } : null;
    }
    return dayRef(j, true) ?? (is(j, 'MO') ? { ref: { endOfMonth: val(j) }, next: j + 1 } : null);
  }

  // ── periods ("de julio", "hasta finales de julio", "de la semana que viene") ─
  function period(i: number): PeriodAt | null {
    let j = i;
    if (is(j, 'FROMNOW', 'UNTIL')) {
      const e = endRef(j + 1);
      return e && { period: { to: e.ref }, next: e.next };
    }
    if (is(j, 'BEFORE')) {
      const e = dayRef(j + 1, true);
      return e && { period: { before: e.ref }, next: e.next };
    }
    if (is(j, 'FROM', 'DEL', 'BETWEEN')) {
      const a = dayRef(j + 1, true);
      if (a && is(a.next, 'UNTIL', 'AL', 'A', 'TO', 'DASH', 'AND')) {
        const e = endRef(a.next + 1);
        if (e) return { period: { from: a.ref, to: e.ref }, next: e.next };
      }
    }
    if (is(j, 'DE', 'DEL', 'FROM', 'BETWEEN')) {
      // "de julio a septiembre", "entre julio y septiembre": every month from one to the other
      const a = skip(j + 1, 'ART');
      const b = skip(a + 2, 'ART');
      if (
        is(a, 'MO') &&
        (is(j, 'BETWEEN') ? is(a + 1, 'AND') : is(a + 1, 'A', 'AL', 'TO', 'UNTIL', 'DASH')) &&
        is(b, 'MO') &&
        dayNum(b + 1) === null
      ) {
        const [first, last] = [val(a), val(b)];
        const months: MonthRef[] = [];
        for (let month = first; ; month = (month % 12) + 1) {
          months.push({ month });
          if (month === last) break;
        }
        const year: YearSaid = {};
        const next = first <= last ? yearAfter(year, b + 1) : b + 1;
        inYear(months, year);
        return { period: { months, through: true }, next };
      }
    }
    if (is(j, 'DE', 'DEL', 'IN')) j++;
    j = skip(j, 'ART');
    if (is(j, 'MO')) {
      const months: MonthRef[] = [];
      while (is(j, 'MO')) {
        months.push({ month: val(j) });
        j++;
        let k = j;
        if (is(k, 'COMMA')) k++;
        if (is(k, 'AND', 'OR')) k++;
        if (is(k, 'DE')) k++;
        if (k > j && is(k, 'MO') && dayNum(k + 1) === null) j = k;
        else break; // "of July, August 3": a date follows
      }
      const year: YearSaid = {};
      j = yearAfter(year, j);
      inYear(months, year);
      return { period: { months }, next: j };
    }
    const pre = is(j, 'THIS') ? 'THIS' : is(j, 'NEXT') ? 'NEXT' : null;
    let k = pre ? j + 1 : j;
    if (is(k, 'MONTH', 'WEEK')) {
      const month = is(k, 'MONTH');
      k++;
      const post = is(k, 'NEXT');
      if (post) k++;
      const offset = pre === 'THIS' ? 0 : 1;
      if (pre || post) {
        return { period: month ? { monthOffset: offset } : { weekOffset: offset }, next: k };
      }
    }
    return null;
  }

  // ── date expressions ──────────────────────────────────────────────────────
  const countAt = (k: number): boolean =>
    (num(k) !== null && is(k + 1, 'NEXT')) || (is(k, 'NEXT') && num(k + 1) !== null);

  function holiday(i: number): Hit | null {
    let j = skip(i, 'ART');
    // "el próximo San Juan", "esta Navidad", "el San Juan que viene", "next Christmas": a fixed holiday is
    // already the coming one, so the word adds nothing, except said on the holiday itself, where "next"
    // means next year's (owner, 2026-11-13)
    const fixed = (k: number) =>
      is(k, 'HOLIDAY') ||
      (is(k, 'DAY') && is(k + 1, 'DE', 'DEL') && is(skip(k + 2, 'ART'), 'HOLIDAY'));
    const pre = is(j, 'THIS', 'NEXT') && fixed(skip(j + 1, 'ART')) ? T(j) : null;
    if (pre) j = skip(j + 1, 'ART');
    if (is(j, 'DAY') && is(j + 1, 'DE', 'DEL')) j = skip(j + 2, 'ART');
    if (is(j, 'HOLIDAY')) {
      const post = is(j + 1, 'NEXT');
      const k = skip(post ? j + 2 : j + 1, 'COMMA'); // "Sant Joan, que és dimarts 23": the date said wins, the holiday is its name (R17)
      const said = is(k, 'NAMELY')
        ? DATES.filter((rule) => rule !== holiday)
            .map((rule) => rule(k + 1))
            .find((hit) => hit !== null)
        : null;
      const following = pre === 'NEXT' || post;
      return (
        said ?? {
          expr: {
            kind: 'day',
            ref: { day: tok(j).day, month: tok(j).month },
            ...(following && { following }),
          },
          next: post ? j + 2 : j + 1,
          holiday: true,
        }
      );
    }
    // A movable holiday is never guessed (R17), nor what is named by it: "Easter weekend",
    // "el puente de mayo", "el finde de Semana Santa", "Easter Sunday".
    // Beside a date of the phrase's own it names the plan, as a fixed one does (holidaysAsNames; owner, 2026-11-13).
    if (is(j, 'MOVABLE')) {
      if (is(j + 1, 'WEEKEND', 'WEEK', 'WD', 'DAY')) {
        return { expr: { kind: 'unknown' }, next: j + 2, holiday: true };
      }
      const of = is(j + 1, 'DE', 'DEL') ? (period(j + 1) ?? dayRef(j + 2)) : null;
      return { expr: { kind: 'unknown' }, next: of ? of.next : j + 1, holiday: true };
    }
    if (is(j, 'WEEKEND', 'WEEK', 'WD')) {
      const k = skip(j + 1, 'DE', 'DEL', 'ART');
      if (k > j + 1 && is(k, 'MOVABLE')) {
        return { expr: { kind: 'unknown' }, next: k + 1, holiday: true };
      }
    }
    return null;
  }
  function relative(i: number): Hit | null {
    const j = skip(i, 'ART');
    const fixed = is(j, 'TODAY') ? 0 : is(j, 'TOMORROW') ? 1 : is(j, 'DAYAFTER') ? 2 : undefined;
    const on = skip(j + 1, 'ART'); // "a fortnight on Saturday": that weekday two weeks after its coming one (R21; owner, 2026-11-13)
    if (is(j, 'FORTNIGHT') && is(on, 'WD')) {
      return { expr: { kind: 'weekday', weekday: val(on), weeks: 2 }, next: on + 1 };
    }
    if (fixed !== undefined) return { expr: { kind: 'offset', days: fixed }, next: j + 1 };
    if (is(j, 'TODAYPART')) {
      return { expr: { kind: 'offset', days: 0 }, next: j + 1, half: tok(j).half }; // "esta tarde"
    }
    if (is(j, 'YESTERDAY')) return { expr: { kind: 'past' }, next: j + 1 };
    // "mañana o pasado", "mañana a las 9 y si no pasado": a bare "pasado" after "mañana" is the day after
    // tomorrow, said short (owner, 2026-11-12); never the "pasado" of a weekday, a week or a month
    if (
      j === i &&
      is(j, 'PAST') &&
      !is(
        i - 1,
        'WD',
        'WEEK',
        'WEEKS',
        'WEEKEND',
        'WEEKENDPL',
        'MONTH',
        'DAY',
        'DAYS',
        'MO',
        'NUM',
      ) &&
      toks
        .slice(0, i)
        .some((token, k) => token.t === 'TOMORROW' && !(token.morning && is(k - 1, 'WD')))
    ) {
      return { expr: { kind: 'offset', days: 2 }, next: j + 1 };
    }
    const k = is(j, 'WITHIN', 'IN', 'FROMNOW') ? j + 1 : j > i ? j : -1; // "dentro de dos semanas", "en dos semanas"
    const count = k >= 0 ? num(k, true) : null;
    if (count !== null && is(k + 1, 'DAY', 'DAYS', 'WEEK', 'WEEKS')) {
      return {
        expr: { kind: 'offset', days: count * (is(k + 1, 'WEEK', 'WEEKS') ? 7 : 1) },
        next: k + 2,
      };
    }
    return null;
  }
  // "a principios de agosto", "mid-July", "late July" (R23)
  function vaguePart(i: number): Hit | null {
    const j = skip(i, 'A', 'AL', 'AT', 'ART');
    if (!(is(j, 'PART', 'END') || (is(j, 'VAGUE') && tok(j).part))) return null;
    const p = period(skip(j + 1, 'DASH'));
    return p && !p.period.to && !p.period.before
      ? { expr: { kind: 'unknown' }, next: p.next }
      : null;
  }
  // "las dos primeras semanas de julio", "the first two weeks of July": one range from the 1st (R23)
  function firstWeeks(i: number): Hit | null {
    let j = skip(i, 'ART', 'ARTPL');
    let count = num(j, true);
    if (count !== null) j++;
    if (!(is(j, 'ORD') && val(j) === 1)) return null;
    j++;
    if (count === null && num(j, true) !== null) {
      count = num(j, true);
      j++;
    }
    count ??= 1;
    if (!is(j, 'WEEK', 'WEEKS') || count > 4) return null;
    const k = skip(j + 1, 'DE', 'DEL', 'ART');
    if (!is(k, 'MO')) return null;
    const month = val(k);
    const year: YearSaid = {};
    const next = yearAfter(year, k + 1);
    const start = { day: 1, month, ...year };
    return { expr: { kind: 'range', start, end: { ...start, day: 7 * count } }, next };
  }
  function half(i: number): Hit | null {
    const j = skip(i, 'ART');
    if (!(is(j, 'ORD') && is(j + 1, 'HALF'))) return null;
    const k = skip(j + 2, 'DE', 'DEL', 'ART');
    return is(k, 'MO') ? { expr: { kind: 'half', nth: val(j), month: val(k) }, next: k + 1 } : null;
  }
  /** The months an ordinal weekday or weekend is counted in: "de julio", "de julio y de agosto", "de marzo de 2027", "del mes que viene", "del mes" (this one). */
  function monthsAt(
    j: number,
  ): { of: { months: MonthRef[] } | { monthOffset: number }; next: number } | null {
    const said = period(j);
    if (said?.period.months) return { of: { months: said.period.months }, next: said.next };
    if (said?.period.monthOffset !== undefined) {
      return { of: { monthOffset: said.period.monthOffset }, next: said.next };
    }
    const k = skip(j + 1, 'ART');
    return is(j, 'DE', 'DEL', 'IN') && is(k, 'MONTH')
      ? { of: { monthOffset: 0 }, next: k + 1 }
      : null;
  }
  function ordinalAt(i: number): { v: number; next: number } | null {
    const k = skip(i, 'ART');
    if (is(k, 'ORD')) return { v: val(k), next: k + 1 };
    const v = num(k);
    const suffix =
      v !== null &&
      v >= 1 &&
      v <= 5 &&
      toks[k + 1]?.start === tok(k).end &&
      /^(st|nd|rd|th|er|ro|do|to|o|º|ª)$/i.test(frag(k + 1, k + 2));
    return suffix ? { v, next: k + 2 } : null; // "1er", "2do", "3rd"
  }
  /** "los dos primeros", "the last two": the first or the last n, as a list of ordinals. */
  function countedAt(i: number): { nth: number[]; next: number } | null {
    const k = skip(i, 'ART', 'ARTPL');
    const [count, at] =
      num(k) !== null && is(k + 1, 'ORD')
        ? [num(k), k + 1]
        : is(k, 'ORD') && num(k + 1) !== null
          ? [num(k + 1), k]
          : [null, -1];
    if (count === null || count < 2 || count > 5 || Math.abs(val(at)) !== 1) return null;
    const first = val(at) === 1;
    const list = Array.from({ length: count }, (_, n) => (first ? n + 1 : n - count));
    return { nth: list, next: k + 2 };
  }
  /** The ordinals said before a weekday or a weekend: one ("el último") or several ("el primero, el segundo y el último"). */
  function ordinals(i: number): { nth: Nth; next: number } | null {
    const counted = countedAt(i);
    if (counted) return counted;
    const first = ordinalAt(i);
    if (!first) return null;
    const list = [first.v];
    let j = first.next;
    for (;;) {
      const c = skip(j, 'COMMA', 'AND', 'OR');
      const more = c > j ? ordinalAt(c) : null;
      if (!more && is(j, 'MIN') && tok(j).fourth && is(j + 1, 'WD', 'WEEKEND')) {
        list.push(4); // "y cuarto" is read as a quarter past
        j++;
      }
      if (!more) return { nth: list.length === 1 ? known(list[0]) : list, next: j };
      list.push(more.v);
      j = more.next;
    }
  }
  function nthWeekday(
    i: number,
  ): { expr: NthExpr | NthEachMonthExpr | { kind: 'past' }; next: number } | null {
    const said = ordinals(i);
    if (!said || !is(said.next, 'WD')) return null;
    const { nth } = said;
    const weekday = val(said.next);
    const j = said.next + 1;
    if (is(j, 'DE', 'DEL', 'IN')) {
      const k = skip(j + 1, 'ART');
      if (is(k, 'EACHMONTH')) {
        const e = is(k + 1, 'UNTIL') ? endRef(k + 2) : null;
        const within = e ? null : monthsAt(is(k + 1, 'COMMA') ? k + 2 : k + 1); // "de cada mes de julio a septiembre"
        if (within && 'months' in within.of) {
          return {
            expr: { kind: 'nth', nth, weekday, months: within.of.months },
            next: within.next,
          };
        }
        return {
          expr: { kind: 'nthEachMonth', nth, weekday, until: e?.ref },
          next: e ? e.next : k + 1,
        };
      }
      const months = monthsAt(j);
      if (months) return { expr: { kind: 'nth', nth, weekday, ...months.of }, next: months.next };
    }
    const frame = framedMonths();
    if (frame && !is(j, 'DE', 'DEL', 'IN')) {
      return { expr: { kind: 'nth', nth, weekday, months: frame }, next: j }; // "julio: el primer sábado"
    }
    const c = skip(j, 'COMMA', 'AND', 'OR'); // "el primer lunes y el segundo martes de julio": the month is said once
    const later = c > j ? nthWeekday(c) : null;
    if (later && later.expr.kind !== 'past')
      return { expr: { ...later.expr, nth, weekday }, next: j };
    return nth === -1 ? { expr: { kind: 'past' }, next: j } : null; // "last Monday"
  }
  function weekend(i: number): Hit | null {
    let j = skip(i, 'ART', 'EVERY', 'ARTPL');
    const any = is(j, 'ANY'); // "any weekend in September", "cualquier fin de semana de septiembre": each of them (R2; owner, 2026-11-13)
    if (any) j++;
    let nth: Nth | null = null;
    let count: number | null = null;
    if (
      is(j + 2, 'WEEKENDPL') &&
      ((num(j, true) !== null && is(j + 1, 'ORD')) || (is(j, 'ORD') && num(j + 1, true) !== null))
    ) {
      // R26
      const ordinal = val(is(j, 'ORD') ? j : j + 1);
      const p = period(j + 3);
      return p && Math.abs(ordinal) === 1
        ? {
            expr: {
              kind: 'weekends',
              period: p.period,
              take: ordinal * known(num(j, true) ?? num(j + 1, true)),
            },
            next: p.next,
          }
        : null;
    }
    const said = ordinals(j);
    if (said && is(said.next, 'WEEKEND')) {
      nth = said.nth;
      j = said.next;
    }
    if (countAt(j)) {
      count = num(j) ?? num(j + 1);
      j += 2;
    } else if (is(j, 'THIS', 'NEXT')) j++;
    if (is(j, 'WEEKENDPL')) {
      if (count !== null) return { expr: { kind: 'weekends', count }, next: j + 1 };
      const p = period(j + 1) ?? framed(j + 1);
      return p
        ? { expr: { kind: 'weekends', period: p.period }, next: p.next }
        : { expr: { kind: 'unbounded' }, next: j + 1 };
    }
    if (!is(j, 'WEEKEND')) return null;
    const whole = tok(j).whole; // "tot el cap de setmana": after a weekend already named, that one (restatedWeekends)
    j++;
    if (any) {
      const p = period(j) ?? framed(j);
      return p
        ? { expr: { kind: 'weekends', period: p.period }, next: p.next }
        : { expr: { kind: 'unbounded' }, next: j };
    }
    if (is(j, 'AFTERNEXT')) return { expr: { kind: 'weekend', after: 1 }, next: j + 1 }; // R25
    if (is(j, 'NEXT')) j++;
    if (nth !== null) {
      const months = monthsAt(j);
      if (months) return { expr: { kind: 'weekend', nth, ...months.of }, next: months.next };
      return { expr: { kind: nth === -1 ? 'past' : 'unbounded' }, next: j };
    }
    if (is(j, 'DE', 'DEL')) {
      const days = rangeOf(j); // "excursión de fin de semana del viernes 17 al domingo 19 de julio": those days (R2)
      if (days) return days;
      const r = dayRef(j + 1);
      // "el fin de semana del 25 y 26 de julio": its two days, the month said once with the second (R2)
      const pair = r && is(r.next, 'AND') && r.ref.month === undefined ? dayRef(r.next + 1) : null;
      if (
        r &&
        pair?.ref.day === known(r.ref.day) + 1 &&
        pair.ref.month !== undefined &&
        pair.ref.weekday === undefined
      ) {
        return {
          expr: {
            kind: 'weekend',
            containing: { ...r.ref, month: pair.ref.month, year: pair.ref.year },
          },
          next: pair.next,
        };
      }
      if (r) return { expr: { kind: 'weekend', containing: r.ref }, next: r.next };
    }
    return { expr: { kind: 'weekend' }, next: j, ...(whole && { whole }) };
  }
  function week(i: number): Hit | null {
    let j = skip(i, 'ART');
    const pre = is(j, 'THIS') ? 'THIS' : is(j, 'NEXT') ? 'NEXT' : null;
    if (pre) j++;
    if (!is(j, 'WEEK')) return null;
    j++;
    if (is(j, 'AFTERNEXT')) return { expr: { kind: 'week', offset: 2 }, next: j + 1 }; // R25
    const post = is(j, 'NEXT');
    if (post) j++;
    if (is(j, 'DE', 'DEL')) {
      const days = rangeOf(j); // "la semana del 13 al 17 de julio": those days
      if (days) return days;
      const r = dayRef(j + 1);
      if (r) return { expr: { kind: 'week', containing: r.ref }, next: r.next };
    }
    if (pre === 'NEXT' || post) return { expr: { kind: 'week', offset: 1 }, next: j };
    return pre === 'THIS' ? { expr: { kind: 'week', offset: 0 }, next: j } : null;
  }
  function pattern(i: number): Hit | null {
    let j = i;
    let trigger = false;
    if (is(j, 'ART') && countAt(j + 1)) j++;
    if (is(j, 'EVERY', 'ANY')) {
      trigger = true;
      j++;
    }
    if (is(j, 'ARTPL')) {
      trigger = true;
      j++;
    }
    let count: number | null = null;
    if (countAt(j)) {
      count = num(j) ?? num(j + 1);
      j += 2;
    } else if (trigger && is(j, 'NEXT')) j++;
    const listed: number[] = [];
    const all = is(j, 'DAYS') || (trigger && is(j, 'DAY'));
    if (all) {
      if (dayNum(j + 1) !== null) return null; // "los días 3 y 5 de julio" is a list
      j++;
    } else {
      while (is(j, 'WD')) {
        listed.push(val(j));
        trigger ||= tok(j).plural === true;
        j++;
        let k = j;
        if (is(k, 'COMMA')) k++;
        if (is(k, 'AND', 'OR')) k++;
        k = skip(k, 'ARTPL');
        if (k > j && is(k, 'WD') && dayNum(k + 1) === null) j = k;
        else break;
      }
      if (!listed.length || dayNum(j) !== null) return null;
    }
    const weekdays = all ? 'all' : listed;
    if (count !== null) return { expr: { kind: 'pattern', weekdays, count }, next: j };
    const v = is(j, 'VAGUE') && !tok(j).part && period(j + 1) ? j : -1; // "los sábados por la noche de julio": the days are kept, the time is reported (R9)
    const from = v < 0 ? j : j + 1;
    const p = period(from) ?? (trigger ? framed(from) : null); // "octubre: todos los sábados"
    if (p && !trigger && p.period.months && dayNum(p.next) !== null) return null; // "Monday June 23rd" is one day
    if (p) {
      return {
        expr: { kind: 'pattern', weekdays, period: p.period },
        next: p.next,
        ...(v >= 0 && { vague: frag(v, v + 1), half: tok(v).half }),
      };
    }
    // "both Fridays": for confirmedDays
    return trigger
      ? {
          expr: { kind: 'unbounded', ...(!all && listed.length === 1 && { weekday: listed[0] }) },
          next: j,
        }
      : null;
  }
  function range(i: number): Hit | null {
    const w = skip(i, 'ART'); // "Friday to Sunday 26–28 June": the weekdays of the days said after them
    if (is(w, 'WD') && is(w + 1, 'TO', 'AL', 'A', 'DASH') && is(w + 2, 'WD')) {
      const days = rangeOf(w + 3);
      if (days && days.expr.start.weekday === undefined && days.expr.end.weekday === undefined) {
        const { start, end } = days.expr;
        return {
          expr: {
            kind: 'range',
            start: { ...start, weekday: val(w) },
            end: { ...end, weekday: val(w + 2) },
          },
          next: days.next,
        };
      }
    }
    const found = rangeOf(i);
    if (!found) return null;
    // "del lunes al jueves de la semana que viene": two weekdays and the week they belong to
    const { start, end } = found.expr;
    const week = [start, end].every((ref) => ref.weekday !== undefined && ref.day === undefined)
      ? period(found.next)
      : null;
    const weekOffset = week?.period.weekOffset;
    return !week || weekOffset === undefined
      ? found
      : { expr: { ...found.expr, week: weekOffset }, next: week.next };
  }
  function rangeOf(i: number): { expr: RangeExpr; next: number } | null {
    const j = skip(i, 'ART');
    const starter = is(j, 'DEL', 'FROM', 'BETWEEN') || (is(j, 'DE') && is(j + 1, 'WD'));
    if (starter) {
      const a = dayRef(j + 1, true);
      if (
        !a ||
        !(is(j, 'BETWEEN') ? is(a.next, 'AND') : is(a.next, 'AL', 'A', 'TO', 'UNTIL', 'DASH'))
      ) {
        return null;
      }
      const b = dayRef(a.next + 1, true);
      return b && { expr: { kind: 'range', start: a.ref, end: b.ref }, next: b.next };
    }
    const a = dayRef(j, true); // "Aug 3-7", "3 al 7 de agosto", "Friday to Sunday"
    if (a && is(a.next, 'DASH', 'AL', 'TO')) {
      const b = dayRef(a.next + 1, true);
      if (b) return { expr: { kind: 'range', start: a.ref, end: b.ref }, next: b.next };
    }
    return null;
  }
  const bareNumber = (ref: DayRef): boolean =>
    ref.day !== undefined && ref.month === undefined && ref.weekday === undefined;
  function singleDay(i: number): Hit | null {
    const r = dayRef(i);
    if (!r) return null;
    // "somos 12 y pagamos 30": a lone number right after an unknown word is not a day
    const listed = is(r.next, 'COMMA', 'AND', 'OR') && dayRef(r.next + 1) !== null;
    // nor one right before it ("mesa para 2 familias")
    if (
      bareNumber(r.ref) &&
      is(i, 'NUM') &&
      (is(i - 1, 'UNK') || is(r.next, 'UNK') || (is(i - 1, 'FILLER') && is(r.next, 'FILLER'))) &&
      !listed
    ) {
      return null; // "propongo tres opciones"
    }
    return { expr: { kind: 'day', ref: r.ref }, next: r.next };
  }
  function weekdaySingle(i: number): Hit | null {
    let j = skip(i, 'ART');
    let past = false;
    if (is(j, 'THIS', 'NEXT')) j++;
    else if (is(j, 'ORD') && val(j) === -1 && is(j + 1, 'WD')) {
      past = true;
      j++;
    }
    if (!is(j, 'WD')) return null;
    const weekday = val(j);
    j++;
    if (is(j, 'NEXT')) j++;
    if (is(j, 'PAST')) {
      past = true;
      j++;
    }
    if (is(j, 'DE', 'DEL')) {
      let k = skip(j + 1, 'ART');
      const pre = is(k, 'THIS') ? 'THIS' : is(k, 'NEXT') ? 'NEXT' : null;
      if (pre) k++;
      if (is(k, 'WEEK')) {
        const post = is(k + 1, 'NEXT');
        if (pre || post) {
          return {
            expr: { kind: 'weekdayInWeek', weekday, week: pre === 'THIS' ? 0 : 1 },
            next: k + 1 + (post ? 1 : 0),
          };
        }
      }
    }
    return { expr: past ? { kind: 'past' } : { kind: 'weekday', weekday }, next: j };
  }
  // a period named with nothing else
  function alone(i: number): Hit | null {
    if (is(i, 'MO') && text.slice(tok(i).start, tok(i).end) === 'may') return null; // "we may meet": English "May" needs "in" or a capital
    const p = period(i);
    if (!p) return null;
    const { months, monthOffset, before, from, to } = p.period;
    if (months || monthOffset !== undefined) {
      return { expr: { kind: 'span', period: p.period }, next: p.next }; // R22: a bare month is one range
    }
    if (before || (to && !from)) {
      return { expr: { kind: 'pattern', weekdays: 'all', period: p.period }, next: p.next }; // R18: one option per day
    }
    return null;
  }
  /**
   * "cualquier tarde de la semana que viene", "any evening from July 6 to July 9": every day, the time vague (R9, R16).
   * "Entre semana", "laborable", "weekday" after "cualquier", "any" keep Monday to Friday of them: "any weekday evening
   * in the week of 20 July", "cualquier día laborable de la semana del 6 al 10 de julio" (R9; owner, 2026-11-13).
   */
  function anyPart(i: number): Hit | null {
    if (!is(i, 'ANY')) return null;
    let j = i + 1;
    if (is(j, 'DAY')) j++;
    let vagueAt = -1;
    const part = () => {
      if (vagueAt < 0 && is(j, 'VAGUE') && !tok(j).part) vagueAt = j++;
    };
    part();
    const workdays = is(j, 'WORKDAYS');
    if (workdays) j++;
    part();
    if (!workdays && vagueAt < 0) return null;
    const k = is(j, 'DE', 'IN') ? j + 1 : j;
    for (const rule of DATES.slice(1)) {
      const hit = rule(k);
      if (hit) {
        const expr: Expr = { kind: 'days', of: hit.expr, ...(workdays && { weekdays: WORKWEEK }) };
        return {
          expr,
          next: hit.next,
          ...(vagueAt >= 0 && { vague: frag(vagueAt, vagueAt + 1), half: tok(vagueAt).half }),
        };
      }
    }
    return null;
  }
  const DATES: ((i: number) => Hit | null)[] = [
    anyPart,
    holiday,
    firstWeeks,
    relative,
    vaguePart,
    half,
    nthWeekday,
    weekend,
    week,
    pattern,
    range,
    singleDay,
    weekdaySingle,
    alone,
  ];
  /** The date the first rule that reads one finds at a token. */
  const dateAt = (i: number): Hit | null => {
    for (const rule of DATES) {
      const hit = rule(i);
      if (hit) return hit;
    }
    return null;
  };

  // ── times ─────────────────────────────────────────────────────────────────
  const heard = new WeakMap<Clock, Half>(); // the half of the day said of noon or midnight, which keep no mark of their own
  function clock(i: number): ClockAt | null {
    let j = i;
    let h: number;
    let m = 0;
    let zero = false;
    if (is(j, 'MIDNIGHT')) return { clock: { h: 24, m: 0, mark: null, zero: true }, next: j + 1 }; // "de 10 a medianoche"
    if (is(j, 'NOON')) return { clock: { h: 12, m: 0, mark: null, zero: true }, next: j + 1 }; // "from noon to 6pm"
    const before = is(j, 'MINBEFORE') ? val(j++) : null; // "half past eight", "quarter to nine"
    if (quarters(j)) {
      // "dos quarts de deu" = 9:30: the quarters count toward the next hour
      const next = known(num(j + 2, true));
      h = next === 1 ? 12 : next - 1;
      m = 15 * known(num(j, true));
      j += 3;
    } else if (is(j, 'TIME')) {
      const time = tok(j);
      h = known(time.h);
      m = known(time.m);
      zero = known(time.zero);
      j++;
      if (is(j, 'H')) j++;
    } else {
      const v = num(j, true);
      if (v === null || v > 24) return null;
      h = v;
      zero = tok(j).zero === true;
      j++;
      if (is(j, 'H')) {
        j++;
        const minutes = num(j);
        if (minutes !== null && minutes < 60 && tok(j).start === tok(j - 1).end) {
          m = minutes;
          j++;
        }
      }
    }
    if (before !== null) {
      if (before < 0) {
        h -= 1;
        m = 60 + before;
      } else m = before;
    }
    if (is(j, 'MIN')) {
      const delta = val(j);
      if (delta < 0) {
        h -= 1;
        m = 60 + delta;
      } else m = delta;
      j++;
    }
    if (is(j, 'DASH') && is(j + 1, 'ABOUT')) j++; // "6-ish"
    j = skip(j, 'FILLER', 'ABOUT');
    let mark: Half | null = null;
    // "10 de la noche", "10 at night"
    const says: Half | null = is(j, 'PM')
      ? 'PM'
      : is(j, 'AM')
        ? 'AM'
        : is(j, 'VAGUE') && tok(j).clock
          ? (tok(j).half ?? null)
          : null;
    if (says) {
      mark = says;
      const twelve = tok(j).twelve;
      if (h === 12 && twelve) {
        // noon or midnight, as the words say
        h = twelve;
        zero = true;
        if (h === 12) mark = null;
      }
      j++;
    }
    const result: Clock = { h, m, mark, zero };
    if (says && !mark) heard.set(result, says); // "las 10 o las 12 de la mañana": still said for the 10
    return { clock: result, next: j };
  }
  /** "un quart de deu", "dos quarts d'onze": one to three quarters toward an hour (Catalan). */
  const quarters = (k: number): boolean => {
    const n = num(k, true);
    return n !== null && n >= 1 && n <= 3 && is(k + 1, 'QUARTS') && num(k + 2, true) !== null;
  };
  /** "las"/"les" right before a number: the article of an hour, never of a day of the month. */
  const theHours = (i: number): boolean =>
    is(i, 'ARTPL') && Boolean(tok(i).hours) && num(i + 1, true) !== null;
  /**
   * A time at token i. An hour that does not exist ("a las 25", and after a date "de 25 a 27") is
   * still a time, `unreadable`: its date is kept and the time is reported, never read as a day.
   */
  function timeQual(i: number, afterDate = false): TimeRead | null {
    const j = i;
    const done = (time: TimeFace, next: number): TimeRead => ({
      time: { ...time, text: frag(i, next) },
      next,
    });
    if (is(j, 'SAMEHOUR')) {
      // "o el viernes a la misma hora", "or Saturday same time": the last hour said (R13; owner, 2026-11-13)
      const last = [...items.flatMap((item) => item.times), ...ahead]
        .filter((time): time is TimeAt | TimeRange => Boolean(time.at ?? time.start))
        .at(-1);
      if (!last) return null;
      return done(
        last.at ? { at: { ...last.at } } : { start: { ...last.start }, end: { ...last.end } },
        j + 1,
      );
    }
    if (is(j, 'ANYTIME') && is(j + 1, 'ATFROM', 'FROM')) {
      // "anytime after 8" is "after 8" (R10; owner, 2026-11-13)
      const after = timeQual(j + 1, afterDate);
      return after && { ...after, time: { ...after.time, text: frag(i, after.next) } };
    }
    const hour = (k: number): { clock?: Clock; next: number } | null =>
      clock(k) ?? (afterDate && (num(k, true) ?? 0) > 24 ? { next: k + 1 } : null);
    if (is(j, 'DE', 'FROM', 'ATFROM', 'BETWEEN')) {
      const a = hour(skip(j + 1, 'ARTPL', 'ART'));
      if (
        a &&
        (is(j, 'BETWEEN') ? is(a.next, 'AND') : is(a.next, 'A', 'AL', 'TO', 'UNTIL', 'DASH', 'AT'))
      ) {
        const b = hour(skip(a.next + 1, 'ARTPL', 'ART', 'AT')); // "to around 3 am": the hour as said (R10)
        const dateAhead = b && (is(b.next, 'MO') || (is(b.next, 'DE') && is(b.next + 1, 'MO')));
        if (b && !dateAhead) {
          const [start, end] = [a.clock, b.clock];
          if (!start || !end) return done({ unreadable: true }, b.next);
          // "hasta las 3 o las 4 de la madrugada": one range per end, the half of the day said last for all
          const tails: ClockAt[] = [{ clock: end, next: b.next }];
          for (let c = b.next; is(c, 'OR') && theHours(c + 1); c = known(tails.at(-1)).next) {
            const more = clock(c + 2);
            if (!more || is(more.next, 'A', 'AL', 'TO', 'UNTIL', 'DASH')) break;
            tails.push(more);
          }
          const last = known(tails.at(-1));
          for (const tail of tails) {
            if (!tail.clock.mark && last.clock.mark && tail.clock.h <= last.clock.h) {
              tail.clock.mark = last.clock.mark;
            }
          }
          const ranges = tails.map((tail) => ({ start, end: tail.clock }));
          return {
            ...done(known(ranges[0]), last.next),
            also: ranges.slice(1).map((time) => ({ ...time, text: frag(i, last.next) })),
          };
        }
      }
      const ends = (k: number) => k >= toks.length || is(k, 'AND', 'OR', 'COMMA');
      // "sábado de 22"
      const ofWeekday =
        is(j, 'DE') && afterDate && is(j - 1, 'WD') && a?.clock !== undefined && ends(a.next);
      // "from 10pm", "Saturday from 2"
      const fromHour =
        is(j, 'FROM') &&
        a?.clock !== undefined &&
        (a.clock.mark !== null ||
          is(skip(j + 1, 'ARTPL', 'ART'), 'TIME') ||
          (afterDate && is(j + 1, 'NUM') && ends(a.next)));
      if (!a || !(is(j, 'ATFROM') || (is(j, 'DE') && theHours(j + 1)) || ofWeekday || fromHour)) {
        return null;
      }
      return a.clock ? done({ at: a.clock }, a.next) : done({ unreadable: true }, a.next); // "de las 22"; "de las 25" is no hour
    }
    if (is(j, 'A') && quarters(j + 1)) {
      const said = known(clock(j + 1)); // "a dos quarts de deu"
      return done({ at: said.clock }, said.next);
    }
    if (is(j, 'A', 'AT') && is(j + 1, 'QUARTS') && num(j + 2, true) !== null) {
      return done({ unreadable: true }, j + 3); // "a quarts de deu": no exact hour (R9)
    }
    const named = is(j, 'NOON', 'MIDNIGHT')
      ? j
      : is(j, 'A', 'AL', 'AT') && is(j + 1, 'NOON', 'MIDNIGHT')
        ? j + 1
        : -1;
    if (named >= 0) {
      return done(
        { at: { h: is(named, 'NOON') ? 12 : 24, m: 0, mark: null, zero: true } },
        named + 1,
      );
    }
    if (theHours(j)) {
      // "sábado las 22", "a las 10 y las 12": an hour when nothing else follows it
      const a = clock(j + 1);
      if (a && (a.next >= toks.length || is(a.next, 'AND', 'OR', 'COMMA'))) {
        return done({ at: a.clock }, a.next);
      }
    }
    const bare =
      is(j, 'TIME') ||
      quarters(j) ||
      (is(j, 'MINBEFORE') && num(j + 1, true) !== null) || // "quarter to nine"
      (num(j) !== null &&
        (timeTail(j + 1) || (is(j + 1, 'DASH', 'TO') && num(j + 2) !== null && timeTail(j + 3)))); // "6 to 9 pm"
    if (is(j, 'AT') || bare) {
      const a = clock(is(j, 'AT') ? j + 1 : j);
      if (!a) {
        return is(j, 'AT') && (num(j + 1, true) ?? 0) > 24
          ? done({ unreadable: true }, j + 2)
          : null;
      }
      if (is(a.next, 'DASH', 'TO', 'A')) {
        const b = clock(skip(a.next + 1, 'ARTPL'));
        if (b) return done({ start: a.clock, end: b.clock }, b.next);
      }
      return done({ at: a.clock }, a.next);
    }
    return null;
  }
  /**
   * An exception at token i. `ofDays`: said of one stretch of days, where an ordinal is a day ("except the eighth");
   * `timed`: the phrase already has its time, so a vague time after the exception can only be the exception's.
   */
  function exceptQual(
    i: number,
    { ofDays, timed }: { ofDays: boolean; timed: boolean },
  ): { list: Except[]; next: number; unread?: string } | null {
    if (!is(i, 'EXCEPT')) return null;
    const list: Except[] = [];
    let j = i + 1;
    for (;;) {
      let k = skip(j, 'ART', 'ARTPL', 'DAY');
      if (is(k, 'WEEKEND', 'WEEKENDPL') && !is(k + 1, 'DE', 'DEL')) {
        list.push({ weekday: 6 }, { weekday: 0 }); // "menos los findes"
        k++;
      } else if (is(k, 'ORD')) {
        list.push(ofDays && val(k) > 0 ? { day: val(k) } : { nth: val(k) });
        k++;
        if (num(k) === 1 && /^\p{L}/u.test(frag(k, k + 1))) k++; // "except the first one"
      } else if (
        is(is(k, 'WD') ? k + 1 : k, 'MO') &&
        dayNum((is(k, 'WD') ? k + 1 : k) + 1) !== null
      ) {
        // "except (Wednesday) July 8"
        const m = is(k, 'WD') ? k + 1 : k;
        list.push({ day: known(dayNum(m + 1)), month: val(m) });
        k = skip(m + 2, 'ORDSUF');
      } else if (is(k, 'MO')) {
        list.push({ month: val(k) }); // "de julio a septiembre menos agosto"
        k++;
      } else if (is(k, 'WD') && dayNum(k + 1) === null) {
        list.push({ weekday: val(k) });
        k++;
      } else {
        if (is(k, 'WD')) k++;
        const day = dayNum(k);
        if (day === null) break;
        const except: { day: number; month?: number } = { day };
        k = skip(k + 1, 'ORDSUF');
        if (is(k, 'DE') && is(k + 1, 'MO')) {
          except.month = val(k + 1);
          k += 2;
        }
        list.push(except);
      }
      j = k;
      // "menos el miércoles por la noche": a vague time after the exception is the whole phrase's (R16)
      if (is(j, 'VAGUE') && !timed) break;
      // "all day except Saturday morning": part of a day is never left out by guess; the whole exception is reported
      if (is(j, 'VAGUE') || (is(j, 'TOMORROW') && tok(j).morning)) {
        return { list: [], unread: frag(i, j + 1), next: j + 1 };
      }
      let more = j;
      if (is(more, 'COMMA')) more++;
      if (is(more, 'AND') && (tok(more).also || more > j)) {
        // "excepto el jueves, y también el sábado", "menys dijous, i el dissabte": a day added (R16)
        if (list.length) addedAt = more + 1;
        break;
      }
      if (is(more, 'AND', 'OR')) more++;
      const beyond = skip(more, 'ART', 'DAY');
      if (more > j && (is(beyond, 'ORD', 'WD', 'MO') || dayNum(beyond) !== null)) j = more;
      else break;
    }
    return list.length ? { list, next: j } : null;
  }

  const closeRun = (): void => {
    if (!run) return;
    let { from, to } = run;
    while (from < to && NOISE.has(tok(from).t)) from++;
    while (to > from && NOISE.has(tok(to - 1).t)) to--;
    const leading = items.length === 0;
    // "para el vermut", "for the camping trip": the words after "para", "per", "for" with no date word name the plan (R27; owner, 2026-11-13)
    const purpose = (k: number) => PURPOSE.has(plain(frag(k, k + 1)));
    let p = from - 1; // the word may close a time read before ("de 12:00 a 15:00 para el vermut")
    while (p >= 0 && NOISE.has(tok(p).t) && !purpose(p)) p--;
    const plan =
      to > from &&
      p >= 0 &&
      purpose(p) &&
      toks.slice(from, to).every((token) => PLAIN_WORDS.has(token.t) && !token.fuzzy);
    if (plan) {
      run = null;
      return;
    }
    const counted =
      to > from &&
      toks.slice(from, to).every((token) => token.t === 'NUM' && !token.weak) &&
      is(to, 'FILLER', 'UNK');
    if (counted) {
      // "tres opciones": a count, not a date (R30)
      counts.push(frag(from, to));
      numbers = true;
      run = null;
      return;
    }
    if (to > from && (leading ? run.content : true)) {
      notUnderstood.push(frag(from, to));
      gap = true;
      vague.push(...loose.splice(0).map((word) => word.text)); // "por la tarde no puedo, mejor el viernes": not said of that date
      numbers ||= toks.slice(from, to).some((token) => token.t === 'NUM' && !token.weak);
    }
    run = null;
  };
  for (let i = 0; i < toks.length;) {
    const here = tok(i);
    if (silent && here.fuzzy) {
      i++; // "si arreglan el coche": no typo is guessed inside a condition
      continue;
    }
    const spoken = num(i) !== null && is(i + 1, 'VAGUE') && tok(i + 1).clock ? clock(i) : null;
    if (spoken && DATES.some((rule) => rule(spoken.next))) {
      // "10 at night on Friday": the time of the date that follows
      closeRun();
      ahead.push({ at: spoken.clock, text: frag(i, spoken.next) });
      i = spoken.next;
      continue;
    }
    const frame = monthFrame(i);
    if (frame) {
      closeRun();
      framing = frame.months;
      framedFrom = items.length;
      i = frame.next;
      continue;
    }
    const dated = dateAt(i);
    // "si somos más de 10"
    const hit =
      dated && silent && dated.expr.kind === 'day' && bareNumber(dated.expr.ref) ? null : dated;
    if (hit) {
      silent = false;
      // "este viernes no, el siguiente" / "no este viernes, el siguiente": the occurrence after a
      // rejected one is not understood, by decision; the whole fragment is reported
      const denied = is(i - 1, 'NEG', 'EXCEPT') && run?.to === i;
      const turn = denied ? hit.next : is(hit.next, 'NEG') ? hit.next + 1 : -1;
      const other = turn < 0 ? -1 : skip(turn, 'COMMA', 'FILLER', 'OR', 'ART');
      const rejected = other >= 0 && is(other, 'NEXT', 'NEXTONE') && !is(other + 1, 'NUM');
      const from = rejected && denied ? i - 1 : i;
      if (from < i && run) {
        run.to--;
        if (run.to === run.from) run = null;
      }
      closeRun();
      const item: Draft = {
        expr: rejected ? { kind: 'unknown' } : hit.expr,
        times: [],
        except: [],
        vague: [],
        joined: !gap,
        text: '',
      };
      if ((is(i - 1, 'AND') && tok(i - 1).also) || i === addedAt) item.also = true; // "y también el sábado"; "menys dijous, i el dissabte" (R16)
      if (is(i - 1, 'AND', 'OR', 'COMMA')) item.linked = true; // joined by a word, for framedByWeekends
      if (is(i - 1, 'OR')) item.orElse = true; // "el viernes 26 o el sábado": a weekday after a dated day (R5)
      if (is(i - 1, 'COMMA')) item.apposed = true; // set off by a comma, for framedByWeekends
      if (hit.holiday) item.holiday = true; // a fixed holiday's own date, for holidaysAsNames
      if (hit.whole) item.whole = true; // "tot el cap de setmana", for restatedWeekends
      if (
        hit.expr.kind === 'weekday' &&
        toks.slice(i, hit.next).some((token) => token.t === 'NEXT' && token.after)
      ) {
        item.following = true; // "el siguiente sábado", for followingWeekend
      }
      if (is(T(i - 1) === 'ART' ? i - 2 : i - 1, 'NAMELY')) item.namely = true; // "que es martes", for restatedDays
      let j = rejected ? skip(other + 1, 'WD', 'WEEK', 'WEEKEND') : hit.next;
      // The half of the day said in words (R28) is for the times next to it, never for another date's:
      // said before a time, it is for that time and the ones listed after it ("por la tarde a las 5
      // o a las 6"); said after times, in words or with the last clock, it is for the ones before it
      // that have none and are no later hour ("a las 8 o a las 9 por la tarde", "at 8 or 9 pm").
      // A time left with none is asked; a vague time that no clock time used is reported (R9).
      const words: Word[] = [];
      let lead: Word | null = null; // the half said before the times being read
      let open: { time: Time; lead: Word | null }[] = []; // times that a half said after them may still take
      let allDay = false; // "todo el día" said: the phrase has its time
      const hourOf = (time: Time): number | undefined => (time.at ?? time.start)?.h;
      const give = (time: Time, word: { half: Half | null; used?: boolean }): void => {
        // "las mañanas de 10 a 1": a morning that ends at an earlier hour than it starts runs past noon (10:00–13:00; R28, owner, 2026-11-13)
        const pastNoon =
          word.half === 'AM' &&
          time.start !== undefined &&
          !time.end.mark &&
          time.end.h < time.start.h;
        for (const face of [time.at, time.start, time.end]) {
          if (face && !face.mark && !face.zero && face.h >= 1 && face.h <= 11) {
            face.mark = pastNoon && face === time.end ? 'PM' : word.half;
          }
        }
        word.used = true;
      };
      /** A half said after the open times: theirs up to the hour given; the rest keep the one said before them. */
      const close = (word: { half: Half | null; used?: boolean } | null, upTo?: number): void => {
        for (const waiting of open) {
          const hour = hourOf(waiting.time);
          if (word && hour !== undefined && upTo !== undefined && hour <= upTo) {
            give(waiting.time, word);
          } else if (waiting.lead) give(waiting.time, waiting.lead);
        }
        open = [];
      };
      const sayVague = (
        saidHalf: Half | null | undefined,
        said: string,
        timeFollows: boolean,
      ): void => {
        const word: Word = { half: saidHalf ?? null, text: said, used: false };
        words.push(word);
        // "por la mañana temprano, a las 9": a word with no half between the half and the hour keeps them together (R28)
        if (!word.half) {
          const before = words.at(-2);
          if (timeFollows && before?.half && !before.used && !open.length) lead = before;
          return;
        }
        const twice = words.at(-2); // "por la tarde después del trabajo, sobre las 7": one half said twice, both for that hour
        if (timeFollows && twice && !twice.used && twice.half === word.half && !open.length) {
          twice.used = true;
        }
        if (timeFollows) close(null);
        else {
          const last = open.at(-1);
          close(word, last ? hourOf(last.time) : 0);
        }
        lead = timeFollows ? word : null;
      };
      const addTime = (time: Time): void => {
        item.times.push(time);
        const face = time.at ?? time.end;
        const mark = face?.mark ?? (face && heard.get(face)); // "a las 8 o a las 9 de la tarde", "las 10 o las 12 de la mañana"
        if (mark) {
          // "por la noche, de las 12 a las 3 de la madrugada", "any evening … from 7 pm to 10 pm": said exactly
          if (lead && !lead.used && (lead.half === mark || !time.start?.mark)) give(time, lead);
          close({ half: mark }, known(hourOf(time)) - 1);
          lead = null;
          return;
        }
        if (lead && !lead.used) give(time, lead);
        else open.push({ time, lead });
      };
      if (ahead.length) {
        item.timesFirst = true; // also for the days joined after it
        for (const time of ahead.splice(0)) addTime(time);
      }
      for (const word of loose.splice(0)) sayVague(word.half, word.text, !open.length);
      const own = hit.vague ?? (hit.half ? frag(i, hit.next) : null); // "esta tarde", "los sábados por la noche de julio"
      if (own) sayVague(hit.half, own, !open.length);
      // "at 7 or 8, your call"
      const explicit = (c: number) =>
        is(c, 'AT', 'ATFROM', 'NOON', 'TIME', 'DE', 'FROM', 'BETWEEN') ||
        theHours(c) ||
        (num(c) !== null && (timeTail(c + 1) || c + 1 === toks.length || is(c + 1, 'COMMA')));
      const bare = (c: number): TimeRead | null => {
        if (num(c) === null) return null;
        const said = known(clock(c));
        return { time: { at: said.clock, text: frag(c, c + 1) }, next: said.next };
      };
      while (!rejected) {
        const k = is(j, 'COMMA') ? j + 1 : j;
        const time = timeQual(k, true);
        if (time) {
          addTime(time.time);
          time.also?.forEach(addTime);
          j = time.next;
          continue;
        }
        const c = is(k, 'AND', 'OR') ? k + 1 : k;
        if (item.times.length && c > j) {
          // "a las 18 o a las 20", "por la mañana a las 8 y por la tarde a las 5"
          const worded = is(c, 'VAGUE') && tok(c).half ? timeQual(c + 1) : null;
          const more = worded ?? (explicit(c) ? (timeQual(c) ?? bare(c)) : null);
          if (more) {
            if (worded) sayVague(tok(c).half, frag(c, c + 1), true);
            addTime(more.time);
            j = more.next;
            continue;
          }
        }
        const morning =
          k === hit.next && is(k, 'TOMORROW') && tok(k).morning === true && is(k - 1, 'WD'); // "sábado mañana"
        if (is(k, 'VAGUE') || morning) {
          sayVague(
            morning ? 'AM' : tok(k).half,
            frag(k, k + 1),
            timeQual(is(k + 1, 'COMMA') ? k + 2 : k + 1, true) !== null,
          );
          j = k + 1;
          continue;
        }
        // "siempre por la tarde", "1pm both days", "todos por la tarde": the time is each day's (R13; owner, 2026-11-13)
        if (
          is(k, 'EACH') ||
          (is(k, 'EVERY') && (is(k + 1, 'VAGUE') || timeQual(k + 1, true) !== null))
        ) {
          j = k + 1;
          continue;
        }
        if (is(k, 'WORKDAYS') && STRETCH.has(item.expr.kind)) {
          // "la semana que viene entre semana"
          item.expr = { kind: 'days', of: item.expr, weekdays: WORKWEEK };
          j = k + 1;
          continue;
        }
        if (
          is(k, 'ANY') &&
          is(k + 1, 'DAY') &&
          !is(k + 2, 'DE', 'DEL', 'IN') &&
          (item.expr.kind === 'range' || item.expr.kind === 'pattern')
        ) {
          // "de hoy hasta el viernes cualquier día"
          item.expr = { kind: 'days', of: item.expr };
          j = k + 2;
          continue;
        }
        const except = exceptQual(k, {
          ofDays: item.expr.kind === 'range',
          timed: item.times.length > 0 || allDay,
        });
        if (except) {
          item.except.push(...except.list);
          if (except.unread) notUnderstood.push(except.unread);
          j = except.next;
          continue;
        }
        if (is(k, 'ALLDAY')) {
          allDay = true; // "todo el día": the whole day, no time (R9)
          j = k + 1;
          continue;
        }
        if (is(k, 'ANY') && is(k + 1, 'VAGUE') && !tok(k + 1).part) {
          // "the week after next, any evening": each day of it
          item.expr = { kind: 'days', of: item.expr };
          sayVague(
            tok(k + 1).half,
            frag(k + 1, k + 2),
            timeQual(is(k + 2, 'COMMA') ? k + 3 : k + 2, true) !== null,
          );
          j = k + 2;
          continue;
        }
        break;
      }
      close(null);
      const settled = words.some((word) => word.used); // "el sábado por la mañana temprano a las 8": nothing is vague
      item.vague = words
        .filter((word) => !word.used && (word.half !== null || !settled))
        .map((word) => word.text);
      item.text = frag(from, j);
      items.push(item);
      gap = false;
      i = j;
      continue;
    }
    const time = timeQual(i);
    if (time) {
      closeRun();
      const last = items.at(-1);
      const said = [time.time, ...(time.also ?? [])];
      if (last && !last.times.length) last.times.push(...said);
      else ahead.push(...said);
      i = time.next;
      continue;
    }
    if (is(i, 'COND') || (here.cond && !DATES.some((rule) => rule(i + 1)))) {
      closeRun();
      silent = true;
      i++;
      continue;
    }
    if (silent && !SAYS_WHEN.has(here.t)) {
      i++;
      continue;
    }
    if (silent) silent = false; // "y si no pasado": a word that speaks of dates ends the condition, never dropped in silence
    if (is(i, 'VAGUE')) {
      closeRun();
      loose.push({ half: here.half, text: frag(i, i + 1) });
      i++;
      continue;
    }
    if (is(i, 'COMMA', 'AND', 'OR')) {
      closeRun();
      i++;
      continue;
    }
    run ??= { from: i, to: i, content: false };
    run.to = i + 1;
    if (!NOISE.has(here.t) && here.t !== 'UNK' && !here.weak) run.content = true;
    i++;
  }
  closeRun();
  if (!items.length) notUnderstood.push(...counts);
  items.at(-1)?.times.push(...ahead); // no date follows: they are more times of the last one, never lost in silence
  vague.push(...loose.map((word) => word.text)); // no date follows
  // "game night 6/27 or 7/11 8pm": a vague time word right after a word no rule reads names the plan
  // ("game night", "quiz night"); it gives way to the hour said, and is a vague time only when none is (R17)
  if (items.some((item) => item.times.some((time) => Boolean(time.at ?? time.start)))) {
    const names = new Set(
      toks.flatMap((token, k) =>
        token.t === 'VAGUE' && T(k - 1) === 'UNK' ? [frag(k, k + 1)] : [],
      ),
    );
    for (const item of items) item.vague = item.vague.filter((said) => !names.has(said));
    removeFrom(vague, names);
  }
  // a meal word speaks for every bare hour of the phrase: "cena", "desayuno" (R28)
  const saying = toks.filter(
    (token) => (token.t === 'FILLER' && token.half !== undefined) || token.meal !== undefined,
  );
  const halves = new Set(saying.flatMap((token) => token.meal ?? token.half ?? []));
  if (items.some((item) => item.times.length)) {
    // "around lunchtime, say 1ish": the lunch word said the hour's half, nothing is vague (R28)
    const meals = new Set(
      toks.filter((token) => token.meal).map((token) => text.slice(token.start, token.end)),
    );
    for (const item of items) item.vague = item.vague.filter((said) => !meals.has(said));
    removeFrom(vague, meals);
  }
  const [only] = halves;
  const said = halves.size === 1 && only ? only : null;
  // "comida": 12 to 4 only
  const hours =
    said && saying.every((token) => token.hours !== undefined) ? saying[0]?.hours : undefined;
  const halfHours = hours === true ? undefined : hours;
  const aboutWhen = toks.some(
    (token) => token.t === 'WHEN' || (!NOISE.has(token.t) && token.t !== 'UNK' && !token.weak),
  );
  if (toks.some((token) => token.t === 'AND' && token.also)) sameHourAgain(items);
  for (const item of framedFrom < 0 ? [] : items.slice(framedFrom)) {
    // "dic: los sábados 5, 12 y 19"
    const refs =
      item.expr.kind === 'day'
        ? [item.expr.ref]
        : item.expr.kind === 'range'
          ? [item.expr.start, item.expr.end]
          : [];
    for (const ref of refs) {
      if (ref.day !== undefined && ref.month === undefined) Object.assign(ref, known(framing)[0]);
    }
  }
  return {
    text: text.trim(),
    items: framedByWeekends(
      followingWeekend(
        framedByWeeks(restatedWeekends(confirmedDays(restatedDays(holidaysAsNames(items))))),
      ),
    ).map(itemOf),
    notUnderstood,
    vague,
    numbers,
    aboutWhen,
    half: said,
    ...(halfHours && { halfHours }),
  };
}

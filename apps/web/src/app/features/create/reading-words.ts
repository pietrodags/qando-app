import type { TranslocoService } from '@jsverse/transloco';
import type { DateInterpretation } from '@qando/contracts';
import { daysFrom } from './days-from';
import type { HalfOfDay, TimeNotHeld, TimeRead } from './reading';

type Notice = DateInterpretation['notices'][number];
type Question = DateInterpretation['questions'][number];

/** Says a text of a reading, by its key. */
type Say = (key: string, params?: Record<string, unknown>) => string;

/** One thing a reading tells the organizer, in the language of the page. */
export interface NoticeLine {
  /** The days the line speaks of, said before it: "vie 19 jun"; `null` for a line about none. */
  readonly lead: string | null;
  /** What it says: after the days and their colon, or a sentence of its own. */
  readonly text: string;
}

/** A reading of a time said without its half of the day, as its button reads. */
export interface AnswerWords {
  /** What the button shows: "8:00 · mañana", "17:00 → 19:00 · tarde". */
  readonly shown: string;
  /** What screen readers hear in its place: "de 17:00 a 19:00, tarde". */
  readonly heard: string;
}

/**
 * One question a reading asks, in the language of the page: a sentence in three pieces, the days
 * in the middle so that they can stand out, and the two readings to pick from.
 */
export interface QuestionLine {
  /** The time as the phrase said it, up to its days: "«a las 8» del". */
  readonly before: string;
  /** The days the time is asked of: "sáb 20 jun", "31 fechas". */
  readonly days: string;
  /** What is asked of them: ": ¿mañana o tarde?". */
  readonly after: string;
  readonly morning: AnswerWords;
  readonly afternoon: AnswerWords;
}

/** A line names up to these many days; more are counted. */
const DAYS_NAMED = 3;

/**
 * The lines that tell what a reading could not mark as it was said: its notices, in the phrase's
 * order, and after them the times the hours of a day cannot hold (`notHeld`), each with its days.
 * A line about days that are marked names them, in the order of the calendar and with what they
 * share said once ("sáb 3, 10 y 17 oct"), or counts them from four on; a line about what gave no
 * option quotes the organizer's words, as does a time that was said of no day.
 */
export function noticeLines(
  notices: readonly Notice[],
  notHeld: readonly TimeNotHeld[],
  transloco: TranslocoService,
): readonly NoticeLine[] {
  const locale = transloco.getActiveLang();
  const say = sayWith(transloco);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const dayOfMonth = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  /** A line about days that are marked. */
  const ofDays = (dates: readonly string[], key: string, params: object): NoticeLine => ({
    lead: daysNamed(dates, locale) ?? say('dateCount', { count: dates.length }),
    text: say(`notice.${key}`, { ...params, days: dates.length }),
  });

  /** What says that midnight of a day is the next one, by how the phrase wrote the days. */
  const midnight = (dates: readonly string[], written: 'weekday' | 'date'): NoticeLine => {
    const [first, ...others] = dates as [string, ...string[]];
    const before = Date.parse(daysFrom(first, -1));
    if (written === 'date' && others.length === 0) {
      return ofDays(dates, 'dayNotWrittenDate', {
        written: dayOfMonth.format(before),
        day: dayNumber(first),
      });
    }
    if (written === 'weekday' && others.every((date) => weekdayOf(date) === weekdayOf(first))) {
      return ofDays(dates, 'dayNotWritten', {
        written: weekday.format(before),
        marked: weekday.format(Date.parse(first)),
      });
    }
    return ofDays(dates, 'dayNotWrittenSeveral', {});
  };

  const told = notices.map((notice): NoticeLine => {
    const { fragment } = notice as { fragment?: string };
    const quoted = fragment === undefined ? '' : say('quoted', { fragment });
    if (!('dates' in notice)) return { lead: null, text: say(`notice.${notice.kind}`, { quoted }) };
    if (notice.dates.length === 0) return { lead: null, text: say('notice.unclear', { quoted }) };
    return notice.kind === 'dayNotWritten'
      ? midnight(notice.dates, notice.written)
      : ofDays(notice.dates, notice.kind, { quoted });
  });

  const left = notHeld.map(({ time, dates }) =>
    ofDays(dates, 'timeNotHeld', { time: timeSaid(time, 'timeRange', say) }),
  );

  return [...told, ...left];
}

/**
 * The questions a reading asks, in its order: each quotes the time as the phrase said it, names
 * the days it is asked of as a notice does (up to three, counted from four on) and gives both
 * readings of the time, a time range with an arrow and, for screen readers, in words.
 */
export function questionLines(
  questions: readonly Question[],
  transloco: TranslocoService,
): readonly QuestionLine[] {
  const locale = transloco.getActiveLang();
  const say = sayWith(transloco);
  const answer = (half: HalfOfDay, time: TimeRead): AnswerWords => ({
    shown: say(`question.${half}`, { time: timeSaid(time, 'timeSpan', say) }),
    heard: say(`question.${half}Heard`, { time: timeSaid(time, 'timeRange', say) }),
  });

  return questions.map(({ fragment, dates, morning, afternoon }): QuestionLine => {
    const named = daysNamed(dates, locale);
    return {
      before: say('question.before', { fragment, days: named === null ? 'counted' : 'named' }),
      days: named ?? say('dateCount', { count: dates.length }),
      after: say('question.after'),
      morning: answer('morning', morning),
      afternoon: answer('afternoon', afternoon),
    };
  });
}

function sayWith(transloco: TranslocoService): Say {
  return (key, params = {}) => transloco.translate(`create.reading.${key}`, params);
}

/**
 * A time in a few words: one of its own as a clock shows it ("8:00"), a range by the text of
 * `range`, as a button shows it ("17:00 → 19:00", `timeSpan`) or as a sentence says it ("de 17:00
 * a 19:00", `timeRange`), each with its own text when it ends on the next day.
 */
function timeSaid(time: TimeRead, range: 'timeSpan' | 'timeRange', say: Say): string {
  if (time.kind === 'single') return clock(time.at);
  return say(time.nextDay ? `${range}NextDay` : range, {
    start: clock(time.start),
    end: clock(time.end),
  });
}

/**
 * "sáb 3, 10 y 17 oct": up to three days in the order of the calendar, the weekday said once
 * before them when they share it and the month once after them when they share it, each with its
 * own otherwise. `null` for more days than are named.
 */
function daysNamed(dates: readonly string[], locale: string): string | null {
  if (dates.length > DAYS_NAMED) return null;
  const days = [...dates].sort();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const oneWeekday = new Set(days.map(weekdayOf)).size === 1;
  const oneMonth = new Set(days.map((date) => date.slice(0, 7))).size === 1;
  const names = days.map((date, index) => {
    const time = Date.parse(date);
    const before = index === 0 || !oneWeekday ? `${weekday.format(time)} ` : '';
    const after = index === days.length - 1 || !oneMonth ? ` ${month.format(time)}` : '';
    return `${before}${dayNumber(date)}${after}`;
  });
  return new Intl.ListFormat(locale).format(names);
}

/** 0 (Sunday) to 6: the weekday of a date (`YYYY-MM-DD`). */
function weekdayOf(date: string): number {
  return new Date(date).getUTCDay();
}

/** `2026-06-05` → 5. */
function dayNumber(date: string): number {
  return Number(date.slice(8));
}

/** `09:30` → "9:30". */
function clock(time: string): string {
  return `${String(Number(time.slice(0, 2)))}${time.slice(2)}`;
}

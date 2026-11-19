import type { TranslocoService } from '@jsverse/transloco';
import type { DateInterpretation } from '@qando/contracts';
import { daysFrom } from './days-from';
import type { TimeNotHeld } from './reading';

type Notice = DateInterpretation['notices'][number];

/** One thing a reading tells the organizer, in the language of the page. */
export interface NoticeLine {
  /** The days the line speaks of, said before it: "vie 19 jun"; `null` for a line about none. */
  readonly lead: string | null;
  /** What it says: after the days and their colon, or a sentence of its own. */
  readonly text: string;
}

/** A day's notice names up to these many days; more are counted. */
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
  const say = (key: string, params: Record<string, unknown> = {}): string =>
    transloco.translate(`create.reading.${key}`, params);
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
    ofDays(dates, 'timeNotHeld', {
      time: say(time.nextDay ? 'timeRangeNextDay' : 'timeRange', {
        start: clock(time.start),
        end: clock(time.end),
      }),
    }),
  );

  return [...told, ...left];
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

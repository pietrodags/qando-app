// Dates as the emails write them, in Spanish: the emails are Spanish only until the en catalogue
// exists. Dates are calendar values: a date-only ISO string is named as written, in UTC.
import type { ProposedOption } from '@qando/domain';
import type { Line } from './render-email.js';

// The helpers are function declarations, not arrow functions held in constants, and each
// builds its format when called: a value built when the module loads, an arrow function too, is
// checked by mutation testing only by running every test of the API.

/** The part of a calendar day that `options` asks for ("sábado", "julio"), in UTC. */
function named(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('es', { ...options, timeZone: 'UTC' }).format(Date.parse(date));
}

function weekday(date: string): string {
  return named(date, { weekday: 'long' });
}

function month(date: string): string {
  return named(date, { month: 'long' });
}

function weekdayShort(date: string): string {
  return named(date, { weekday: 'short' });
}

function monthShort(date: string): string {
  return named(date, { month: 'short' });
}

function titled(name: string): string {
  return name.charAt(0).toLocaleUpperCase('es') + name.slice(1);
}

function dayOf(date: string): string {
  return String(Number(date.slice(8)));
}

/** "09:30" → "9:30". */
function clock(time: string): string {
  return `${String(Number(time.slice(0, 2)))}:${time.slice(3)}`;
}

/** "Sáb 11 Jul". */
function shortDate(date: string): string {
  return `${titled(weekdayShort(date))} ${dayOf(date)} ${titled(monthShort(date))}`;
}

/**
 * An option as the results page's chart names it: "Sáb 11 Jul · 21:00", "Vie 10 Jul · 20:30 →
 * 23:00", "Sáb 18 → Dom 19 Jul" (one month), "Lun 29 Jun → Jue 2 Jul" (two).
 */
export function shortOptionLabel({ dates, time }: ProposedOption): string {
  if (dates.kind === 'range') {
    const { start, end } = dates;
    if (start.slice(0, 7) !== end.slice(0, 7)) return `${shortDate(start)} → ${shortDate(end)}`;
    return `${titled(weekdayShort(start))} ${dayOf(start)} → ${shortDate(end)}`;
  }
  const date = shortDate(dates.date);
  if (time === null) return date;
  if (time.kind === 'single') return `${date} · ${clock(time.at)}`;
  return `${date} · ${clock(time.start)} → ${clock(time.end)}`;
}

/** "sábado 11 de julio", its day and month in bold. */
function longDate(date: string): Line {
  return [{ strong: `${weekday(date)} ${dayOf(date)}` }, ' de ', { strong: month(date) }];
}

/**
 * An option as the results page writes its winning dates, the dates and times in bold and the
 * words that connect them plain: "**sábado 11** de **julio**, a las **21:00**", "**viernes 10**
 * de **julio**, de **20:30** a **23:00**", "del **sábado 18** al **domingo 19** de **julio**",
 * "del **lunes 29** de **junio** al **jueves 2** de **julio**".
 */
export function longOptionLabel({ dates, time }: ProposedOption): Line {
  if (dates.kind === 'range') {
    const { start, end } = dates;
    if (start.slice(0, 7) !== end.slice(0, 7)) {
      return ['del ', ...longDate(start), ' al ', ...longDate(end)];
    }
    return ['del ', { strong: `${weekday(start)} ${dayOf(start)}` }, ' al ', ...longDate(end)];
  }
  const date = longDate(dates.date);
  if (time === null) return date;
  if (time.kind === 'single') return [...date, ', a las ', { strong: clock(time.at) }];
  return [...date, ', de ', { strong: clock(time.start) }, ' a ', { strong: clock(time.end) }];
}

/** "miércoles 1 de julio de 2026": a day in full, as a sentence says it. */
export function dayLabel(date: string): string {
  return `${weekday(date)} ${dayOf(date)} de ${month(date)} de ${date.slice(0, 4)}`;
}

/** `America/New_York` → "New York": the city that names a time zone. */
export function zoneCity(timeZone: string): string {
  return (timeZone.split('/').pop() ?? timeZone).replaceAll('_', ' ');
}

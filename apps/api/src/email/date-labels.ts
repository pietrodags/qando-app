// Dates as the emails write them, in Spanish: the emails are Spanish only until the en catalogue
// exists. Dates are calendar values: a date-only ISO string is named as written, in UTC.
import type { ProposedOption } from '@qando/domain';

const names = (options: Intl.DateTimeFormatOptions) => {
  const format = new Intl.DateTimeFormat('es', { ...options, timeZone: 'UTC' });
  // "sept." → "sept": the short names drop their abbreviation's dot.
  return (date: string) => format.format(Date.parse(date)).replace(/\.$/, '');
};
const weekday = names({ weekday: 'long' });
const month = names({ month: 'long' });
const weekdayShort = names({ weekday: 'short' });
const monthShort = names({ month: 'short' });

const titled = (name: string) => name.charAt(0).toLocaleUpperCase('es') + name.slice(1);
const dayOf = (date: string) => String(Number(date.slice(8)));

/** "09:30" → "9:30". */
const clock = (time: string) => `${String(Number(time.slice(0, 2)))}:${time.slice(3)}`;

/** "Sáb 11 Jul". */
const shortDate = (date: string) =>
  `${titled(weekdayShort(date))} ${dayOf(date)} ${titled(monthShort(date))}`;

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

/** "miércoles 1 de julio de 2026": a day in full, as a sentence says it. */
export function dayLabel(date: string): string {
  return `${weekday(date)} ${dayOf(date)} de ${month(date)} de ${date.slice(0, 4)}`;
}

/** `America/New_York` → "New York": the city that names a time zone. */
export function zoneCity(timeZone: string): string {
  return (timeZone.split('/').pop() ?? timeZone).replaceAll('_', ' ');
}

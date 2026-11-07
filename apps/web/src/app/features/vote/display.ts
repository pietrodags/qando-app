// How the voting page shows the event's dates and names.

/** `2026-07-01` → "1 de julio de 2026": a date-only ISO string is read as UTC, as it is shown. */
export function longDate(isoDate: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.parse(isoDate));
}

/** `2026-07-10` → "viernes 10 de julio de 2026": the weekday, then the long date. */
export function fullDate(isoDate: string, locale: string): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  return `${weekday.format(Date.parse(isoDate))} ${longDate(isoDate, locale)}`;
}

/** `09:30` → "9:30": a wall-clock time as the voting page shows it. */
export function clockLabel(time: string): string {
  return `${String(Number(time.slice(0, 2)))}:${time.slice(3)}`;
}

/**
 * `America/New_York` → "New York": the city that names the event's time zone, or null when the
 * browser is in that zone and the times need no notice.
 */
export function zoneCity(timeZone: string): string | null {
  if (timeZone === Intl.DateTimeFormat().resolvedOptions().timeZone) return null;
  return (timeZone.split('/').pop() ?? timeZone).replaceAll('_', ' ');
}

/** "ana" → "Ana": the first letter in upper case, the rest as typed (OD-20). */
export function capitalised(name: string, locale: string): string {
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

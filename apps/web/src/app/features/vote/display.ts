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

/** "ana" → "Ana": the first letter in upper case, the rest as typed (OD-20). */
export function capitalised(name: string, locale: string): string {
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

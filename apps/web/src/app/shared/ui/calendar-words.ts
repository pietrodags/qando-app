// A Monday, to name the weekdays from Monday on.
const A_MONDAY = Date.UTC(2024, 0, 1);
const DAY_MS = 86_400_000;

/** The words of a month calendar in one language. */
export interface CalendarWords {
  /** The weekdays' initials, from Monday on: "L", "M", "X"… */
  readonly weekdays: readonly string[];
  /** "Julio 2026": the name of a month (`YYYY-MM`), capitalised as a title, and its year. */
  monthTitle(month: string): string;
  /** "lunes, 6 de julio": the full name of a date (`YYYY-MM-DD`). */
  dayName(date: string): string;
}

/**
 * The words a month calendar shows and reads out, in the language of `locale`. Dates are calendar
 * values: a date-only ISO string is read as UTC, as it is shown.
 */
export function calendarWords(locale: string): CalendarWords {
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
  const dayFormat = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  return {
    weekdays: Array.from({ length: 7 }, (_, index) =>
      weekdayFormat.format(A_MONDAY + index * DAY_MS),
    ),
    monthTitle(month) {
      const name = monthFormat.format(Date.parse(`${month}-01`));
      return `${name.charAt(0).toLocaleUpperCase(locale)}${name.slice(1)} ${month.slice(0, 4)}`;
    },
    dayName(date) {
      return dayFormat.format(Date.parse(date));
    },
  };
}

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
  /** "6 de julio": a date (`YYYY-MM-DD`) without its weekday. */
  dayOfMonth(date: string): string;
  /** "Lun 6": a date (`YYYY-MM-DD`) as its short weekday, capitalised, and its day. */
  shortDay(date: string): string;
  /** "vie 27 nov 2026": a date (`YYYY-MM-DD`) as a field shows it, short and without commas. */
  shortDate(date: string): string;
  /** "sábado": the weekday of a date (`YYYY-MM-DD`), in full. */
  weekday(date: string): string;
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
  const shortWeekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const dayOfMonthFormat = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const shortDateFormat = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const longWeekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });

  const capitalised = (word: string): string =>
    `${word.charAt(0).toLocaleUpperCase(locale)}${word.slice(1)}`;

  return {
    weekdays: Array.from({ length: 7 }, (_, index) =>
      weekdayFormat.format(A_MONDAY + index * DAY_MS),
    ),
    monthTitle(month) {
      const name = monthFormat.format(Date.parse(`${month}-01`));
      return `${capitalised(name)} ${month.slice(0, 4)}`;
    },
    dayName(date) {
      return dayFormat.format(Date.parse(date));
    },
    dayOfMonth(date) {
      return dayOfMonthFormat.format(Date.parse(date));
    },
    shortDay(date) {
      const weekday = shortWeekdayFormat.format(Date.parse(date));
      return `${capitalised(weekday)} ${String(Number(date.slice(8)))}`;
    },
    shortDate(date) {
      // The parts in the language's order, with a space between them in place of any comma.
      return shortDateFormat
        .formatToParts(Date.parse(date))
        .filter(({ type }) => type !== 'literal')
        .map(({ value }) => value)
        .join(' ');
    },
    weekday(date) {
      return longWeekdayFormat.format(Date.parse(date));
    },
  };
}

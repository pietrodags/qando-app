// A Monday, to name the weekdays from Monday on.
const A_MONDAY = Date.UTC(2024, 0, 1);
const DAY_MS = 86_400_000;

/** The words of a month calendar in one language. */
export interface CalendarWords {
  /** The weekdays' initials, from Monday on: "L", "M", "X"… */
  readonly weekdays: readonly string[];
  /** "Julio 2026": the name of a month (`YYYY-MM`), capitalised as a title, and its year. */
  monthTitle(month: string): string;
  /**
   * "lunes, 6 de julio": the full name of a date (`YYYY-MM-DD`); given `today`, with its year when it
   * is not today's ("viernes, 8 de enero de 2027").
   */
  dayName(date: string, today?: string): string;
  /**
   * "6 de julio": a date (`YYYY-MM-DD`) without its weekday; given `today`, with its year when it is
   * not today's ("8 de enero de 2027").
   */
  dayOfMonth(date: string, today?: string): string;
  /** "Lun 6": a date (`YYYY-MM-DD`) as its short weekday, capitalised, and its day. */
  shortDay(date: string): string;
  /** "noviembre": the name of a month (`YYYY-MM`) in full, as a list shows it. */
  monthName(month: string): string;
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
  const dayWithYearFormat = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const shortWeekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const dayOfMonthFormat = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const dayOfMonthWithYearFormat = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const longWeekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });

  // A date of another year than today's says its year.
  const ofAnotherYear = (date: string, today: string | undefined): boolean =>
    today !== undefined && date.slice(0, 4) !== today.slice(0, 4);

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
    dayName(date, today) {
      const format = ofAnotherYear(date, today) ? dayWithYearFormat : dayFormat;
      return format.format(Date.parse(date));
    },
    dayOfMonth(date, today) {
      const format = ofAnotherYear(date, today) ? dayOfMonthWithYearFormat : dayOfMonthFormat;
      return format.format(Date.parse(date));
    },
    shortDay(date) {
      const weekday = shortWeekdayFormat.format(Date.parse(date));
      return `${capitalised(weekday)} ${String(Number(date.slice(8)))}`;
    },
    monthName(month) {
      return monthFormat.format(Date.parse(`${month}-01`));
    },
    weekday(date) {
      return longWeekdayFormat.format(Date.parse(date));
    },
  };
}

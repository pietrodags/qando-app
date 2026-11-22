/**
 * The calendar date in the zone at `instant`, as an ISO date (`YYYY-MM-DD`): the one "today" of
 * the API and of the pages, so both offer and accept the same days.
 */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);
}

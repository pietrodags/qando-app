// Internal to the domain: the index does not export it.

/** The calendar date in the zone at `instant`, as an ISO date (`YYYY-MM-DD`). */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);
}

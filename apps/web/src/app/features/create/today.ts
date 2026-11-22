/**
 * Today as `YYYY-MM-DD`: the date the clocks of `timeZone` show, or the person's own clock and
 * time zone without one.
 */
export function today(timeZone?: string): string {
  // Canadian English writes a date as `YYYY-MM-DD`.
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

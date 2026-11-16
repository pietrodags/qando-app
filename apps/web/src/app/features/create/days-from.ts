const DAY_MS = 86_400_000;

/**
 * The calendar day so many days after `date` (before it, when negative), both as `YYYY-MM-DD`.
 * Counted in UTC, where every day has 24 hours.
 */
export function daysFrom(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

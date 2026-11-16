// How far ahead an event's dates can be. The calendar of the wizard ends there and the API
// refuses a date beyond it, so both agree on the last day.

/**
 * The last day an event created on `today` can propose: the same day twelve months later (a
 * 29 February gives the 28th). Both are calendar dates as `YYYY-MM-DD`.
 */
export function latestOptionDate(today: string): string {
  const nextYear = String(Number(today.slice(0, 4)) + 1);
  const monthAndDay = today.slice(4);
  // The year after a leap year never has a 29 February.
  return `${nextYear}${monthAndDay === '-02-29' ? '-02-28' : monthAndDay}`;
}

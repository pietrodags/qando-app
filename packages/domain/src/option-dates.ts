// How many options an event can have and how far ahead its dates can be. The wizard stops at
// both and the API refuses what goes beyond them, so the two agree.

/** The most options an event can have; each date, range of dates or time proposed is one. */
export const MAX_OPTIONS = 60;

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

/**
 * The dates the organizer has marked on the wizard's calendar. Every date is a calendar value as
 * `YYYY-MM-DD`.
 */
export interface DateSelection {
  /** The days marked one by one, each an option of its own even next to another; in order. */
  readonly singles: readonly string[];
}

export const NO_DATES: DateSelection = { singles: [] };

/** A press on a day: a free day becomes a date of its own, a marked day is free again. */
export function pressDay(selection: DateSelection, date: string): DateSelection {
  const singles = selection.singles.includes(date)
    ? selection.singles.filter((single) => single !== date)
    : [...selection.singles, date].sort();
  return { singles };
}

/** Some date is marked: the event has at least one option. */
export function hasDates(selection: DateSelection): boolean {
  return selection.singles.length > 0;
}

// The deadline of an event: a calendar date from today to twelve months ahead, today being read
// in the event's time zone. Choosing one (on creation or later) and closing voting now both give
// the event a new closing: the deadline people read and the instant voting closes.
import { closingInstant, currentState, type StoredEventState } from './event-state.js';
import { localDate } from './local-date.js';
import { latestOptionDate } from './options.js';

/** Why a deadline cannot be chosen. */
export type DeadlineProblem =
  /** A day before today in the event's time zone. */
  | { readonly code: 'DEADLINE_PAST' }
  /** A day beyond the last one an event can propose (`latestOptionDate`). */
  | { readonly code: 'DEADLINE_TOO_FAR' };

/** When voting on an event closes, as it is stored: open until then, or closed already. */
export interface Closing {
  readonly state: 'open' | 'closed';
  /** Calendar date, `YYYY-MM-DD`: what the pages say voting closes or closed on. */
  readonly deadline: string;
  readonly closesAt: Date;
}

/**
 * Why a deadline chosen on `today` cannot be (both `YYYY-MM-DD`), or undefined: a deadline of
 * today closes at its end, and one can be as far ahead as an option.
 */
export function deadlineProblem(deadline: string, today: string): DeadlineProblem | undefined {
  if (deadline < today) return { code: 'DEADLINE_PAST' };
  if (deadline > latestOptionDate(today)) return { code: 'DEADLINE_TOO_FAR' };
  return undefined;
}

/**
 * The closing of a deadline its organizer chooses at `now` for an event in `timeZone`: voting
 * is open until the end of that day there, whether it had closed already (it reopens) or not
 * (earlier or later than before).
 */
export function deadlineClosing(
  deadline: string,
  timeZone: string,
  now: Date,
):
  | { readonly ok: true; readonly closing: Closing }
  | { readonly ok: false; readonly problem: DeadlineProblem } {
  const problem = deadlineProblem(deadline, localDate(now, timeZone));
  if (problem) return { ok: false, problem };
  return {
    ok: true,
    closing: { state: 'open', deadline, closesAt: closingInstant(deadline, timeZone) },
  };
}

/**
 * The closing of voting closed by its organizer at `now`: the deadline becomes today in the
 * event's time zone, the original one is not kept. Undefined once voting has closed (by the
 * deadline, an earlier close or a confirmation): the closing stays the real one.
 */
export function closingNow(
  event: StoredEventState & { readonly timeZone: string },
  now: Date,
): Closing | undefined {
  if (currentState(event, now) !== 'open') return undefined;
  return { state: 'closed', deadline: localDate(now, event.timeZone), closesAt: now };
}

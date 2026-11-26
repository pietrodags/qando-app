import type { DateInterpretation } from '@qando/contracts';
import type { ProposedOption } from '@qando/domain';
import { type DateSelection, selectionOf } from './date-selection';

/** The reading picked for a time said without its half of the day. */
export type HalfOfDay = 'morning' | 'afternoon';

type Question = DateInterpretation['questions'][number];

/** A time as a reading gives it to mark: one time, or a range of the same day. */
export type TimeRead = Question['morning'];

/**
 * What the reading of a phrase leaves chosen, each option taken in the phrase's order. The reading
 * comes as an event can hold it, so every time it gives is marked. A day is a date of its own and
 * a range of days a range, unless they share a day: then the range is saved, whichever was said
 * first, as is the later of two ranges that share one; a range said twice is taken once. The time
 * of a day joins the day's times, the one of a question as the reading picked for it (`answers`,
 * in the order of the reading's questions; none yet, the day has no time from it). Times are asked
 * for when the reading says the time of a day, also one it left out or did not ask about, or one
 * it tells was not understood or ends too late, so the step that asks for it is there; otherwise
 * they are as they were (`timed`).
 */
export function markingOf(
  reading: DateInterpretation,
  answers: readonly HalfOfDay[],
  timed: boolean,
): DateSelection {
  const options = reading.options.map(({ dates, time }): ProposedOption => {
    if (dates.kind === 'range' || time === null) return { dates, time: null };
    if (time.kind !== 'question') return { dates, time };
    const answer = answers[time.question];
    return { dates, time: (answer && reading.questions[time.question]?.[answer]) ?? null };
  });
  const leftOut = reading.timesLeftOut.length + reading.questionsNotAsked.length > 0;
  return selectionOf(options, timed || leftOut || reading.notices.some(asksTime));
}

/** The notice tells that a day is marked without the time said of it: a time is still to choose. */
function asksTime(notice: DateInterpretation['notices'][number]): boolean {
  return (notice.kind === 'timeUnclear' || notice.kind === 'tooLate') && notice.dates.length > 0;
}

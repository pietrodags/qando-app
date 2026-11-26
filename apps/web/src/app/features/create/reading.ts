import type { DateInterpretation } from '@qando/contracts';
import type { ProposedOption } from '@qando/domain';
import { type DateSelection, selectionOf } from './date-selection';

/** The reading picked for a time said without its half of the day. */
export type HalfOfDay = 'morning' | 'afternoon';

type Question = DateInterpretation['questions'][number];

/** A time as a reading gives it to mark: one time, or a range of the same day. */
export type TimeRead = Question['morning'];

/** A time range no event can hold, which may end on the next day, and the days it was left out of. */
type TimeLeftOut = DateInterpretation['timesLeftOut'][number];

/**
 * What the reading of a phrase leaves chosen, each option taken in the phrase's order. The reading
 * comes as an event can hold it, so every time it gives is marked. A day is a date of its own and
 * a range of days a range, unless they share a day: then the range is saved, whichever was said
 * first, as is the later of two ranges that share one; a range said twice is taken once. The time
 * of a day joins the day's times, the one of a question as the reading picked for it (`answers`,
 * in the order of the reading's questions; none yet, or one no event can hold, the day has no time
 * from it). Times are asked for when the reading says the time of a day, also one left out of it
 * (`timesLeftOut`) or not asked about, or one it tells was not understood or ends too late, so the
 * step that asks for it is there; otherwise they are as they were (`timed`).
 */
export function markingOf(
  reading: DateInterpretation,
  answers: readonly HalfOfDay[],
  timed: boolean,
): DateSelection {
  const options = reading.options.map(({ dates, time }): ProposedOption => {
    if (dates.kind === 'range' || time === null) return { dates, time: null };
    if (time.kind !== 'question') return { dates, time };
    const question = reading.questions[time.question];
    const answer = answers[time.question];
    const picked = answer === question?.leftOut ? undefined : answer && question?.[answer];
    return { dates, time: picked ?? null };
  });
  const leftOut = timesLeftOut(reading, answers).length + reading.questionsNotAsked.length > 0;
  return selectionOf(options, timed || leftOut || reading.notices.some(asksTime));
}

/**
 * The time ranges no event can hold that a reading leaves out of their days once its questions are
 * answered: those it says as they are, and the reading picked for a question that no event can
 * hold (its `leftOut`), with every day of the question. A range is told once, with every day it was
 * left out of.
 */
export function timesLeftOut(
  reading: DateInterpretation,
  answers: readonly HalfOfDay[],
): readonly TimeLeftOut[] {
  const told = new Map<string, { time: TimeLeftOut['time']; dates: string[] }>();
  const tell = ({ time, dates }: TimeLeftOut) => {
    const key = `${time.start} ${time.end} ${String(time.nextDay ?? false)}`;
    const each = told.get(key) ?? { time, dates: [] };
    told.set(key, each);
    each.dates.push(...dates.filter((date) => !each.dates.includes(date)));
  };
  reading.timesLeftOut.forEach(tell);
  reading.questions.forEach(({ dates, leftOut, ...readings }, place) => {
    if (leftOut === undefined || answers[place] !== leftOut) return;
    const time = readings[leftOut];
    // Stryker disable next-line all: a reading no event can hold is a time range; the check is for
    // the compiler.
    if (time.kind === 'range') tell({ time, dates });
  });
  return [...told.values()];
}

/** The notice tells that a day is marked without the time said of it: a time is still to choose. */
function asksTime(notice: DateInterpretation['notices'][number]): boolean {
  return (notice.kind === 'timeUnclear' || notice.kind === 'tooLate') && notice.dates.length > 0;
}

import type { DateInterpretation } from '@qando/contracts';
import type { ProposedOption } from '@qando/domain';
import { type DateSelection, selectionOf } from './date-selection';
import { NO_TIMES, withTimeRead } from './day-times';

/** The reading picked for a time said without its half of the day. */
export type HalfOfDay = 'morning' | 'afternoon';

type Question = DateInterpretation['questions'][number];

/** A time as a reading says it: one time, or a range that may end on the next day. */
export type TimeRead = Question['morning'];

/** A time range the hours of a day cannot hold, and the days it was said of, in the phrase's order. */
export interface TimeNotHeld {
  readonly time: Extract<TimeRead, { kind: 'range' }>;
  readonly dates: readonly string[];
}

/** What a phrase's reading leaves on the wizard's calendar. */
export interface Marking {
  /** The dates and times chosen, in place of those chosen before. */
  readonly selection: DateSelection;
  /** The times left out, each once: their days are marked without them. */
  readonly notHeld: readonly TimeNotHeld[];
}

/**
 * What the reading of a phrase leaves chosen, each option taken in the phrase's order. A day is a
 * date of its own and a range of days a range, unless they share a day: then the range is saved,
 * whichever was said first, as is the later of two ranges that share one; a range said twice is
 * taken once. The time of a day joins the day's times (`withTimeRead`), the one of a question as
 * the reading picked for it (`answers`, in the order of the reading's questions; none yet, the
 * day has no time from it), and a time the hours of a day cannot hold, one that ends on the next
 * day among them, is left out and told. Times are asked for when the reading says the time of a
 * day, also one that is left out or that it tells was not understood or ends too late, so the
 * step that asks for it is there; otherwise they are as they were (`timed`).
 */
export function markingOf(
  reading: DateInterpretation,
  answers: readonly HalfOfDay[],
  timed: boolean,
): Marking {
  const notHeld = new Map<string, { time: TimeNotHeld['time']; dates: string[] }>();
  const options = reading.options.map(({ dates, time }): ProposedOption => {
    if (dates.kind === 'range') return { dates, time: null };
    const said =
      time?.kind === 'question'
        ? answered(reading.questions[time.question], answers[time.question])
        : time;
    if (!said) return { dates, time: null };
    if (said.kind === 'single') return { dates, time: said };
    const range = { kind: 'range', start: said.start, end: said.end } as const;
    // Whether the hours of a day hold a time does not depend on the day's other times.
    if (!said.nextDay && withTimeRead(NO_TIMES, range) !== null) return { dates, time: range };
    const key = JSON.stringify([said.start, said.end, said.nextDay]);
    const told = notHeld.get(key) ?? { time: said, dates: [] };
    notHeld.set(key, told);
    told.dates.push(dates.date);
    return { dates, time: null };
  });

  return {
    selection: selectionOf(options, timed || notHeld.size > 0 || reading.notices.some(asksTime)),
    notHeld: [...notHeld.values()],
  };
}

/** The notice tells that a day is marked without the time said of it: a time is still to choose. */
function asksTime(notice: DateInterpretation['notices'][number]): boolean {
  return (notice.kind === 'timeUnclear' || notice.kind === 'tooLate') && notice.dates.length > 0;
}

/** The reading of a question that was picked; none while it has no answer. */
function answered(
  question: Question | undefined,
  answer: HalfOfDay | undefined,
): TimeRead | undefined {
  return answer && question?.[answer];
}

import type { DateInterpretation } from '@qando/contracts';
import type { DatesRead } from '@qando/date-reader';
import { withinOneHour } from '@qando/domain';

type Question = DatesRead['questions'][number];
type TimeRead = Question['morning'];
type RangeRead = Extract<TimeRead, { kind: 'range' }>;
type Option = DateInterpretation['options'][number];
type HeldTime = DateInterpretation['questions'][number]['morning'];
type QuestionNotAsked = DateInterpretation['questionsNotAsked'][number];

/**
 * What an event can hold of a reading, for every client that reads a phrase: the wizard marks it
 * and the assistant is told it, so neither decides it on its own. A time range an event cannot
 * hold (`unheld`) is left out of its day, which is marked as a whole day unless another option
 * gives it a time, and told once with its days (`timesLeftOut`). Of a time said without its half
 * of the day, a question is asked when an event can hold one reading at least, saying the one it
 * cannot (`leftOut`), which the organizer may still mean; when it can hold neither, nothing is
 * asked and the question is told as read (`questionsNotAsked`). The questions still asked are
 * numbered again. The reader reads both times of a question within one day, so neither reading
 * ends on the next. A day is either a whole day or its times, and marked once as a whole day; a
 * range of days has no time in a reading. The notices are kept as read.
 */
export function heldReading(reading: DatesRead): DateInterpretation {
  const timesLeftOut = new Map<string, { time: RangeRead; dates: string[] }>();
  const leaveOut = (time: RangeRead, date: string) => {
    const key = `${time.start} ${time.end} ${String(time.nextDay ?? false)}`;
    const told = timesLeftOut.get(key) ?? { time, dates: [] };
    timesLeftOut.set(key, told);
    if (!told.dates.includes(date)) told.dates.push(date);
  };

  const places = new Map<Question, number>();
  const questions: DateInterpretation['questions'] = [];
  const questionsNotAsked: QuestionNotAsked[] = [];
  for (const question of reading.questions) {
    const { morning, afternoon } = question;
    if (unheld(morning) && unheld(afternoon)) {
      questionsNotAsked.push({ ...question, morning, afternoon });
      continue;
    }
    places.set(question, questions.length);
    questions.push({
      ...question,
      morning: held(morning),
      afternoon: held(afternoon),
      ...(unheld(morning) && { leftOut: 'morning' }),
      ...(unheld(afternoon) && { leftOut: 'afternoon' }),
    });
  }

  const options = reading.options.map(({ dates, time }): Option => {
    if (dates.kind === 'range' || time === null) return { dates, time: null };
    if (time.kind !== 'question') {
      if (!unheld(time)) return { dates, time: held(time) };
      leaveOut(time, dates.date);
      return { dates, time: null };
    }
    const question = reading.questions[time.question];
    // Stryker disable next-line all: an option asks only a question the reading has; the check is
    // for the compiler.
    if (!question) throw new Error(`The reading has no question ${String(time.question)}`);
    const place = places.get(question);
    // Not asked: the question is told among those not asked.
    return { dates, time: place === undefined ? null : { kind: 'question', question: place } };
  });

  const timed = new Set(
    options.flatMap(({ dates, time }) => (dates.kind === 'single' && time ? [dates.date] : [])),
  );
  const wholeDays = new Set<string>();
  const kept = options.filter(({ dates, time }) => {
    if (dates.kind === 'range' || time) return true;
    if (timed.has(dates.date) || wholeDays.has(dates.date)) return false;
    wholeDays.add(dates.date);
    return true;
  });

  return {
    options: kept,
    questions,
    notices: reading.notices,
    timesLeftOut: [...timesLeftOut.values()],
    questionsNotAsked,
  };
}

/**
 * Whether an event's options cannot hold a time: a range within a single clock hour, which the
 * hours of a day are not drawn small enough to show, or one that ends on the next day.
 */
function unheld(time: TimeRead): time is RangeRead {
  return time.kind === 'range' && (time.nextDay === true || withinOneHour(time));
}

/** A time an event can hold, as an option has it: a range ends on its own day. */
function held(time: TimeRead): HeldTime {
  return time.kind === 'single' ? time : { kind: 'range', start: time.start, end: time.end };
}

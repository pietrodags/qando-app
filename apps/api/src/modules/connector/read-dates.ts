import {
  calendarDate,
  clockRangeSchema,
  dateInterpretationBodySchema,
  dateInterpretationSchema,
} from '@qando/contracts';
import type { DatesRead, ReadOption } from '@qando/date-reader';
import { withinOneHour } from '@qando/domain';
import { z } from 'zod';
import type { InterpretPhrase } from '../date-interpretations/interpret-phrase.js';
import { texts } from './texts.js';
import type { Tool } from './tool.js';

const { phrase, timeZone } = texts.tools.readDates.input;

/** What a call gives: the phrase and the time zone, as the wizard sends them. */
const askedSchema = z.object({
  phrase: dateInterpretationBodySchema.shape.text.meta({ description: phrase }),
  timeZone: dateInterpretationBodySchema.shape.timeZone.meta({ description: timeZone }),
});

/**
 * The reading as the wizard's route answers it, its shape written out whole (under the contract's
 * name the published shape would point to a definition an application has to follow), and beside
 * it the time ranges an event cannot hold, left out of their days.
 */
const readSchema = z.object({
  ...dateInterpretationSchema.shape,
  timesLeftOut: z.array(
    z.object({
      time: clockRangeSchema,
      dates: z.array(calendarDate),
    }),
  ),
});

type Read = z.infer<typeof readSchema>;

type Notice = Read['notices'][number];

/**
 * "Leer fechas de una frase", the tool `read_date_phrase`: the same reading of a phrase as the
 * wizard's, in the time zone the assistant gives, without the copy edit (the assistant writes the
 * phrase), with what an event can hold of it: the options, the questions to ask first and the
 * notices, in words and as data. A time range an event cannot hold, one within a single clock
 * hour or one that ends on the next day, is left out of its day, which is read as a whole day
 * unless another option gives it a time, and the answer says why (`timesLeftOut`); so is a
 * question neither of whose readings it can hold, which is not asked. Of a question with a reading
 * it can hold, both readings are given as read: the one the organizer picks is checked when the
 * event is created. Nothing is created; a call only reads.
 */
export function readDatesTool(interpret: InterpretPhrase): Tool<z.infer<typeof askedSchema>, Read> {
  return {
    name: 'read_date_phrase',
    title: texts.tools.readDates.title,
    description: texts.tools.readDates.description,
    readOnly: true,
    input: askedSchema,
    data: readSchema,
    answer: async (_accountId, { phrase, timeZone }) => {
      const read = held(await interpret({ text: phrase, timeZone, copyEdit: false }));
      return { text: said(read), data: read };
    },
  };
}

type TimeRead = DatesRead['questions'][number]['morning'];

/**
 * Whether an event's options cannot hold a time: a range within a single clock hour, or one that
 * ends on the next day.
 */
function unheld(time: TimeRead): time is Extract<TimeRead, { kind: 'range' }> {
  return time.kind === 'range' && (time.nextDay === true || withinOneHour(time));
}

/**
 * What an event can hold of a reading: each time range it cannot hold left out of its day, the
 * days and times together once, in the order of the phrase. A question neither of whose readings
 * it can hold is not asked: both readings are left out, and the questions still asked are
 * numbered again. A day is either a whole day or its times, so a day left without its time is not
 * offered when another option gives it one, nor twice. A range of days has no time in a reading.
 */
function held(reading: DatesRead): Read {
  const leftOut = new Map<
    string,
    { time: Read['timesLeftOut'][number]['time']; dates: string[] }
  >();
  const leaveOut = (time: Read['timesLeftOut'][number]['time'], date: string) => {
    const key = `${time.start} ${time.end} ${time.nextDay ?? false}`;
    const told = leftOut.get(key) ?? { time, dates: [] };
    leftOut.set(key, told);
    told.dates.push(date);
  };
  const questions = reading.questions.filter(
    ({ morning, afternoon }) => !(unheld(morning) && unheld(afternoon)),
  );
  const options = reading.options.map(({ dates, time }): ReadOption => {
    if (dates.kind === 'range' || time === null) return { dates, time };
    if (time.kind === 'question') {
      const question = reading.questions[time.question];
      // Stryker disable next-line all: an option asks only a question the reading has; the check
      // is for the compiler.
      if (!question) throw new Error(`The reading has no question ${String(time.question)}`);
      const { morning, afternoon } = question;
      if (!unheld(morning) || !unheld(afternoon)) {
        return { dates, time: { kind: 'question', question: questions.indexOf(question) } };
      }
      leaveOut(morning, dates.date);
      leaveOut(afternoon, dates.date);
      return { dates, time: null };
    }
    if (!unheld(time)) return { dates, time };
    leaveOut(time, dates.date);
    return { dates, time: null };
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
  return { ...reading, options: kept, questions, timesLeftOut: [...leftOut.values()] };
}

/**
 * The reading in words, a line each: the options (a question's both readings, with its number),
 * the questions, the notices of the reader and then the times left out, and a last line to clarify
 * them with the organizer when there are any.
 */
function said({ options, questions, notices, timesLeftOut }: Read): string {
  const { reading } = texts;
  /** A question with its number, counted from 1, by its place in the reading. */
  const asked = (place: number) => {
    const question = questions[place];
    // Stryker disable next-line all: an option asks only a question the reading has; the check
    // is for the compiler.
    if (!question) throw new Error(`The reading has no question ${String(place)}`);
    return { number: place + 1, ...question };
  };
  const lines = [
    options.length === 0 ? reading.noOptions : reading.options(options.length),
    ...options.map(({ dates, time }) =>
      time?.kind === 'question'
        ? reading.optionAsked(dates, asked(time.question))
        : reading.option(dates, time),
    ),
  ];
  if (questions.length > 0) {
    lines.push(reading.questions, ...questions.map((_, number) => reading.question(asked(number))));
  }
  if (notices.length + timesLeftOut.length > 0) {
    lines.push(reading.notices, ...notices.map(noticeSaid), ...timesLeftOut.map(reading.leftOut));
  }
  if (questions.length + notices.length + timesLeftOut.length > 0) lines.push(reading.clarify);
  return lines.join('\n');
}

/** A notice of the reader in words; one about days that names none is a time not understood. */
function noticeSaid(notice: Notice): string {
  const { notice: say } = texts.reading;
  switch (notice.kind) {
    case 'timeUnclear':
    case 'tooLate':
    case 'dayNotWritten':
      return notice.dates.length === 0
        ? say.unclear(notice.fragment)
        : say[notice.kind](notice.dates, notice.fragment);
    case 'unclear':
    case 'mismatch':
    case 'past':
      return say[notice.kind](notice.fragment);
    case 'pastTime':
      return say.pastTime(notice.fragment);
    case 'horizon':
    case 'tooMany':
      return say[notice.kind]();
  }
}

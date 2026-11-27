import {
  dateInterpretationBodySchema,
  dateInterpretationSchema,
  type DateInterpretation,
} from '@qando/contracts';
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
 * The reading as the wizard's route answers it, its shape written out whole: under the contract's
 * name the published shape would point to a definition an application has to follow.
 */
const readSchema = z.object(dateInterpretationSchema.shape);

type Read = DateInterpretation;

type Notice = Read['notices'][number];

type TimeLeftOut = Read['timesLeftOut'][number];

/**
 * "Leer fechas de una frase", the tool `read_date_phrase`: the same reading of a phrase as the
 * wizard's, in the time zone the assistant gives, without the copy edit (the assistant writes the
 * phrase), as an event can hold it: the options, the questions to ask first and the notices, in
 * words and as data, with the time ranges no event can hold and the questions not asked because it
 * can hold neither reading, each left out of its days, and why. Nothing is created; a call only
 * reads.
 */
export function readDatesTool(interpret: InterpretPhrase): Tool<z.infer<typeof askedSchema>, Read> {
  return {
    name: 'read_date_phrase',
    title: texts.tools.readDates.title,
    description: texts.tools.readDates.description,
    effect: 'reads',
    input: askedSchema,
    data: readSchema,
    answer: async (_caller, { phrase, timeZone }) => {
      const read = await interpret({ text: phrase, timeZone, copyEdit: false });
      return { text: said(read), data: read };
    },
  };
}

/**
 * Each time range left out, once, with its days: those said as they are and both readings of each
 * question not asked; a day is named once for each range left out of it. In the order of the
 * calendar, as the wizard tells them: by their first day and then by their time, each with its
 * days in that order.
 */
function leftOut({ timesLeftOut, questionsNotAsked }: Read): TimeLeftOut[] {
  const told = new Map<string, TimeLeftOut & { dates: string[] }>();
  const readings = questionsNotAsked.flatMap(({ dates, morning, afternoon }) => [
    { time: morning, dates },
    { time: afternoon, dates },
  ]);
  for (const { time, dates } of [...timesLeftOut, ...readings]) {
    const key = `${time.start} ${time.end} ${String(time.nextDay ?? false)}`;
    const each = told.get(key) ?? { time, dates: [] };
    told.set(key, each);
    each.dates.push(...dates.filter((date) => !each.dates.includes(date)));
  }
  const lines = [...told.values()].map(({ time, dates }) => ({ time, dates: dates.sort() }));
  return lines.sort((one, other) => order(one).localeCompare(order(other)));
}

/** What orders a time left out: its first day, its start and then its end, the next day's last. */
function order({ time, dates: [first] }: TimeLeftOut): string {
  return `${String(first)} ${time.start} ${time.nextDay ? 1 : 0} ${time.end}`;
}

/**
 * The reading in words, a line each: the options (a question's both readings, with its number),
 * the questions, the notices of the reader and then the times left out, and a last line to clarify
 * them with the organizer when there are any.
 */
function said(read: Read): string {
  const { options, questions, notices } = read;
  const timesLeftOut = leftOut(read);
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

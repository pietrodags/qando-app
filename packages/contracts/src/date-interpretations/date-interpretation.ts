import { z } from 'zod';
import { calendarDate, clockTime, timeZoneName } from '../calendar-values.js';
import { defineEndpoint } from '../endpoint.js';
import {
  foreignPageResponse,
  internalErrorSchema,
  rateLimitedResponse,
  validationFailedSchema,
} from '../error.js';

export const dateInterpretationBodySchema = z
  .strictObject({
    text: z.string().trim().min(1).max(120).meta({
      description:
        'The phrase that says when, in Spanish, Catalan or English; 1 to 120 characters once trimmed.',
    }),
    timeZone: timeZoneName.meta({
      description:
        'IANA name of the time zone the phrase is written in, e.g. `Europe/Madrid`: today and the time now are taken in it.',
    }),
    region: z.string().optional().meta({
      description:
        'The region of the browser’s language, two capital letters, e.g. `ES` or `US`: it orders a date in figures ("7/4" is 4 July in the United States). Any other text is read as no region (day/month), never refused.',
    }),
  })
  .meta({ id: 'DateInterpretationBody' });

export type DateInterpretationBody = z.infer<typeof dateInterpretationBodySchema>;

const single = z.object({ kind: z.literal('single'), at: clockTime });
/** A clock time range of a reading; `nextDay` when it ends on the day after it starts. */
export const clockRangeSchema = z.object({
  kind: z.literal('range'),
  start: clockTime,
  end: clockTime,
  nextDay: z
    .literal(true)
    .optional()
    .meta({ description: 'Present when the range ends on the day after it starts.' }),
});

/** A clock time or a range of them. */
const clockTimes = z.discriminatedUnion('kind', [single, clockRangeSchema]);

const readOptionSchema = z.object({
  dates: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('single'), date: calendarDate }),
    z.object({ kind: z.literal('range'), start: calendarDate, end: calendarDate }),
  ]),
  time: z
    .discriminatedUnion('kind', [
      single,
      clockRangeSchema,
      z.object({
        kind: z.literal('question'),
        question: z.int().min(0).meta({ description: 'The place of its question in `questions`.' }),
      }),
    ])
    .nullable()
    .meta({
      description:
        'Null for a whole day or a range of days. `question`: the half of the day was not said, and the time is the reading of that question the organizer picks.',
    }),
});

const timeQuestionSchema = z.object({
  fragment: z.string().meta({ description: 'The words of the phrase that said the time.' }),
  dates: z.array(calendarDate).meta({ description: 'Every date the time is asked of.' }),
  morning: clockTimes,
  afternoon: clockTimes,
});

const fragment = z.string().meta({ description: 'The words of the phrase the notice speaks of.' });
const markedDates = z.array(calendarDate).meta({
  description:
    'The first day of each marked option the fragment speaks of; none for a vague time said of no day.',
});

const readNoticeSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.enum(['timeUnclear', 'tooLate']), fragment, dates: markedDates }),
    z.object({
      kind: z.literal('dayNotWritten'),
      fragment,
      dates: markedDates,
      written: z.enum(['weekday', 'date']).meta({
        description:
          'How the phrase wrote the day whose midnight is the day marked: a date ("el 20 de junio") or not ("el sábado", "mañana").',
      }),
    }),
    z.object({
      kind: z.enum(['unclear', 'mismatch', 'past', 'horizon']),
      fragment: fragment.optional(),
    }),
    z.object({ kind: z.literal('pastTime'), fragment }),
    z.object({ kind: z.literal('tooMany') }),
  ])
  .meta({
    description:
      'One thing the organizer is told. About days that are marked: `timeUnclear` (the time was not understood), `tooLate` (the time range ends after 06:00 of the next day; no time is kept), `dayNotWritten` (midnight said of a day is 00:00 of the next one). About what gave no option: `unclear` (not understood), `mismatch` (a date that does not exist or does not fit), `past` (a date already past), `horizon` (beyond 12 months), each without `fragment` when it speaks of the whole phrase, `pastTime` (a time of today already past) and `tooMany` (above 60 options: nothing is marked).',
  });

export const dateInterpretationSchema = z
  .object({
    options: z.array(readOptionSchema).meta({
      description: 'The options to mark; none with `tooMany` or when nothing is understood.',
    }),
    questions: z.array(timeQuestionSchema).meta({
      description:
        'One "morning or afternoon?" question per distinct time whose half of the day was not said.',
    }),
    notices: z.array(readNoticeSchema).meta({
      description: 'One notice per fragment, every one that applies.',
    }),
  })
  .meta({
    id: 'DateInterpretation',
    description:
      'What a phrase says about when: options, questions and notices, each in the phrase’s order. Dates and times carry no zone.',
  });

export type DateInterpretation = z.infer<typeof dateInterpretationSchema>;

export const dateInterpretationEndpoint = defineEndpoint({
  method: 'post',
  path: '/api/date-interpretations',
  summary:
    'Reads the dates and times of a phrase in plain language; nothing is stored, and every phrase gets an answer',
  tags: ['events'],
  body: dateInterpretationBodySchema,
  responses: {
    200: { description: 'What the phrase says', schema: dateInterpretationSchema },
    400: { description: 'The request breaks the contract', schema: validationFailedSchema },
    403: foreignPageResponse,
    429: {
      ...rateLimitedResponse,
      description: 'Too many phrases from this address: at most 20 in any hour',
    },
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

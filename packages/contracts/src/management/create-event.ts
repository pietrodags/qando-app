import { z } from 'zod';
import { crossSiteSessionSchema } from '../auth/sign-out.js';
import { calendarDate, timeZoneName } from '../calendar-values.js';
import { defineEndpoint } from '../endpoint.js';
import {
  errorBodySchema,
  fieldProblemSchema,
  internalErrorSchema,
  unauthenticatedSchema,
} from '../error.js';
import { optionSchema } from '../public-events/public-event.js';
import { managementTokenSchema } from './managed-event.js';

/** An option as the organizer proposes it: an option's dates and time, without an ID yet. */
export const proposedOptionSchema = z
  .strictObject({ dates: optionSchema.shape.dates, time: optionSchema.shape.time })
  .meta({
    id: 'ProposedOption',
    description:
      'One date the organizer proposes: a day, a range of days, or a day with a time or time range.',
  });

export const createEventBodySchema = z
  .strictObject({
    title: z.string().meta({ description: '1–50 characters as people see them, once trimmed.' }),
    organizerName: z
      .string()
      .meta({ description: '2–30 characters as people see them, once trimmed.' }),
    timeZone: timeZoneName.meta({
      description:
        'IANA name of the organizer’s time zone, e.g. `Europe/Madrid`: today, the options and the deadline are read in it.',
    }),
    deadline: calendarDate.meta({
      description: 'Last day of voting, today or later in `timeZone`; voting closes at its end.',
    }),
    note: z.string().optional().meta({
      description:
        'At most 150 characters as people see them, once trimmed; empty or only spaces is no note.',
    }),
    anonymous: z.boolean().meta({ description: 'Whether participants vote without a name.' }),
    options: z.array(proposedOptionSchema).meta({
      description:
        '1 to 60, from today to the same day twelve months later in `timeZone`, in any order: the API stores them in chronological order.',
    }),
  })
  .meta({
    id: 'CreateEvent',
    description:
      'A new event, owned by the account of the session; the email of its summary is the account’s.',
  });

export type CreateEventBody = z.infer<typeof createEventBodySchema>;

export const eventCreatedSchema = z
  .object({
    participationId: z.string().meta({ description: 'The ID of the participation link.' }),
    resultsId: z.string().meta({ description: 'The ID of the results link.' }),
    managementToken: managementTokenSchema.meta({
      description: 'The token of the management link, answered once: only its hash is stored.',
    }),
  })
  .meta({ id: 'EventCreated', description: 'The new event’s links.' });

export type EventCreated = z.infer<typeof eventCreatedSchema>;

/** A rule of the event that its organizer's request breaks, or a broken part of the request. */
const eventProblemSchema = z
  .union([
    fieldProblemSchema,
    z.object({
      code: z.enum([
        'NAME_MISSING',
        'NAME_TOO_SHORT',
        'NAME_TOO_LONG',
        'TITLE_MISSING',
        'TITLE_TOO_LONG',
        'NO_OPTIONS',
        'TOO_MANY_OPTIONS',
        'DEADLINE_PAST',
        'NOTE_TOO_LONG',
      ]),
    }),
    z.object({
      code: z.enum([
        'DATE_PAST',
        'DATE_TOO_FAR',
        'DATE_RANGE_DEGENERATE',
        'TIME_ON_DATE_RANGE',
        'TIME_OFF_QUARTER',
        'TIME_RANGE_DEGENERATE',
        'WHOLE_DAY_WITH_TIMES',
        'DUPLICATE',
      ]),
      index: z.int().min(0).meta({
        description: 'The option’s place in the list as sent, from 0: the field `options[index]`.',
      }),
    }),
  ])
  .meta({ id: 'EventProblem' });

export type EventProblem = z.infer<typeof eventProblemSchema>;

export const eventRejectedSchema = errorBodySchema('VALIDATION_FAILED', {
  details: z.array(eventProblemSchema),
}).meta({
  id: 'EventRejected',
  description:
    'Nothing was created: every rule the event breaks, in the order of the wizard’s steps, or the parts of the request that break the contract.',
});

export type EventRejectedBody = z.infer<typeof eventRejectedSchema>;

export const createEventEndpoint = defineEndpoint({
  method: 'post',
  path: '/api/events',
  summary: 'Creates an event owned by the account of the session, with its links',
  tags: ['management'],
  body: createEventBodySchema,
  responses: {
    201: { description: 'The event is created', schema: eventCreatedSchema },
    400: { description: 'Nothing was created', schema: eventRejectedSchema },
    401: { description: 'The request carries no session', schema: unauthenticatedSchema },
    403: {
      description: 'The session was sent from a page of another site, or without `Origin`',
      schema: crossSiteSessionSchema,
    },
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

import { z } from 'zod';
import { calendarDate, clockTime } from '../calendar-values.js';
import { defineEndpoint } from '../endpoint.js';
import {
  errorBodySchema,
  internalErrorSchema,
  rateLimitedResponse,
  validationFailedSchema,
} from '../error.js';

export const optionSchema = z
  .object({
    id: z.uuid(),
    dates: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('single'), date: calendarDate }),
      z.object({ kind: z.literal('range'), start: calendarDate, end: calendarDate }),
    ]),
    time: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('single'), at: clockTime }),
        z.object({ kind: z.literal('range'), start: clockTime, end: clockTime }),
      ])
      .nullable()
      .meta({ description: 'Null for a whole day; times only appear on single dates.' }),
  })
  .meta({
    id: 'Option',
    description:
      'One date the organizer offers; its dates and times are read in the event’s time zone.',
  });

export type Option = z.infer<typeof optionSchema>;

export const publicEventSchema = z
  .object({
    title: z.string(),
    organizerName: z.string(),
    note: z.string().nullable(),
    deadline: calendarDate.meta({ description: 'Last day of voting, in `timeZone`.' }),
    timeZone: z.string().meta({ description: 'IANA name, e.g. `Europe/Madrid`.' }),
    anonymous: z.boolean(),
    state: z.enum(['open', 'closed', 'confirmed']).meta({
      description: 'Closed once the deadline has passed, even before anything else changes it.',
    }),
    options: z.array(optionSchema).meta({ description: 'In chronological order.' }),
    confirmedOption: optionSchema.nullable(),
  })
  .meta({
    id: 'PublicEvent',
    description:
      'What a participant may see of an event: never the organizer email, tokens, counts or votes.',
  });

export type PublicEvent = z.infer<typeof publicEventSchema>;

export const eventNotFoundSchema = errorBodySchema('NOT_FOUND', {}).meta({ id: 'NotFound' });

export const eventCancelledSchema = errorBodySchema('EVENT_CANCELLED', {
  title: z.string(),
}).meta({ id: 'EventCancelled', description: 'The event was cancelled; its title is kept.' });

/** A request that names an option the event no longer has: its page shows outdated options. */
export const optionsChangedSchema = errorBodySchema('OPTIONS_CHANGED', {}).meta({
  id: 'OptionsChanged',
  description:
    'The organizer replaced the options since the page loaded: an option sent is not one of the event’s now, or an edit did not start from its current options. Nothing changed; read the event again.',
});

export const publicEventEndpoint = defineEndpoint({
  method: 'get',
  path: '/api/public/events/{id}',
  summary: 'Reads an event through its participation link',
  tags: ['voting'],
  params: z.object({
    id: z.string().min(1).meta({ description: 'The participation ID of the link.' }),
  }),
  responses: {
    200: { description: 'The event as participants see it', schema: publicEventSchema },
    400: { description: 'The link is malformed', schema: validationFailedSchema },
    404: { description: 'No event has this participation link', schema: eventNotFoundSchema },
    410: { description: 'The event was cancelled', schema: eventCancelledSchema },
    429: rateLimitedResponse,
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

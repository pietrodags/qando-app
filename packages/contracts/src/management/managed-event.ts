import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import {
  errorBodySchema,
  internalErrorSchema,
  rateLimitedResponse,
  unauthenticatedSchema,
  validationFailedSchema,
} from '../error.js';
import {
  eventCancelledSchema,
  optionSchema,
  publicEventEndpoint,
  publicEventSchema,
} from '../public-events/public-event.js';

/** A management token as the API creates it: at least 128 random bits in base64url. */
export const managementTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/);

/**
 * Express hands the headers in lower case; every other header is left out. The token may be
 * missing: the owner's session cookie is the other way to manage an event.
 */
export const managementHeadersSchema = z.object({
  'x-management-token': managementTokenSchema.optional().meta({
    description: 'The token of the event’s management link, sent from the page, never in the URL.',
  }),
});

/** The emails an event sends its organizer, as the retry path names them. */
export const emailTypeSchema = z.enum(['summary', 'voting-closed']).meta({
  id: 'EmailType',
  description:
    '`summary`: the event’s links, sent once when it is created; `voting-closed`: the results, sent once per closing.',
});

export type EmailType = z.infer<typeof emailTypeSchema>;

export const emailStateSchema = z
  .discriminatedUnion('status', [
    z.object({
      type: emailTypeSchema,
      status: z.literal('sent'),
      sentAt: z.iso.datetime().meta({ description: 'When the email server took it.' }),
    }),
    z.object({
      type: emailTypeSchema,
      status: z.enum(['pending', 'failed']).meta({
        description:
          '`pending`: due at its time and being tried, `failed`: given up after its last attempt; the organizer can retry it.',
      }),
    }),
  ])
  .meta({
    id: 'EmailState',
    description:
      'Whether an email to the organizer went out. Sent means the email server took it, not that it reached the inbox.',
  });

export type EmailState = z.infer<typeof emailStateSchema>;

export const managedEventSchema = z
  .object({
    title: z.string(),
    timeZone: publicEventSchema.shape.timeZone,
    deadline: publicEventSchema.shape.deadline,
    state: publicEventSchema.shape.state,
    options: z.array(optionSchema).meta({ description: 'In chronological order.' }),
    confirmedOption: optionSchema.nullable(),
    voters: z.int().min(0),
    recommendedOptionIds: z.array(z.uuid()).meta({
      description:
        'The options the results recommend (their winners), in chronological order; empty with no votes or when nobody can attend.',
    }),
    participationId: z.string().meta({ description: 'The ID of the participation link.' }),
    resultsId: z.string().meta({ description: 'The ID of the results link.' }),
    emails: z.array(emailStateSchema).meta({
      description:
        'The event’s queued emails to its organizer, the summary first; an email never queued is not listed.',
    }),
  })
  .meta({
    id: 'ManagedEvent',
    description:
      'What the organizer sees of an event to manage it, with the facts a decision needs: how many voted and which options are recommended.',
  });

export type ManagedEvent = z.infer<typeof managedEventSchema>;

export const managementForbiddenSchema = errorBodySchema('FORBIDDEN', {}).meta({
  id: 'ManagementForbidden',
  description:
    'The credential does not manage this event: another event’s token, any other link, the session of another account, or an event that does not exist. A change sent with the session from a page of another site, or without `Origin`, is refused the same way.',
});

export const managedEventEndpoint = defineEndpoint({
  method: 'get',
  path: '/api/events/{id}',
  summary: 'Reads an event to manage it, with its management token or its owner’s session',
  tags: ['management'],
  params: publicEventEndpoint.params,
  headers: managementHeadersSchema,
  responses: {
    200: { description: 'The event as its organizer manages it', schema: managedEventSchema },
    400: { description: 'The request breaks the contract', schema: validationFailedSchema },
    401: { description: 'The request carries no credential', schema: unauthenticatedSchema },
    403: {
      description: 'The credential does not manage this event',
      schema: managementForbiddenSchema,
    },
    410: { description: 'The event was cancelled', schema: eventCancelledSchema },
    429: rateLimitedResponse,
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

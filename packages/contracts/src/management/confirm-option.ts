import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import {
  errorBodySchema,
  fieldProblemSchema,
  internalErrorSchema,
  rateLimitedResponse,
  unauthenticatedSchema,
} from '../error.js';
import { eventCancelledSchema } from '../public-events/public-event.js';
import {
  managedEventEndpoint,
  managedEventSchema,
  managementForbiddenSchema,
} from './managed-event.js';

export const confirmOptionBodySchema = z
  .strictObject({
    optionId: z.uuid().meta({ description: 'The ID of one of the event’s options.' }),
  })
  .meta({ id: 'ConfirmOption', description: 'The option the organizer confirms as final.' });

export type ConfirmOptionBody = z.infer<typeof confirmOptionBodySchema>;

/** Why nothing was confirmed: the request breaks the contract, or the option is not the event's. */
const confirmationProblemSchema = z
  .discriminatedUnion('code', [
    fieldProblemSchema,
    z.object({ code: z.literal('OPTION_UNKNOWN'), optionId: z.string() }),
  ])
  .meta({ id: 'ConfirmationProblem' });

export const confirmationRejectedSchema = errorBodySchema('VALIDATION_FAILED', {
  details: z.array(confirmationProblemSchema),
}).meta({
  id: 'ConfirmationRejected',
  description:
    'Nothing was confirmed: the request breaks the contract, or the option is not one of the event’s.',
});

export const alreadyConfirmedSchema = errorBodySchema('ALREADY_CONFIRMED', {}).meta({
  id: 'AlreadyConfirmed',
  description: 'Another option is already confirmed: a confirmation is final.',
});

export const confirmOptionEndpoint = defineEndpoint({
  method: 'post',
  path: '/api/events/{id}/confirmation',
  summary: 'Confirms the final option of an event, before or after the deadline; closes voting',
  tags: ['management'],
  params: managedEventEndpoint.params,
  headers: managedEventEndpoint.headers,
  body: confirmOptionBodySchema,
  responses: {
    200: {
      description:
        'The option is confirmed: the event as its organizer manages it. Confirming the confirmed option again (a retry after a lost answer) answers the same and changes nothing',
      schema: managedEventSchema,
    },
    400: { description: 'Nothing was confirmed', schema: confirmationRejectedSchema },
    401: { description: 'The request carries no credential', schema: unauthenticatedSchema },
    403: {
      description: 'The credential does not manage this event',
      schema: managementForbiddenSchema,
    },
    409: { description: 'Another option is already confirmed', schema: alreadyConfirmedSchema },
    410: { description: 'The event was cancelled', schema: eventCancelledSchema },
    429: rateLimitedResponse,
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

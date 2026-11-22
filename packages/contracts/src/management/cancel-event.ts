import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import {
  internalErrorSchema,
  rateLimitedResponse,
  unauthenticatedSchema,
  validationFailedSchema,
} from '../error.js';
import { eventCancelledSchema } from '../public-events/public-event.js';
import { managedEventEndpoint, managementForbiddenSchema } from './managed-event.js';

export const cancellationSchema = z
  .object({
    title: z.string(),
  })
  .meta({
    id: 'Cancellation',
    description:
      'The event is cancelled: only its title and its links are kept. The page writes the text to forward with the title.',
  });

export type Cancellation = z.infer<typeof cancellationSchema>;

export const cancelEventEndpoint = defineEndpoint({
  method: 'delete',
  path: '/api/events/{id}',
  summary:
    'Cancels an event: deletes it and everything under it, keeping its title behind its links',
  tags: ['management'],
  params: managedEventEndpoint.params,
  headers: managedEventEndpoint.headers,
  responses: {
    200: { description: 'The event is cancelled', schema: cancellationSchema },
    400: { description: 'The request breaks the contract', schema: validationFailedSchema },
    401: { description: 'The request carries no credential', schema: unauthenticatedSchema },
    403: {
      description: 'The credential does not manage this event',
      schema: managementForbiddenSchema,
    },
    410: {
      description: 'The event was cancelled already (a repeat answers the same)',
      schema: eventCancelledSchema,
    },
    429: rateLimitedResponse,
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

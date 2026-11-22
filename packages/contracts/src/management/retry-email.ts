import { defineEndpoint } from '../endpoint.js';
import {
  errorBodySchema,
  internalErrorSchema,
  rateLimitedResponse,
  unauthenticatedSchema,
  validationFailedSchema,
} from '../error.js';
import { eventCancelledSchema } from '../public-events/public-event.js';
import {
  emailStateSchema,
  emailTypeSchema,
  managedEventEndpoint,
  managementForbiddenSchema,
} from './managed-event.js';

export const emailNotFailedSchema = errorBodySchema('EMAIL_NOT_FAILED', {}).meta({
  id: 'EmailNotFailed',
  description:
    'Only a failed email is retried: this one was sent, is still being tried, or is not queued.',
});

export const retryEmailEndpoint = defineEndpoint({
  method: 'post',
  path: '/api/events/{id}/emails/{type}/retry',
  summary: 'Tries a failed email to the organizer once more',
  tags: ['management'],
  params: managedEventEndpoint.params.extend({ type: emailTypeSchema }),
  headers: managedEventEndpoint.headers,
  responses: {
    200: {
      description:
        'The email is due again and is tried once more within a minute; if it fails again, it is failed at once',
      schema: emailStateSchema,
    },
    400: { description: 'The request breaks the contract', schema: validationFailedSchema },
    401: { description: 'The request carries no credential', schema: unauthenticatedSchema },
    403: {
      description: 'The credential does not manage this event',
      schema: managementForbiddenSchema,
    },
    409: { description: 'The email has not failed', schema: emailNotFailedSchema },
    410: { description: 'The event was cancelled', schema: eventCancelledSchema },
    429: rateLimitedResponse,
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

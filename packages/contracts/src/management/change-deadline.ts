import { z } from 'zod';
import { calendarDate } from '../calendar-values.js';
import { defineEndpoint } from '../endpoint.js';
import {
  errorBodySchema,
  fieldProblemSchema,
  internalErrorSchema,
  rateLimitedResponse,
  unauthenticatedSchema,
  validationFailedSchema,
} from '../error.js';
import { eventCancelledSchema } from '../public-events/public-event.js';
import { alreadyConfirmedSchema } from './confirm-option.js';
import {
  managedEventEndpoint,
  managedEventSchema,
  managementForbiddenSchema,
} from './managed-event.js';

export const changeDeadlineBodySchema = z
  .strictObject({
    deadline: calendarDate.meta({
      description:
        'The new deadline, `YYYY-MM-DD`: voting closes at its end in the event’s time zone. From today (in that zone) to twelve months ahead; earlier than the current one too.',
    }),
  })
  .meta({ id: 'ChangeDeadline', description: 'The deadline the organizer chooses.' });

export type ChangeDeadlineBody = z.infer<typeof changeDeadlineBodySchema>;

/** Why the deadline was not changed: the request breaks the contract, or the day is not allowed. */
const deadlineProblemSchema = z
  .union([fieldProblemSchema, z.object({ code: z.enum(['DEADLINE_PAST', 'DEADLINE_TOO_FAR']) })])
  .meta({ id: 'DeadlineProblem' });

export const deadlineRejectedSchema = errorBodySchema('VALIDATION_FAILED', {
  details: z.array(deadlineProblemSchema),
}).meta({
  id: 'DeadlineRejected',
  description:
    'The deadline was not changed: the request breaks the contract, or the day is before today (`DEADLINE_PAST`) or beyond twelve months ahead (`DEADLINE_TOO_FAR`), today being read in the event’s time zone.',
});

export const changeDeadlineEndpoint = defineEndpoint({
  method: 'patch',
  path: '/api/events/{id}/deadline',
  summary:
    'Changes the deadline of an event, reopening voting if it had closed; the "voting closed" email follows the new closing',
  tags: ['management'],
  params: managedEventEndpoint.params,
  headers: managedEventEndpoint.headers,
  body: changeDeadlineBodySchema,
  responses: {
    200: {
      description:
        'The deadline is changed: the event as its organizer manages it, open until the end of the new deadline',
      schema: managedEventSchema,
    },
    400: { description: 'The deadline was not changed', schema: deadlineRejectedSchema },
    401: { description: 'The request carries no credential', schema: unauthenticatedSchema },
    403: {
      description: 'The credential does not manage this event',
      schema: managementForbiddenSchema,
    },
    409: {
      description: 'A date is confirmed: the deadline can no longer change',
      schema: alreadyConfirmedSchema,
    },
    410: { description: 'The event was cancelled', schema: eventCancelledSchema },
    429: rateLimitedResponse,
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

export const closeVotingEndpoint = defineEndpoint({
  method: 'post',
  path: '/api/events/{id}/close',
  summary:
    'Closes voting now, the deadline becoming today; the "voting closed" email is sent at once',
  tags: ['management'],
  params: managedEventEndpoint.params,
  headers: managedEventEndpoint.headers,
  responses: {
    200: {
      description:
        'Voting is closed: the event as its organizer manages it. On an event already closed (by its deadline or before) nothing changes and the answer is the same',
      schema: managedEventSchema,
    },
    400: { description: 'The request breaks the contract', schema: validationFailedSchema },
    401: { description: 'The request carries no credential', schema: unauthenticatedSchema },
    403: {
      description: 'The credential does not manage this event',
      schema: managementForbiddenSchema,
    },
    409: {
      description: 'A date is confirmed: voting closed with the confirmation',
      schema: alreadyConfirmedSchema,
    },
    410: { description: 'The event was cancelled', schema: eventCancelledSchema },
    429: rateLimitedResponse,
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

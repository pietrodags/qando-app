import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import {
  errorBodySchema,
  fieldProblemSchema,
  internalErrorSchema,
  rateLimitedResponse,
  unauthenticatedSchema,
} from '../error.js';
import { votingClosedSchema } from '../public-events/cast-vote.js';
import {
  eventCancelledSchema,
  optionIdSchema,
  optionsChangedSchema,
} from '../public-events/public-event.js';
import { alreadyConfirmedSchema } from './confirm-option.js';
import { optionProblemSchemas, proposedOptionSchema } from './create-event.js';
import {
  managedEventEndpoint,
  managedEventSchema,
  managementForbiddenSchema,
} from './managed-event.js';

export const replaceOptionsBodySchema = z
  .strictObject({
    options: z.array(proposedOptionSchema).meta({
      description:
        'The whole new list, as on creation: 1 to 60, from today to the same day twelve months later in the event’s time zone, in any order; the API stores them in chronological order with new IDs.',
    }),
    replacesOptionIds: z.array(optionIdSchema).meta({
      description:
        'The IDs of the options the editor started from: unless they are the event’s current ones, nothing changes (`OPTIONS_CHANGED`), so a save from an outdated list never undoes another.',
    }),
  })
  .meta({
    id: 'ReplaceOptions',
    description: 'The options that replace every option of an event.',
  });

export type ReplaceOptionsBody = z.infer<typeof replaceOptionsBodySchema>;

/** Why the options were not replaced: the request breaks the contract, or an option a rule. */
const optionsProblemSchema = z
  .union([fieldProblemSchema, ...optionProblemSchemas])
  .meta({ id: 'OptionsProblem' });

export const optionsRejectedSchema = errorBodySchema('VALIDATION_FAILED', {
  details: z.array(optionsProblemSchema),
}).meta({
  id: 'OptionsRejected',
  description:
    'Nothing changed: every rule the options break, as on creation (today being read in the event’s time zone), or the parts of the request that break the contract.',
});

export const votesExistSchema = errorBodySchema('VOTES_EXIST', {}).meta({
  id: 'VotesExist',
  description: 'Someone has voted: the options can no longer change.',
});

/** Why the options were not replaced although the request keeps the contract. */
export const optionsConflictSchema = z
  .union([alreadyConfirmedSchema, votingClosedSchema, votesExistSchema, optionsChangedSchema])
  .meta({
    id: 'OptionsConflict',
    description:
      'Nothing changed, the first that applies: a date is confirmed (`ALREADY_CONFIRMED`), voting is closed (`VOTING_CLOSED`: extending the deadline reopens it), someone has voted (`VOTES_EXIST`), or the options are not the ones the editor started from (`OPTIONS_CHANGED`).',
  });

export const replaceOptionsEndpoint = defineEndpoint({
  method: 'put',
  path: '/api/events/{id}/options',
  summary:
    'Replaces every option of an event while voting is open and nobody has voted; the links stay the same',
  tags: ['management'],
  params: managedEventEndpoint.params,
  headers: managedEventEndpoint.headers,
  body: replaceOptionsBodySchema,
  responses: {
    200: {
      description: 'The options are replaced: the event as its organizer manages it',
      schema: managedEventSchema,
    },
    400: { description: 'The options were not replaced', schema: optionsRejectedSchema },
    401: { description: 'The request carries no credential', schema: unauthenticatedSchema },
    403: {
      description: 'The credential does not manage this event',
      schema: managementForbiddenSchema,
    },
    409: {
      description: 'The event is confirmed or closed, someone has voted, or the options changed',
      schema: optionsConflictSchema,
    },
    410: { description: 'The event was cancelled', schema: eventCancelledSchema },
    429: rateLimitedResponse,
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

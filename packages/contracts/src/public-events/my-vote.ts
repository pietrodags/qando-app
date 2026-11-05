import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import { errorBodySchema, internalErrorSchema, validationFailedSchema } from '../error.js';
import {
  castVoteBodySchema,
  castVoteEndpoint,
  voteRuleProblemSchemas,
  voteStateSchema,
  voteTokenSchema,
  votingClosedSchema,
} from './cast-vote.js';
import { eventCancelledSchema, eventNotFoundSchema } from './public-event.js';

/** Express hands the headers in lower case; every other header is left out. */
export const myVoteHeadersSchema = z.object({
  'x-vote-token': voteTokenSchema.meta({
    description: 'The vote-edit token the voting page created for this vote.',
  }),
});

/** The stored vote, in the shape the voting page sends it, so it can be edited and sent back. */
export const myVoteSchema = z
  .object({
    name: z
      .string()
      .optional()
      .meta({ description: 'The trimmed name; absent on anonymous events.' }),
    votes: z
      .record(z.string(), voteStateSchema)
      .meta({ description: 'One state per option ID of the event.' }),
  })
  .meta({ id: 'MyVote', description: 'The answer stored under a vote-edit token.' });

export type MyVote = z.infer<typeof myVoteSchema>;

export const voteForbiddenSchema = errorBodySchema('FORBIDDEN', {}).meta({
  id: 'Forbidden',
  description: 'The token holds no vote of this event (none at all, or one of another event).',
});

/** Why an edit was not stored: the problems of a new vote, except a token already taken. */
export const editVoteProblemSchema = z
  .discriminatedUnion('code', [...voteRuleProblemSchemas])
  .meta({ id: 'EditVoteProblem' });

export type EditVoteProblemDetail = z.infer<typeof editVoteProblemSchema>;

export const editVoteRejectedSchema = errorBodySchema('VALIDATION_FAILED', {
  details: z.array(editVoteProblemSchema),
}).meta({
  id: 'EditVoteRejected',
  description:
    'Nothing was changed: the request breaks the contract or the vote breaks a rule of the event.',
});

const path = '/api/public/events/{id}/participations/mine';

export const myVoteEndpoint = defineEndpoint({
  method: 'get',
  path,
  summary: 'Reads the vote of a vote-edit token',
  tags: ['voting'],
  params: castVoteEndpoint.params,
  headers: myVoteHeadersSchema,
  responses: {
    200: { description: 'The stored vote, whatever the event’s state', schema: myVoteSchema },
    400: { description: 'The request breaks the contract', schema: validationFailedSchema },
    403: { description: 'The token holds no vote of this event', schema: voteForbiddenSchema },
    404: { description: 'No event has this participation link', schema: eventNotFoundSchema },
    410: { description: 'The event was cancelled', schema: eventCancelledSchema },
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

export const editVoteEndpoint = defineEndpoint({
  method: 'put',
  path,
  summary: 'Replaces the vote of a vote-edit token',
  tags: ['voting'],
  params: castVoteEndpoint.params,
  headers: myVoteHeadersSchema,
  body: castVoteBodySchema,
  responses: {
    200: {
      description: 'The vote is replaced; the answer is what was stored',
      schema: myVoteSchema,
    },
    400: { description: 'The edit was rejected; nothing changed', schema: editVoteRejectedSchema },
    403: { description: 'The token holds no vote of this event', schema: voteForbiddenSchema },
    404: { description: 'No event has this participation link', schema: eventNotFoundSchema },
    409: { description: 'Voting is closed', schema: votingClosedSchema },
    410: { description: 'The event was cancelled', schema: eventCancelledSchema },
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

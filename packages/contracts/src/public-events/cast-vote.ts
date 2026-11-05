import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import { errorBodySchema, fieldProblemSchema, internalErrorSchema } from '../error.js';
import { eventCancelledSchema, eventNotFoundSchema } from './public-event.js';

/**
 * The capability to read and edit one vote. The voting page creates it (at least 128 random
 * bits, base64url without padding) before the first send, so a repeated send carries the same
 * token and a lost answer never costs the voter the link.
 */
export const voteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/);

/** Express hands the headers in lower case; every other header is left out. */
export const castVoteHeadersSchema = z.object({
  'x-vote-token': voteTokenSchema.meta({
    description:
      'The new vote-edit token. Sending it again stores no second vote and gets the same answer.',
  }),
});

export const voteStateSchema = z.enum(['available', 'preferred', 'unavailable']);

export const castVoteBodySchema = z
  .strictObject({
    name: z.string().optional().meta({
      description: 'Required on named events (2–30 characters trimmed), absent on anonymous ones.',
    }),
    votes: z
      .record(z.string(), voteStateSchema)
      .meta({ description: 'One state per option ID: every option of the event exactly once.' }),
  })
  .meta({ id: 'CastVote', description: 'A participant’s answer to every option of the event.' });

export type CastVoteBody = z.infer<typeof castVoteBodySchema>;

export const voteCastSchema = z
  .object({ participationId: z.uuid() })
  .meta({ id: 'VoteCast', description: 'The stored vote; the same answer for a repeated send.' });

export type VoteCast = z.infer<typeof voteCastSchema>;

const optionProblem = <const Code extends string>(code: Code) =>
  z.object({ code: z.literal(code), optionId: z.string() });

/** What breaks the contract or a rule of the event, in a new vote or an edited one. */
export const voteRuleProblemSchemas = [
  fieldProblemSchema,
  z.object({ code: z.literal('NAME_TOO_SHORT') }),
  z.object({ code: z.literal('NAME_TOO_LONG') }),
  z.object({ code: z.literal('NAME_NOT_ALLOWED') }),
  optionProblem('OPTION_MISSING'),
  optionProblem('OPTION_UNKNOWN'),
  z.object({ code: z.literal('SEVERAL_PREFERRED'), optionIds: z.array(z.string()).readonly() }),
] as const;

/** Why a vote was not stored; every problem is listed at once. */
export const voteProblemSchema = z
  .discriminatedUnion('code', [
    ...voteRuleProblemSchemas,
    z.object({ code: z.literal('VOTE_TOKEN_TAKEN') }),
  ])
  .meta({ id: 'VoteProblem' });

export type VoteProblemDetail = z.infer<typeof voteProblemSchema>;

export const voteRejectedSchema = errorBodySchema('VALIDATION_FAILED', {
  details: z.array(voteProblemSchema),
}).meta({
  id: 'VoteRejected',
  description:
    'Nothing was stored: the request breaks the contract, the vote breaks a rule of the event, or the token already belongs to a vote of another event.',
});

export const votingClosedSchema = errorBodySchema('VOTING_CLOSED', {}).meta({
  id: 'VotingClosed',
  description: 'The deadline has passed, the organizer closed voting or confirmed a date.',
});

export const castVoteEndpoint = defineEndpoint({
  method: 'post',
  path: '/api/public/events/{id}/participations',
  summary: 'Casts a vote through the participation link',
  tags: ['voting'],
  params: z.object({
    id: z.string().min(1).meta({ description: 'The participation ID of the link.' }),
  }),
  headers: castVoteHeadersSchema,
  body: castVoteBodySchema,
  responses: {
    201: {
      description: 'The vote is stored (or was, by a send with this token)',
      schema: voteCastSchema,
    },
    400: { description: 'The vote was rejected; nothing was stored', schema: voteRejectedSchema },
    404: { description: 'No event has this participation link', schema: eventNotFoundSchema },
    409: { description: 'Voting is closed', schema: votingClosedSchema },
    410: { description: 'The event was cancelled', schema: eventCancelledSchema },
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

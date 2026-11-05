import {
  castVoteEndpoint,
  type ErrorResponse,
  type VoteCast,
  type VoteProblemDetail,
} from '@qando/contracts';
import {
  currentState,
  validateVote,
  type StoredEventState,
  type ValidVote,
  type VoteInput,
  type VotingEvent,
} from '@qando/domain';
import express, { Router, type Response } from 'express';
import { hashCapabilityToken } from '../../capability-token.js';
import { readRequest } from '../../http/read-request.js';
import { routePath } from '../../http/route-path.js';

/** What a vote is checked against: the event's options and naming, and its lifecycle. */
export type StoredVotingEvent = VotingEvent & StoredEventState & { readonly id: string };

export type VotingEventLookup =
  | { readonly status: 'found'; readonly event: StoredVotingEvent }
  | { readonly status: 'cancelled'; readonly title: string }
  | { readonly status: 'missing' };

/** A stored participation, as far as a repeated send needs to know it. */
export interface StoredParticipation {
  readonly id: string;
  readonly eventId: string;
}

/** The reads and writes of one vote, all inside one transaction. */
export interface Ballot {
  /**
   * The event of a participation link, locked until the transaction ends so the organizer cannot
   * close voting, confirm a date or replace the options in between.
   */
  event(publicId: string): Promise<VotingEventLookup>;
  /** The participation whose edit token has this hash, in whichever event. */
  participation(tokenHash: string): Promise<StoredParticipation | undefined>;
  /**
   * Stores the vote under the token's hash and answers it; if another send stored one with this
   * hash meanwhile, answers that one instead and stores nothing.
   */
  add(eventId: string, tokenHash: string, vote: ValidVote): Promise<StoredParticipation>;
}

/** Port to the stored participations. */
export interface Participations {
  transaction<T>(work: (ballot: Ballot) => Promise<T>): Promise<T>;
}

type Outcome =
  | { readonly status: 'cast'; readonly participationId: string }
  | { readonly status: 'rejected'; readonly problems: readonly VoteProblemDetail[] }
  | { readonly status: 'closed' }
  | Exclude<VotingEventLookup, { status: 'found' }>;

/**
 * Stores a vote once per token. A repeated send (double click, retry after a lost answer) gets
 * the first vote's answer whatever its body or the event's state now: the voter already holds
 * the token, so the vote is theirs to edit, not to cast again.
 */
async function castVote(
  participations: Participations,
  now: Date,
  publicId: string,
  token: string,
  input: VoteInput,
): Promise<Outcome> {
  const tokenHash = hashCapabilityToken(token);
  return participations.transaction(async (ballot) => {
    const lookup = await ballot.event(publicId);
    if (lookup.status !== 'found') return lookup;
    const { event } = lookup;

    const earlier = await ballot.participation(tokenHash);
    if (earlier) return answerFor(earlier, event);

    if (currentState(event, now) !== 'open') return { status: 'closed' };
    const validation = validateVote(event, input);
    if (!validation.ok) return { status: 'rejected', problems: validation.problems };
    return answerFor(await ballot.add(event.id, tokenHash, validation.vote), event);
  });
}

/** A token holds one vote: of this event it is the answer, of another the token is taken. */
function answerFor(participation: StoredParticipation, event: StoredVotingEvent): Outcome {
  return participation.eventId === event.id
    ? { status: 'cast', participationId: participation.id }
    : { status: 'rejected', problems: [{ code: 'VOTE_TOKEN_TAKEN' }] };
}

type Answer = Response<VoteCast | ErrorResponse<typeof castVoteEndpoint>['body']>;

/** A vote is a name and at most sixty states: far below this, so nothing larger is read. */
const bodyLimit = '16kb';

/** Serves the voting page's send: `POST /api/public/events/:id/participations`. */
export function participationsRouter(participations: Participations, now: () => Date): Router {
  const router = Router();

  router.post(
    routePath(castVoteEndpoint),
    express.json({ limit: bodyLimit }),
    async (request, response: Answer) => {
      // Every answer depends on stored state that changes: never reuse one.
      response.set('Cache-Control', 'no-store');
      const read = readRequest(castVoteEndpoint, request);
      if (!read.ok) {
        response.status(400).json({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The request breaks the contract',
            details: read.problems,
          },
        });
        return;
      }

      const outcome = await castVote(
        participations,
        now(),
        read.params.id,
        read.headers['x-vote-token'],
        read.body,
      );
      switch (outcome.status) {
        case 'cast':
          response.status(201).json({ participationId: outcome.participationId });
          return;
        case 'rejected':
          response.status(400).json({
            error: {
              code: 'VALIDATION_FAILED',
              message: 'The vote was rejected',
              details: [...outcome.problems],
            },
          });
          return;
        case 'closed':
          response.status(409).json({
            error: { code: 'VOTING_CLOSED', message: 'Voting is closed', details: [] },
          });
          return;
        case 'cancelled':
          response.status(410).json({
            error: {
              code: 'EVENT_CANCELLED',
              message: 'The event was cancelled',
              details: [],
              title: outcome.title,
            },
          });
          return;
        case 'missing':
          response.status(404).json({
            error: {
              code: 'NOT_FOUND',
              message: 'No event has this participation link',
              details: [],
            },
          });
      }
    },
  );

  return router;
}

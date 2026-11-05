import {
  castVoteEndpoint,
  editVoteEndpoint,
  myVoteEndpoint,
  type ErrorResponse,
  type FieldProblem,
  type MyVote,
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

/** A stored participation: whose event it is and what it answered. */
export interface StoredParticipation {
  readonly id: string;
  readonly eventId: string;
  readonly vote: ValidVote;
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
  /**
   * Replaces the name and every state of a participation of this event. Edits of the same
   * participation running at the same time are applied one after the other: the last one wins.
   */
  replace(eventId: string, participationId: string, vote: ValidVote): Promise<void>;
}

/** Port to the stored participations. */
export interface Participations {
  transaction<T>(work: (ballot: Ballot) => Promise<T>): Promise<T>;
}

/** Why a request about a vote got no vote; each one has its own error answer. */
type Refusal =
  | { readonly status: 'rejected'; readonly problems: readonly VoteProblemDetail[] }
  | { readonly status: 'closed' }
  | { readonly status: 'forbidden' }
  | Exclude<VotingEventLookup, { status: 'found' }>;

/** Whether a vote may be stored in the event now, and in which form. */
function accept(
  event: StoredVotingEvent,
  now: Date,
  input: VoteInput,
): Refusal | { readonly status: 'valid'; readonly vote: ValidVote } {
  if (currentState(event, now) !== 'open') return { status: 'closed' };
  const validation = validateVote(event, input);
  return validation.ok
    ? { status: 'valid', vote: validation.vote }
    : { status: 'rejected', problems: validation.problems };
}

/**
 * Stores a vote once per token. A repeated send (double click, retry after a lost answer) gets
 * the first vote's answer whatever its body or the event's state now: the voter already holds
 * the token, so the vote is theirs to edit, not to cast again.
 */
async function castVote(
  participations: Participations,
  now: () => Date,
  publicId: string,
  token: string,
  input: VoteInput,
): Promise<Refusal | { readonly status: 'cast'; readonly participationId: string }> {
  const tokenHash = hashCapabilityToken(token);
  return participations.transaction(async (ballot) => {
    const lookup = await ballot.event(publicId);
    if (lookup.status !== 'found') return lookup;
    const { event } = lookup;

    const earlier = await ballot.participation(tokenHash);
    if (earlier) return answerFor(earlier, event);

    // Read the clock only now: the request may have waited past the deadline for the lock.
    const accepted = accept(event, now(), input);
    if (accepted.status !== 'valid') return accepted;
    return answerFor(await ballot.add(event.id, tokenHash, accepted.vote), event);
  });
}

/** A token holds one vote: of this event it is the answer, of another the token is taken. */
function answerFor(participation: StoredParticipation, event: StoredVotingEvent) {
  return participation.eventId === event.id
    ? ({ status: 'cast', participationId: participation.id } as const)
    : ({ status: 'rejected', problems: [{ code: 'VOTE_TOKEN_TAKEN' }] } as const);
}

/**
 * The event of the link and the vote the token holds in it. A token without a vote there (none
 * at all, or one of another event) is refused the same way, so it learns nothing about either.
 */
async function yourVote(ballot: Ballot, publicId: string, token: string) {
  const lookup = await ballot.event(publicId);
  if (lookup.status !== 'found') return lookup;
  const participation = await ballot.participation(hashCapabilityToken(token));
  if (participation?.eventId !== lookup.event.id) return { status: 'forbidden' } as const;
  return { status: 'yours', event: lookup.event, participation } as const;
}

/** Reads the vote of a token, whatever the event's state: closing voting hides no one's answer. */
async function readVote(
  participations: Participations,
  publicId: string,
  token: string,
): Promise<Refusal | { readonly status: 'yours'; readonly vote: ValidVote }> {
  return participations.transaction(async (ballot) => {
    const access = await yourVote(ballot, publicId, token);
    if (access.status !== 'yours') return access;
    return { status: 'yours', vote: access.participation.vote };
  });
}

/** Replaces the vote of a token with the same rules as a new vote, while voting is open. */
async function editVote(
  participations: Participations,
  now: () => Date,
  publicId: string,
  token: string,
  input: VoteInput,
): Promise<Refusal | { readonly status: 'yours'; readonly vote: ValidVote }> {
  return participations.transaction(async (ballot) => {
    const access = await yourVote(ballot, publicId, token);
    if (access.status !== 'yours') return access;

    // Read the clock only now: the request may have waited past the deadline for the lock.
    const accepted = accept(access.event, now(), input);
    if (accepted.status !== 'valid') return accepted;
    await ballot.replace(access.event.id, access.participation.id, accepted.vote);
    return { status: 'yours', vote: accepted.vote };
  });
}

/** A vote as the contract answers it: the name only on named events. */
function myVote({ name, votes }: ValidVote): MyVote {
  return name === null ? { votes } : { name, votes };
}

type RefusalAnswer =
  | ErrorResponse<typeof castVoteEndpoint>
  | ErrorResponse<typeof myVoteEndpoint>
  | ErrorResponse<typeof editVoteEndpoint>;

function refusalAnswer(refusal: Refusal): RefusalAnswer {
  switch (refusal.status) {
    case 'rejected':
      return {
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The vote was rejected',
            details: [...refusal.problems],
          },
        },
      };
    case 'closed':
      return {
        status: 409,
        body: { error: { code: 'VOTING_CLOSED', message: 'Voting is closed', details: [] } },
      };
    case 'forbidden':
      return {
        status: 403,
        body: {
          error: {
            code: 'FORBIDDEN',
            message: 'The token holds no vote of this event',
            details: [],
          },
        },
      };
    case 'cancelled':
      return {
        status: 410,
        body: {
          error: {
            code: 'EVENT_CANCELLED',
            message: 'The event was cancelled',
            details: [],
            title: refusal.title,
          },
        },
      };
    case 'missing':
      return {
        status: 404,
        body: {
          error: {
            code: 'NOT_FOUND',
            message: 'No event has this participation link',
            details: [],
          },
        },
      };
  }
}

/** A vote is a name and at most sixty states: far below this, so nothing larger is read. */
const bodyLimit = '16kb';

/** The answer to a request that breaks the contract: each broken part, never its value. */
function contractBroken(problems: FieldProblem[]) {
  return {
    error: {
      code: 'VALIDATION_FAILED' as const,
      message: 'The request breaks the contract',
      details: problems,
    },
  };
}

/**
 * Serves the voting page's sends and reads, under `/api/public/events/:id/participations`: cast
 * a vote (`POST`), and read or replace the vote of the token (`GET` and `PUT` `…/mine`).
 */
export function participationsRouter(participations: Participations, now: () => Date): Router {
  const router = Router();
  // Every answer depends on stored state that changes: never reuse one.
  router.use(routePath(castVoteEndpoint), (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  router.post(
    routePath(castVoteEndpoint),
    express.json({ limit: bodyLimit }),
    async (request, response: Response<VoteCast | RefusalAnswer['body']>) => {
      const read = readRequest(castVoteEndpoint, request);
      if (!read.ok) {
        response.status(400).json(contractBroken(read.problems));
        return;
      }
      const outcome = await castVote(
        participations,
        now,
        read.params.id,
        read.headers['x-vote-token'],
        read.body,
      );
      if (outcome.status === 'cast') {
        response.status(201).json({ participationId: outcome.participationId });
        return;
      }
      const refused = refusalAnswer(outcome);
      response.status(refused.status).json(refused.body);
    },
  );

  router.get(
    routePath(myVoteEndpoint),
    async (request, response: Response<MyVote | RefusalAnswer['body']>) => {
      const read = readRequest(myVoteEndpoint, request);
      if (!read.ok) {
        response.status(400).json(contractBroken(read.problems));
        return;
      }
      const outcome = await readVote(participations, read.params.id, read.headers['x-vote-token']);
      if (outcome.status === 'yours') {
        response.status(200).json(myVote(outcome.vote));
        return;
      }
      const refused = refusalAnswer(outcome);
      response.status(refused.status).json(refused.body);
    },
  );

  router.put(
    routePath(editVoteEndpoint),
    express.json({ limit: bodyLimit }),
    async (request, response: Response<MyVote | RefusalAnswer['body']>) => {
      const read = readRequest(editVoteEndpoint, request);
      if (!read.ok) {
        response.status(400).json(contractBroken(read.problems));
        return;
      }
      const outcome = await editVote(
        participations,
        now,
        read.params.id,
        read.headers['x-vote-token'],
        read.body,
      );
      if (outcome.status === 'yours') {
        response.status(200).json(myVote(outcome.vote));
        return;
      }
      const refused = refusalAnswer(outcome);
      response.status(refused.status).json(refused.body);
    },
  );

  return router;
}

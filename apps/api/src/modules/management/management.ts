import {
  cancelEventEndpoint,
  confirmOptionEndpoint,
  managedEventEndpoint,
  managedEventSchema,
  retryEmailEndpoint,
  type Cancellation,
  type EmailState,
  type ErrorResponse,
  type FieldProblem,
  type ManagedEvent,
} from '@qando/contracts';
import express, { Router, type Request, type Response } from 'express';
import { contractBroken, readRequest } from '../../http/read-request.js';
import { routePath } from '../../http/route-path.js';
import { signedInAccount } from '../../http/session.js';
import { cancelEvent, type EventCancellation } from './cancel-event.js';
import { confirmOption, type Confirmation } from './confirm-option.js';
import type { ManagedEvents, ManagementCredentials } from './managed-events.js';
import { readManagedEvent } from './read-managed-event.js';
import { retryEmail, type EmailRetry } from './retry-email.js';

type ErrorAnswer =
  | ErrorResponse<typeof managedEventEndpoint>
  | ErrorResponse<typeof confirmOptionEndpoint>
  | ErrorResponse<typeof retryEmailEndpoint>
  | ErrorResponse<typeof cancelEventEndpoint>;

type ManagementResponse = Response<ManagedEvent | EmailState | Cancellation | ErrorAnswer['body']>;

/** What a management request amounts to. */
type Outcome = Confirmation | EmailRetry | EventCancellation;

/** Why a management request did nothing. */
type Refusal = Exclude<
  Outcome,
  { status: 'found' } | { status: 'retried' } | { status: 'deleted' }
>;

/**
 * The HTTP answer of each refusal of every management endpoint: those of who is acting, then
 * those of a change to the event.
 */
function refusalAnswer(refusal: Refusal): ErrorAnswer {
  switch (refusal.status) {
    case 'unauthenticated':
      return {
        status: 401,
        body: {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'No credential to manage the event',
            details: [],
          },
        },
      };
    case 'forbidden':
      return {
        status: 403,
        body: {
          error: {
            code: 'FORBIDDEN',
            message: 'The credential does not manage this event',
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
    case 'already-confirmed':
      return {
        status: 409,
        body: {
          error: {
            code: 'ALREADY_CONFIRMED',
            message: 'Another option is already confirmed',
            details: [],
          },
        },
      };
    case 'not-failed':
      return {
        status: 409,
        body: {
          error: {
            code: 'EMAIL_NOT_FAILED',
            message: 'Only a failed email is retried',
            details: [],
          },
        },
      };
    case 'not-an-option':
      return {
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The option is not one of the event’s',
            details: [{ code: 'OPTION_UNKNOWN', optionId: refusal.optionId }],
          },
        },
      };
  }
}

/** Answers the event as the contract shows it, the email retried, the title cancelled, or the refusal. */
function answer(response: ManagementResponse, outcome: Outcome): void {
  if (outcome.status === 'found') {
    // Parsing keeps only what the contract shows.
    response.status(200).json(managedEventSchema.parse(outcome.event));
    return;
  }
  if (outcome.status === 'retried') {
    response.status(200).json(outcome.email);
    return;
  }
  if (outcome.status === 'deleted') {
    response.status(200).json({ title: outcome.title });
    return;
  }
  const refused = refusalAnswer(outcome);
  response.status(refused.status).json(refused.body);
}

/** Who the request says is acting: the management link's token, the session's account, or both. */
function credentialsOf(
  request: Request,
  headers: { readonly 'x-management-token'?: string | undefined },
): ManagementCredentials {
  return { managementToken: headers['x-management-token'], accountId: signedInAccount(request) };
}

/** The answer to a request that breaks the contract: each broken part, never its value. */
function answerContractBroken(response: ManagementResponse, problems: FieldProblem[]): void {
  response.status(400).json(contractBroken(problems));
}

/** A confirmation names one option ID: far below this, so nothing larger is read. */
const bodyLimit = '1kb';

/**
 * Serves the management page under `/api/events/:id`, `:id` being the participation ID of the
 * link: read the event (`GET`), confirm its final option (`POST …/confirmation`), retry a
 * failed email (`POST …/emails/:type/retry`) and cancel it (`DELETE`). The management token travels in
 * `X-Management-Token`, never in the URL; the owner's session (read by `sessionReader` in front
 * of these routes) grants the same.
 */
export function managementRouter(managedEvents: ManagedEvents, now: () => Date): Router {
  const router = Router();
  // Every answer depends on stored state that changes: never reuse one.
  router.use(routePath(managedEventEndpoint), (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  router.get(routePath(managedEventEndpoint), async (request, response: ManagementResponse) => {
    const read = readRequest(managedEventEndpoint, request);
    if (!read.ok) {
      answerContractBroken(response, read.problems);
      return;
    }
    const credentials = credentialsOf(request, read.headers);
    answer(response, await readManagedEvent(managedEvents, read.params.id, credentials, now));
  });

  router.post(
    routePath(confirmOptionEndpoint),
    express.json({ limit: bodyLimit }),
    async (request, response: ManagementResponse) => {
      const read = readRequest(confirmOptionEndpoint, request);
      if (!read.ok) {
        answerContractBroken(response, read.problems);
        return;
      }
      const credentials = credentialsOf(request, read.headers);
      answer(
        response,
        await confirmOption(managedEvents, read.params.id, credentials, read.body.optionId, now),
      );
    },
  );

  router.post(routePath(retryEmailEndpoint), async (request, response: ManagementResponse) => {
    const read = readRequest(retryEmailEndpoint, request);
    if (!read.ok) {
      answerContractBroken(response, read.problems);
      return;
    }
    const { id, type } = read.params;
    const credentials = credentialsOf(request, read.headers);
    answer(response, await retryEmail(managedEvents, id, credentials, type, now));
  });

  router.delete(routePath(cancelEventEndpoint), async (request, response: ManagementResponse) => {
    const read = readRequest(cancelEventEndpoint, request);
    if (!read.ok) {
      answerContractBroken(response, read.problems);
      return;
    }
    const credentials = credentialsOf(request, read.headers);
    answer(response, await cancelEvent(managedEvents, read.params.id, credentials));
  });

  return router;
}

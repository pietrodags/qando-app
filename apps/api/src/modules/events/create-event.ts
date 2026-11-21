import {
  createEventEndpoint,
  type EventCreated,
  type EventProblem,
  type EventRejectedBody,
} from '@qando/contracts';
import { validateNewEvent, type NewEvent } from '@qando/domain';
import express, { Router, type Response } from 'express';
import { noStore } from '../../http/no-store.js';
import { contractBroken, readRequest } from '../../http/read-request.js';
import { routePath } from '../../http/route-path.js';
import { sessionReader, signedInAccount, signedInOnly, type Sessions } from '../../http/session.js';

/** Port to where new events are stored. */
export interface NewEvents {
  /**
   * Stores the event owned by the account, managed with the token the page created, with its
   * options in their order and two new links, in one transaction: all of it or nothing. An
   * account without a name yet takes the event's organizer name, as accounts are named by their
   * first event. Answers the links. When the token already holds an event of the account (a
   * repeated send, also one running at the same time), nothing is stored and that event's links
   * are answered; when it holds one of another account, `taken`.
   */
  create(
    ownerId: string,
    managementToken: string,
    event: NewEvent,
  ): Promise<EventCreated | 'taken'>;
}

/** Sixty options with times, a title, a name and a note are far below this. */
const bodyLimit = '16kb';

/**
 * Serves `POST /api/events`: creates an event owned by the account of the session, checked by the
 * domain with today from the clock, and answers its links; sent again with the same management
 * token, it answers the same. Without a session `401`, before the body is read; with the session
 * sent from a page of another site `403`. Never cached.
 */
export function createEventRouter(
  newEvents: NewEvents,
  sessions: Sessions,
  now: () => Date,
): Router {
  const router = Router();
  router.post(
    routePath(createEventEndpoint),
    noStore,
    ...sessionReader(sessions),
    signedInOnly,
    express.json({ limit: bodyLimit }),
    async (request, response: Response<EventCreated | EventRejectedBody>) => {
      // `signedInOnly` lets only requests with a session this far.
      const ownerId = signedInAccount(request) ?? '';
      const read = readRequest(createEventEndpoint, request);
      if (!read.ok) {
        response.status(400).json(contractBroken(read.problems));
        return;
      }
      const validation = validateNewEvent(read.body, now());
      if (!validation.ok) {
        response.status(400).json(rejected(validation.problems));
        return;
      }
      const stored = await newEvents.create(
        ownerId,
        read.headers['x-management-token'],
        validation.event,
      );
      if (stored === 'taken') {
        response.status(400).json(rejected([{ code: 'MANAGEMENT_TOKEN_TAKEN' }]));
        return;
      }
      response.status(201).json(stored);
    },
  );
  return router;
}

function rejected(problems: readonly EventProblem[]): EventRejectedBody {
  return {
    error: { code: 'VALIDATION_FAILED', message: 'The event was rejected', details: [...problems] },
  };
}

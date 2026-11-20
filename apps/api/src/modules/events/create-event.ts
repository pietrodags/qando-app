import {
  createEventEndpoint,
  type EventCreated,
  type EventRejectedBody,
  type unauthenticatedSchema,
} from '@qando/contracts';
import { validateNewEvent, type NewEvent } from '@qando/domain';
import express, { Router, type RequestHandler, type Response } from 'express';
import type { z } from 'zod';
import { noStore } from '../../http/no-store.js';
import { contractBroken, readRequest } from '../../http/read-request.js';
import { routePath } from '../../http/route-path.js';
import { sessionReader, signedInAccount, type Sessions } from '../../http/session.js';

/** Port to where new events are stored. */
export interface NewEvents {
  /**
   * Stores the event owned by the account, with its options in their order and three new links,
   * in one transaction: all of it or nothing. An account without a name yet takes the event's
   * organizer name, as accounts are named by their first event. Answers the links.
   */
  create(ownerId: string, event: NewEvent): Promise<EventCreated>;
}

type UnauthenticatedBody = z.infer<typeof unauthenticatedSchema>;

/** Answers `401` to a request without a session, before its body is read. */
const signedInOnly: RequestHandler = (request, response: Response<UnauthenticatedBody>, next) => {
  if (signedInAccount(request) !== undefined) {
    next();
    return;
  }
  response.status(401).json({
    error: { code: 'UNAUTHENTICATED', message: 'Creating an event needs a session', details: [] },
  });
};

/** Sixty options with times, a title, a name and a note are far below this. */
const bodyLimit = '16kb';

/**
 * Serves `POST /api/events`: creates an event owned by the account of the session, checked by the
 * domain with today from the clock, and answers its links. Without a session `401`, before the
 * body is read; with the session sent from a page of another site `403`. Never cached.
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
        response.status(400).json({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The event was rejected',
            details: [...validation.problems],
          },
        });
        return;
      }
      response.status(201).json(await newEvents.create(ownerId, validation.event));
    },
  );
  return router;
}

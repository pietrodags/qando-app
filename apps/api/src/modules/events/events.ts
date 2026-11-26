import {
  createEventEndpoint,
  organizerNameEndpoint,
  type EventCreated,
  type EventProblem,
  type EventRejectedBody,
  type OrganizerName,
} from '@qando/contracts';
import express, { Router, type Response } from 'express';
import { noStore } from '../../http/no-store.js';
import { contractBroken, readRequest } from '../../http/read-request.js';
import { routePath } from '../../http/route-path.js';
import { signedInAccountId, signedInOnly, type Sessions } from '../../http/session.js';
import { createEvent, type NewEvents } from './create-event.js';

/** Sixty options with times, a title, a name and a note are far below this. */
const bodyLimit = '16kb';

/**
 * Serves creating an event from the page. `POST /api/events` creates an event owned by the account
 * of the session, managed with the token the page created (`createEvent`), and answers its links;
 * sent again with the same management token, it answers the same. `GET /api/me/organizer-name`
 * answers the name a new event of the account starts with: the organizer name of its last event,
 * or `null`. Without a session `401`, before the body is read; with the session sent from a page
 * of another site `403`. Never cached.
 */
export function createEventRouter(
  newEvents: NewEvents,
  sessions: Sessions,
  now: () => Date,
): Router {
  const router = Router();
  router.get(
    routePath(organizerNameEndpoint),
    noStore,
    ...signedInOnly(sessions),
    async (request, response: Response<OrganizerName>) => {
      const name = await newEvents.lastOrganizerName(signedInAccountId(request));
      response.status(200).json({ organizerName: name ?? null });
    },
  );
  router.post(
    routePath(createEventEndpoint),
    noStore,
    ...signedInOnly(sessions),
    express.json({ limit: bodyLimit }),
    async (request, response: Response<EventCreated | EventRejectedBody>) => {
      const read = readRequest(createEventEndpoint, request);
      if (!read.ok) {
        response.status(400).json(contractBroken(read.problems));
        return;
      }
      const creation = await createEvent(
        newEvents,
        signedInAccountId(request),
        read.headers['x-management-token'],
        read.body,
        now(),
      );
      if (creation.status === 'rejected') {
        response.status(400).json(rejected(creation.problems));
        return;
      }
      response.status(201).json(creation.links);
    },
  );
  return router;
}

function rejected(problems: readonly EventProblem[]): EventRejectedBody {
  return {
    error: { code: 'VALIDATION_FAILED', message: 'The event was rejected', details: [...problems] },
  };
}

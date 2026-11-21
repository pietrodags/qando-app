import { myEventsEndpoint, myEventsSchema, type MyEvent } from '@qando/contracts';
import { Router, type Response } from 'express';
import { noStore } from '../../http/no-store.js';
import { routePath } from '../../http/route-path.js';
import { signedInAccountId, signedInOnly, type Sessions } from '../../http/session.js';
import { listMyEvents } from './list-my-events.js';
import type { ManagedEvents } from './managed-events.js';

/**
 * Serves `GET /api/me/events`, "Mis eventos": the events of the session's account, newest first,
 * in their current state. Without a session `401`. Never cached.
 */
export function myEventsRouter(
  managedEvents: ManagedEvents,
  sessions: Sessions,
  now: () => Date,
): Router {
  const router = Router();
  router.get(
    routePath(myEventsEndpoint),
    noStore,
    ...signedInOnly(sessions),
    async (request, response: Response<MyEvent[]>) => {
      const accountId = signedInAccountId(request);
      // Checks the answer against the contract before it leaves.
      response
        .status(200)
        .json(myEventsSchema.parse(await listMyEvents(managedEvents, accountId, now)));
    },
  );
  return router;
}

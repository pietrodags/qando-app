import {
  managedEventEndpoint,
  managedEventSchema,
  type ErrorResponse,
  type ManagedEvent,
} from '@qando/contracts';
import { Router, type Response } from 'express';
import { readRequest } from '../../http/read-request.js';
import { routePath } from '../../http/route-path.js';
import type { ManagedEvents, ManagementRefusal } from './managed-events.js';
import { readManagedEvent } from './read-managed-event.js';

type ErrorBody = ErrorResponse<typeof managedEventEndpoint>['body'];

/** The HTTP answer of each refusal, shared by every management endpoint. */
function refusalAnswer(refusal: ManagementRefusal): { status: 401 | 403 | 410; body: ErrorBody } {
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
  }
}

/**
 * Serves the management page under `/api/events/:id`, `:id` being the participation ID of the
 * link; the management token travels in `X-Management-Token`, never in the URL.
 */
export function managementRouter(managedEvents: ManagedEvents, now: () => Date): Router {
  const router = Router();
  // Every answer depends on stored state that changes: never reuse one.
  router.use(routePath(managedEventEndpoint), (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  router.get(
    routePath(managedEventEndpoint),
    async (request, response: Response<ManagedEvent | ErrorBody>) => {
      const read = readRequest(managedEventEndpoint, request);
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
      const reading = await readManagedEvent(
        managedEvents,
        read.params.id,
        { managementToken: read.headers['x-management-token'] },
        now,
      );
      if (reading.status === 'found') {
        // Parsing keeps only what the contract shows.
        response.status(200).json(managedEventSchema.parse(reading.event));
        return;
      }
      const refused = refusalAnswer(reading);
      response.status(refused.status).json(refused.body);
    },
  );

  return router;
}

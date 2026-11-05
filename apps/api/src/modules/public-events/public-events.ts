import {
  publicEventEndpoint,
  publicEventSchema,
  type ErrorResponse,
  type PublicEvent,
} from '@qando/contracts';
import { currentState, type StoredEventState } from '@qando/domain';
import { Router, type Response } from 'express';
import { routePath } from '../../http/route-path.js';

/**
 * An event as stored, in the shape participants see, except that its state depends on the time:
 * the stored state and the closing instant, from which the answer computes the current one.
 */
export type StoredPublicEvent = Omit<PublicEvent, 'state'> & StoredEventState;

/** What a participation link leads to. */
export type PublicEventLookup =
  | { readonly status: 'found'; readonly event: StoredPublicEvent }
  | { readonly status: 'cancelled'; readonly title: string }
  | { readonly status: 'missing' };

/** Port to the stored events, looked up by the participation ID of their link. */
export interface PublicEvents {
  find(publicId: string): Promise<PublicEventLookup>;
}

type Answer = Response<PublicEvent | ErrorResponse<typeof publicEventEndpoint>['body']>;

/** Serves the voting page's read of an event: `GET /api/public/events/:id`. */
export function publicEventsRouter(publicEvents: PublicEvents, now: () => Date): Router {
  const router = Router();

  router.get(routePath(publicEventEndpoint), async (request, response: Answer) => {
    const { id } = publicEventEndpoint.params.parse(request.params);
    const lookup = await publicEvents.find(id);

    // The state changes with the time and the organizer's actions: never reuse an old answer.
    response.set('Cache-Control', 'no-store');
    switch (lookup.status) {
      case 'found': {
        const { state, closesAt, ...shown } = lookup.event;
        // Parsing keeps only what the contract shows, whatever the lookup carried.
        const event = publicEventSchema.parse({
          ...shown,
          state: currentState({ state, closesAt }, now()),
        });
        response.status(200).json(event);
        return;
      }
      case 'cancelled':
        response.status(410).json({
          error: {
            code: 'EVENT_CANCELLED',
            message: 'The event was cancelled',
            details: [],
            title: lookup.title,
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
  });

  return router;
}

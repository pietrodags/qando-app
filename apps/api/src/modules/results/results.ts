import { resultsEndpoint, resultsSchema, type ErrorResponse, type Results } from '@qando/contracts';
import { Router, type Response } from 'express';
import { routePath } from '../../http/route-path.js';
import { readResults, type EventResults } from './read-results.js';

type Answer = Response<Results | ErrorResponse<typeof resultsEndpoint>['body']>;

/** Serves the results page: `GET /api/results/:resultsId`, the HTTP side of `readResults`. */
export function resultsRouter(eventResults: EventResults, now: () => Date): Router {
  const router = Router();

  router.get(routePath(resultsEndpoint), async (request, response: Answer) => {
    const { resultsId } = resultsEndpoint.params.parse(request.params);
    const reading = await readResults(eventResults, resultsId, now);

    // Every vote changes the results: never reuse an old answer.
    response.set('Cache-Control', 'no-store');
    switch (reading.status) {
      case 'found':
        // Parsing keeps only what the contract shows.
        response.status(200).json(resultsSchema.parse(reading.results));
        return;
      case 'participation-link':
        response.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'A participation link opens no results',
            details: [],
          },
        });
        return;
      case 'cancelled':
        response.status(410).json({
          error: {
            code: 'EVENT_CANCELLED',
            message: 'The event was cancelled',
            details: [],
            title: reading.title,
          },
        });
        return;
      case 'missing':
        response.status(404).json({
          error: { code: 'NOT_FOUND', message: 'No event has this results link', details: [] },
        });
    }
  });

  return router;
}

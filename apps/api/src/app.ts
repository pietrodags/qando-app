import express, { type Express } from 'express';
import { errorBoundary, type ErrorLog } from './http/error-boundary.js';
import { docsRouter } from './modules/docs/docs.js';
import { healthRouter, type DatabaseCheck } from './modules/health/health.js';
import { publicEventsRouter, type PublicEvents } from './modules/public-events/public-events.js';

/** The app's edges: the database behind its ports, the clock and the error log. */
export interface AppDependencies {
  checkDatabase: DatabaseCheck;
  publicEvents: PublicEvents;
  now: () => Date;
  logError: ErrorLog;
}

export function createApp({
  checkDatabase,
  publicEvents,
  now,
  logError,
}: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/health', healthRouter(checkDatabase));
  app.use(publicEventsRouter(publicEvents, now));
  app.use('/api', docsRouter());
  app.use(errorBoundary(logError));
  return app;
}

import express, { type Express } from 'express';
import { errorBoundary, type ErrorLog } from './http/error-boundary.js';
import { docsRouter } from './modules/docs/docs.js';
import { forwardingProbeRouter } from './modules/forwarding-probe/forwarding-probe.js';
import { healthRouter, type DatabaseCheck } from './modules/health/health.js';
import {
  participationsRouter,
  type Participations,
} from './modules/participations/participations.js';
import { publicEventsRouter, type PublicEvents } from './modules/public-events/public-events.js';

/** The app's edges: the database behind its ports, the clock and the error log. */
export interface AppDependencies {
  checkDatabase: DatabaseCheck;
  publicEvents: PublicEvents;
  participations: Participations;
  now: () => Date;
  logError: ErrorLog;
}

export function createApp({
  checkDatabase,
  publicEvents,
  participations,
  now,
  logError,
}: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/health', healthRouter(checkDatabase));
  app.use('/api/debug/forwarding', forwardingProbeRouter());
  app.use(publicEventsRouter(publicEvents, now));
  app.use(participationsRouter(participations, now));
  app.use('/api', docsRouter());
  app.use(errorBoundary(logError));
  return app;
}

import express, { type Express } from 'express';
import { publicEventEndpoint } from '@qando/contracts';
import { errorBoundary, type ErrorLog } from './http/error-boundary.js';
import { capabilityRateLimit } from './http/rate-limit.js';
import { routePath } from './http/route-path.js';
import { trustedProxies } from './http/trusted-proxies.js';
import { docsRouter } from './modules/docs/docs.js';
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
  // `request.ip` is the client's address, read past the hosting's proxies.
  app.set('trust proxy', trustedProxies);
  app.use('/api/health', healthRouter(checkDatabase));
  // Every endpoint opened with a capability link lives under the public event's path.
  app.use(routePath(publicEventEndpoint), capabilityRateLimit());
  app.use(publicEventsRouter(publicEvents, now));
  app.use(participationsRouter(participations, now));
  app.use('/api', docsRouter());
  app.use(errorBoundary(logError));
  return app;
}

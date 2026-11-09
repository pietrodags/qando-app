import express, { type Express } from 'express';
import { managedEventEndpoint, publicEventEndpoint, resultsEndpoint } from '@qando/contracts';
import { errorBoundary, type ErrorLog } from './http/error-boundary.js';
import { capabilityRateLimit } from './http/rate-limit.js';
import { routePath } from './http/route-path.js';
import { sessionReader, type Sessions } from './http/session.js';
import { trustedProxies } from './http/trusted-proxies.js';
import { signOutRouter } from './modules/auth/sign-out.js';
import { docsRouter } from './modules/docs/docs.js';
import { healthRouter, type DatabaseCheck } from './modules/health/health.js';
import type { ManagedEvents } from './modules/management/managed-events.js';
import { managementRouter } from './modules/management/management.js';
import {
  participationsRouter,
  type Participations,
} from './modules/participations/participations.js';
import { publicEventsRouter, type PublicEvents } from './modules/public-events/public-events.js';
import type { EventResults } from './modules/results/read-results.js';
import { resultsRouter } from './modules/results/results.js';

/** The app's edges: the database behind its ports, the sessions, the clock and the error log. */
export interface AppDependencies {
  checkDatabase: DatabaseCheck;
  publicEvents: PublicEvents;
  participations: Participations;
  results: EventResults;
  managedEvents: ManagedEvents;
  /** The organizers' sign-in sessions, read on the endpoints a session can open. */
  sessions: Sessions;
  now: () => Date;
  logError: ErrorLog;
}

export function createApp({
  checkDatabase,
  publicEvents,
  participations,
  results,
  managedEvents,
  sessions,
  now,
  logError,
}: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  // `request.ip` is the client's address, read past the hosting's proxies.
  app.set('trust proxy', trustedProxies);
  app.use('/api/health', healthRouter(checkDatabase));
  app.use(signOutRouter(sessions));
  // Every endpoint opened with a capability link or token shares one count: the voting endpoints
  // live under the public event's path, the results under the results link's, and managing an
  // event under the managed event's.
  const capabilityLimit = capabilityRateLimit();
  app.use(routePath(publicEventEndpoint), capabilityLimit);
  app.use(routePath(resultsEndpoint), capabilityLimit);
  // Managing an event also accepts the owner's session, read after the limit.
  app.use(routePath(managedEventEndpoint), capabilityLimit, ...sessionReader(sessions));
  app.use(publicEventsRouter(publicEvents, now));
  app.use(participationsRouter(participations, now));
  app.use(resultsRouter(results, now));
  app.use(managementRouter(managedEvents, now));
  app.use('/api', docsRouter());
  app.use(errorBoundary(logError));
  return app;
}

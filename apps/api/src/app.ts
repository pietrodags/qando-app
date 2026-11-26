import express, { type Express, type RequestHandler } from 'express';
import { managedEventEndpoint, publicEventEndpoint, resultsEndpoint } from '@qando/contracts';
import { errorBoundary, type ErrorLog } from './http/error-boundary.js';
import { capabilityRateLimit } from './http/rate-limit.js';
import { routePath } from './http/route-path.js';
import { sessionReader, type Sessions } from './http/session.js';
import { trustedProxies } from './http/trusted-proxies.js';
import { accountDeletionRouter, type AccountDeletion } from './modules/auth/account-deletion.js';
import {
  connectingApplicationRouter,
  type ConnectionRequests,
} from './modules/auth/connecting-application.js';
import { signInRouter, type SignInCodes } from './modules/auth/sign-in.js';
import { sessionRouter } from './modules/auth/session.js';
import { signOutRouter } from './modules/auth/sign-out.js';
import { connectorRouter, type ConnectorAccess } from './modules/connector/connector.js';
import { dateInterpretationsRouter } from './modules/date-interpretations/date-interpretations.js';
import { phraseInterpreter } from './modules/date-interpretations/interpret-phrase.js';
import { docsRouter } from './modules/docs/docs.js';
import type { NewEvents } from './modules/events/create-event.js';
import { createEventRouter } from './modules/events/events.js';
import { healthRouter, type DatabaseCheck } from './modules/health/health.js';
import type { ManagedEvents } from './modules/management/managed-events.js';
import { managementRouter } from './modules/management/management.js';
import { myEventsRouter } from './modules/management/my-events.js';
import {
  participationsRouter,
  type Participations,
} from './modules/participations/participations.js';
import type { EditPhrase } from './phrase-editor/phrase-editor.js';
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
  /** Where the events organizers create are stored. */
  newEvents: NewEvents;
  /** The organizers' sign-in sessions, read on the endpoints a session can open. */
  sessions: Sessions;
  /** Sending sign-in codes and signing in with them. */
  signInCodes: SignInCodes;
  /** Deleting an account on its owner's request, with a code sent to its email. */
  accountDeletion: AccountDeletion;
  /** The routes an application is allowed to act for an account through, and their metadata. */
  authorizationServer: RequestHandler;
  /** The requests to connect an application that the authorization server signed. */
  connectionRequests: ConnectionRequests;
  /** Who may call the connector: the check of the access token each request carries. */
  connectorAccess: ConnectorAccess;
  /** The copy edit of a date phrase before it is read; the phrase as written when it has none. */
  editPhrase: EditPhrase;
  now: () => Date;
  /** The public address of the pages: qando's website, as the connector names it. */
  publicUrl: string;
  logError: ErrorLog;
}

export function createApp({
  checkDatabase,
  publicEvents,
  participations,
  results,
  managedEvents,
  newEvents,
  sessions,
  signInCodes,
  accountDeletion,
  authorizationServer,
  connectionRequests,
  connectorAccess,
  editPhrase,
  now,
  publicUrl,
  logError,
}: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  // `request.ip` is the client's address, read past the hosting's proxies.
  app.set('trust proxy', trustedProxies);
  app.use('/api/health', healthRouter(checkDatabase));
  // Before every router that reads a body: the token route takes a form, which the sign-in
  // library reads itself.
  app.use(authorizationServer);
  app.use(signInRouter(signInCodes, sessions, now));
  app.use(signOutRouter(sessions));
  app.use(sessionRouter(sessions));
  app.use(accountDeletionRouter(accountDeletion, sessions, now));
  app.use(connectingApplicationRouter(connectionRequests, sessions));
  const interpret = phraseInterpreter(editPhrase, now);
  app.use(
    connectorRouter(
      connectorAccess,
      sessions,
      { managedEvents, interpret, newEvents },
      { now, website: publicUrl, logError },
    ),
  );
  app.use(dateInterpretationsRouter(interpret, sessions));
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
  app.use(myEventsRouter(managedEvents, sessions, now));
  app.use(createEventRouter(newEvents, sessions, now));
  app.use('/api', docsRouter());
  app.use(errorBoundary(logError));
  return app;
}

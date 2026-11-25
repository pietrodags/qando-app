import {
  connectingApplicationEndpoint,
  type ConnectingApplication,
  type ConnectionRequestExpiredBody,
  type ValidationFailedBody,
} from '@qando/contracts';
import express, { Router, type Response } from 'express';
import { noStore } from '../../http/no-store.js';
import { requestLimit } from '../../http/rate-limit.js';
import { contractBroken, readRequest } from '../../http/read-request.js';
import { routePath } from '../../http/route-path.js';
import { ownPagesOnly, signedInOnly, type Sessions } from '../../http/session.js';

/** Port to the requests to connect an application, as the authorization server signs them. */
export interface ConnectionRequests {
  /**
   * The application the request names, as it described itself in the document it publishes when
   * it asked. None for a request the authorization server did not sign, or signed more than 10
   * minutes ago, whatever it says.
   */
  applicationOf(connectionRequest: string): Promise<ConnectingApplication | undefined>;
}

/** The consent page asks once when it opens: far more than a person's reloads. */
const requestsPerMinute = 60;
/** As the sign-in reads it: an application's request can carry a long `state`. */
const bodyLimit = '32kb';

/**
 * Serves `POST /api/auth/connecting-application`, which the consent page asks to know what to
 * show: the application its request names, only to qando's own pages (`403`, before the request
 * is counted: a page of another site, open in the same browser, spends none of the address's
 * requests) and to a session (`401`), and `410` for a request that expired or that the
 * authorization server did not sign. The page sends whatever it was opened with: only the
 * signature says what a request is. Every answer is `no-store`.
 */
export function connectingApplicationRouter(
  requests: ConnectionRequests,
  sessions: Sessions,
): Router {
  const router = Router();
  router.post(
    routePath(connectingApplicationEndpoint),
    noStore,
    ownPagesOnly(sessions),
    requestLimit({ limit: requestsPerMinute, windowMs: 60_000 }),
    ...signedInOnly(sessions),
    express.json({ limit: bodyLimit }),
    async (
      request,
      response: Response<
        ConnectingApplication | ValidationFailedBody | ConnectionRequestExpiredBody
      >,
    ) => {
      const read = readRequest(connectingApplicationEndpoint, request);
      if (!read.ok) {
        response.status(400).json(contractBroken(read.problems));
        return;
      }
      const application = await requests.applicationOf(read.body.connectionRequest);
      if (application === undefined) {
        response.status(410).json({
          error: {
            code: 'CONNECTION_REQUEST_EXPIRED',
            message: 'The request to connect expired',
            details: [],
          },
        });
        return;
      }
      response.status(200).json(application);
    },
  );
  return router;
}

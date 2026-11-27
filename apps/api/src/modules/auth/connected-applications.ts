import {
  connectedApplicationsEndpoint,
  connectedApplicationsSchema,
  disconnectApplicationEndpoint,
  type ConnectedApplication,
  type ConnectionNotFoundBody,
  type Disconnected,
  type ValidationFailedBody,
} from '@qando/contracts';
import { Router, type Response } from 'express';
import { noStore } from '../../http/no-store.js';
import { contractBroken, readRequest } from '../../http/read-request.js';
import { routePath } from '../../http/route-path.js';
import { signedInAccountId, signedInOnly, type Sessions } from '../../http/session.js';

/** Port to the applications (AI assistants) each account allowed to act for it. */
export interface ConnectedApplications {
  /** The applications the account allowed, the newest connection first. */
  of(accountId: string): Promise<readonly ConnectedApplication[]>;
  /**
   * Withdraws what the account allowed in the connection it names, with every token the
   * application renews its access with: its next call to the connector and its next renewal are
   * refused, also one that was on its way. False, with nothing changed, for a connection the
   * account does not have, another account's included.
   */
  disconnect(accountId: string, connectionId: string): Promise<boolean>;
}

/**
 * Serves "Apps conectadas": `GET /api/me/connected-apps`, the applications of the session's
 * account, and `DELETE /api/me/connected-apps/{id}`, which disconnects one of them, `404` for a
 * connection the account does not have. Only to a session (`401`); disconnecting only from
 * qando's own pages (`403`, the session's origin check). Every answer is `no-store`.
 */
export function connectedApplicationsRouter(
  applications: ConnectedApplications,
  sessions: Sessions,
): Router {
  const router = Router();
  router.get(
    routePath(connectedApplicationsEndpoint),
    noStore,
    ...signedInOnly(sessions),
    async (request, response: Response<ConnectedApplication[]>) => {
      // Checks the answer against the contract before it leaves.
      response
        .status(200)
        .json(connectedApplicationsSchema.parse(await applications.of(signedInAccountId(request))));
    },
  );
  router.delete(
    routePath(disconnectApplicationEndpoint),
    noStore,
    ...signedInOnly(sessions),
    async (
      request,
      response: Response<Disconnected | ConnectionNotFoundBody | ValidationFailedBody>,
    ) => {
      const read = readRequest(disconnectApplicationEndpoint, request);
      if (!read.ok) {
        response.status(400).json(contractBroken(read.problems));
        return;
      }
      if (!(await applications.disconnect(signedInAccountId(request), read.params.id))) {
        response.status(404).json({
          error: { code: 'NOT_FOUND', message: 'The account has no such connection', details: [] },
        });
        return;
      }
      response.status(200).json({ disconnected: true });
    },
  );
  return router;
}

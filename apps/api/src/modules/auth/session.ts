import { sessionEndpoint, type SignedInAccount } from '@qando/contracts';
import { Router, type Response } from 'express';
import { noStore } from '../../http/no-store.js';
import { routePath } from '../../http/route-path.js';
import type { Sessions } from '../../http/session.js';

/**
 * Serves `GET /api/auth/session`, which every page asks to know whether its browser is signed
 * in: the name and the email of the session's account, with the cookie renewed while reading it,
 * or `null` without a session or with one that expired or was signed out. A visitor without the
 * cookie costs no database work.
 */
export function sessionRouter(sessions: Sessions): Router {
  const router = Router();
  router.get(
    routePath(sessionEndpoint),
    noStore,
    async (request, response: Response<SignedInAccount | null>) => {
      if (!(await sessions.carried(request.headers))) {
        response.status(200).json(null);
        return;
      }
      const { account, renewedCookies } = await sessions.read(request.headers);
      // Appending none sends no header.
      response.append('Set-Cookie', [...renewedCookies]);
      response.status(200).json(account ? { name: account.name, email: account.email } : null);
    },
  );
  return router;
}

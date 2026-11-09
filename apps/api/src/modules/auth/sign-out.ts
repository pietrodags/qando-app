import { signOutEndpoint, type SignedOut } from '@qando/contracts';
import { Router, type Response } from 'express';
import { routePath } from '../../http/route-path.js';
import { sessionOriginCheck, type Sessions } from '../../http/session.js';

/**
 * Serves `POST /api/auth/sign-out`: deletes the browser's session on the server and only then
 * clears its cookies, so a session that could not be deleted (`500`) keeps its cookie and the
 * page can retry. The session sent from a page of another site is refused (`403`) before
 * anything is deleted.
 */
export function signOutRouter(sessions: Sessions): Router {
  const router = Router();
  router.post(
    routePath(signOutEndpoint),
    sessionOriginCheck(sessions),
    async (request, response: Response<SignedOut>) => {
      const cleared = await sessions.end(request.headers);
      response.set('Cache-Control', 'no-store');
      response.append('Set-Cookie', [...cleared]);
      response.status(200).json({ signedOut: true });
    },
  );
  return router;
}

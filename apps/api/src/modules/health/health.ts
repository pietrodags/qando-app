import { Router } from 'express';

/** Resolves to true when the database answers. */
export type DatabaseCheck = () => Promise<boolean>;

export function healthRouter(checkDatabase: DatabaseCheck): Router {
  const router = Router();

  router.get('/', async (_request, response) => {
    const isUp = await checkDatabase().catch(() => false);

    response.set('Cache-Control', 'no-store');
    if (isUp) {
      response.status(200).json({ status: 'ok', database: 'up' });
    } else {
      response.status(503).json({ status: 'unavailable', database: 'down' });
    }
  });

  return router;
}

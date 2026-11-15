import type { RequestHandler } from 'express';

/** Marks every answer of the route `no-store`, also the refusals of the middleware after it. */
export const noStore: RequestHandler = (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
};

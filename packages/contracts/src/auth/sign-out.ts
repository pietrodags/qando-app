import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import { errorBodySchema, internalErrorSchema } from '../error.js';

export const signedOutSchema = z
  .object({ signedOut: z.literal(true) })
  .meta({ id: 'SignedOut', description: 'The session is deleted and its cookies cleared.' });

export type SignedOut = z.infer<typeof signedOutSchema>;

/**
 * A change sent with the session cookie from a page of another site, or without `Origin`: the
 * browser sends the cookie with any request, so only the origin tells qando's pages apart (CSRF).
 */
export const crossSiteSessionSchema = errorBodySchema('FORBIDDEN', {}).meta({
  id: 'CrossSiteSession',
  description:
    'The session was sent from a page of another site, or without `Origin`: it cannot change anything.',
});

export type CrossSiteSessionBody = z.infer<typeof crossSiteSessionSchema>;

export const signOutEndpoint = defineEndpoint({
  method: 'post',
  path: '/api/auth/sign-out',
  summary:
    'Signs the browser out: deletes its session on the server, then clears its cookies; without a session it only clears them',
  tags: ['auth'],
  responses: {
    200: { description: 'Signed out', schema: signedOutSchema },
    403: {
      description: 'The session was sent from a page of another site',
      schema: crossSiteSessionSchema,
    },
    500: {
      description: 'The session could not be deleted; the cookie is kept, so it can be retried',
      schema: internalErrorSchema,
    },
  },
});

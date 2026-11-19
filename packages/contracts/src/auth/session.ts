import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import { internalErrorSchema } from '../error.js';

export const signedInAccountSchema = z
  .object({
    name: z.string().meta({
      description: 'Empty until the account creates its first event or names itself.',
    }),
    email: z.string(),
  })
  .meta({ id: 'SignedInAccount', description: 'The account the browser is signed in as.' });

export type SignedInAccount = z.infer<typeof signedInAccountSchema>;

export const sessionEndpoint = defineEndpoint({
  method: 'get',
  path: '/api/auth/session',
  summary:
    'Tells a page whether its browser is signed in: the account of its session, or `null` without one (never `401`, as every page asks)',
  tags: ['auth'],
  responses: {
    200: {
      description: 'The account signed in, or `null`',
      schema: signedInAccountSchema.nullable(),
    },
    500: { description: 'The session could not be read', schema: internalErrorSchema },
  },
});

import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import { internalErrorSchema, unauthenticatedSchema } from '../error.js';

export const organizerNameSchema = z
  .object({
    organizerName: z.string().nullable().meta({
      description:
        'The organizer name of the account’s most recently created event; `null` before its first.',
    }),
  })
  .meta({
    id: 'OrganizerName',
    description: 'The name a new event of the signed-in account starts with, which it can change.',
  });

export type OrganizerName = z.infer<typeof organizerNameSchema>;

export const organizerNameEndpoint = defineEndpoint({
  method: 'get',
  path: '/api/me/organizer-name',
  summary:
    'Answers the organizer name of the signed-in account’s most recently created event, which a new event proposes',
  tags: ['management'],
  responses: {
    200: {
      description: 'The name, or `null` for an account without events',
      schema: organizerNameSchema,
    },
    401: { description: 'The request carries no session', schema: unauthenticatedSchema },
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

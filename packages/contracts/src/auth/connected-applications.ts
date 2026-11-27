import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import {
  errorBodySchema,
  internalErrorSchema,
  unauthenticatedSchema,
  validationFailedSchema,
} from '../error.js';
import { connectingApplicationSchema } from './connecting-application.js';
import { crossSiteSessionSchema } from './sign-out.js';

/** Where the connector answers: the address an assistant is given to connect to qando. */
export const connectorPath = '/api/mcp';

export const connectedApplicationSchema = z
  .object({
    id: z.string().min(1).meta({
      description:
        'The connection, as disconnecting names it: what the account allowed the application, new each time the application is connected again.',
    }),
    name: connectingApplicationSchema.shape.name,
    host: connectingApplicationSchema.shape.host,
    connectedAt: z.iso.datetime().meta({ description: 'When the account allowed it.' }),
  })
  .meta({
    id: 'ConnectedApplication',
    description:
      'An application (an AI assistant) the signed-in account allowed to act for it, as "Apps conectadas" shows it.',
  });

export type ConnectedApplication = z.infer<typeof connectedApplicationSchema>;

export const connectedApplicationsSchema = z.array(connectedApplicationSchema).meta({
  id: 'ConnectedApplications',
  description: 'Every application the account has connected, the newest connection first.',
});

export const connectedApplicationsEndpoint = defineEndpoint({
  method: 'get',
  path: '/api/me/connected-apps',
  summary:
    'Lists the applications the signed-in account allowed to act for it, the newest connection first',
  tags: ['auth'],
  responses: {
    200: {
      description: 'The account’s applications, maybe none',
      schema: connectedApplicationsSchema,
    },
    401: { description: 'The request carries no session', schema: unauthenticatedSchema },
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

export const connectionParamsSchema = z.strictObject({
  id: z.string().min(1).max(64).meta({
    description: 'The connection, as the list of the account’s applications gives it.',
  }),
});

export const disconnectedSchema = z.object({ disconnected: z.literal(true) }).meta({
  id: 'Disconnected',
  description:
    'The application no longer acts for the account: what it was allowed is withdrawn, its next call is refused and so is renewing its access.',
});

export type Disconnected = z.infer<typeof disconnectedSchema>;

/** A connection the account does not have: never connected, disconnected already, or another account’s. */
export const connectionNotFoundSchema = errorBodySchema('NOT_FOUND', {}).meta({
  id: 'ConnectionNotFound',
  description: 'The account has no such connection.',
});

export type ConnectionNotFoundBody = z.infer<typeof connectionNotFoundSchema>;

export const disconnectApplicationEndpoint = defineEndpoint({
  method: 'delete',
  path: '/api/me/connected-apps/{id}',
  summary:
    'Disconnects an application from the signed-in account: withdraws what it was allowed and every token it renews its access with',
  tags: ['auth'],
  params: connectionParamsSchema,
  responses: {
    200: { description: 'Disconnected', schema: disconnectedSchema },
    400: { description: 'The request breaks the contract', schema: validationFailedSchema },
    401: { description: 'The request carries no session', schema: unauthenticatedSchema },
    403: {
      description: 'The session was sent from a page of another site',
      schema: crossSiteSessionSchema,
    },
    404: {
      description:
        'The account has no such connection: never connected, disconnected already, or another account’s',
      schema: connectionNotFoundSchema,
    },
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

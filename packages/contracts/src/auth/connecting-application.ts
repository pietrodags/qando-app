import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import {
  errorBodySchema,
  foreignPageResponse,
  internalErrorSchema,
  rateLimitedResponse,
  unauthenticatedSchema,
  validationFailedSchema,
} from '../error.js';

export const connectingApplicationBodySchema = z
  .strictObject({
    connectionRequest: z.string().min(1).meta({
      description:
        'The query of the consent page’s address, whole and as it is: the application’s request to connect as the authorization server signed it, valid for 10 minutes.',
    }),
  })
  .meta({
    id: 'ConnectingApplicationRequest',
    description: 'The request to connect the consent page was opened with.',
  });

export type ConnectingApplicationBody = z.input<typeof connectingApplicationBodySchema>;

export const connectingApplicationSchema = z
  .object({
    name: z.string().min(1).meta({
      description: 'The name the application gives itself in the document it publishes.',
    }),
    host: z.string().min(1).meta({
      description: 'The host of the address that document is published at, e.g. `claude.ai`.',
    }),
  })
  .meta({
    id: 'ConnectingApplication',
    description:
      'The application a request to connect names, as the consent page shows it: what the application says about itself, and never its logo.',
  });

export type ConnectingApplication = z.infer<typeof connectingApplicationSchema>;

/**
 * A request to connect the authorization server did not sign, or signed more than 10 minutes
 * ago: there is nothing to allow, and the person starts again from the application.
 */
export const connectionRequestExpiredSchema = errorBodySchema(
  'CONNECTION_REQUEST_EXPIRED',
  {},
).meta({
  id: 'ConnectionRequestExpired',
  description:
    'The request to connect was not signed by the authorization server, or more than 10 minutes ago.',
});

export type ConnectionRequestExpiredBody = z.infer<typeof connectionRequestExpiredSchema>;

export const connectingApplicationEndpoint = defineEndpoint({
  method: 'post',
  path: '/api/auth/connecting-application',
  summary:
    'Tells the consent page which application a request to connect names, for the signed-in account to allow it or not',
  tags: ['auth'],
  body: connectingApplicationBodySchema,
  responses: {
    200: {
      description: 'The application the request names',
      schema: connectingApplicationSchema,
    },
    400: { description: 'The request breaks the contract', schema: validationFailedSchema },
    401: { description: 'The request carries no session', schema: unauthenticatedSchema },
    403: foreignPageResponse,
    410: {
      description: 'The request to connect expired, or the authorization server did not sign it',
      schema: connectionRequestExpiredSchema,
    },
    429: { ...rateLimitedResponse, description: 'Too many requests from this address' },
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});

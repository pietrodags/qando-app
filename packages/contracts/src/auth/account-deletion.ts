import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import {
  internalErrorSchema,
  rateLimitedResponse,
  unauthenticatedSchema,
  validationFailedSchema,
} from '../error.js';
import {
  codeExpiredSchema,
  codeNotDeliveredSchema,
  tooManyAttemptsSchema,
  wrongCodeSchema,
} from './sign-in.js';
import { crossSiteSessionSchema } from './sign-out.js';

export const deletionCodeSentSchema = z
  .object({
    sent: z.literal(true),
    resendAfterSeconds: z.int().min(1).meta({
      description: 'Seconds until a new code may be asked for.',
    }),
  })
  .meta({
    id: 'DeletionCodeSent',
    description:
      'A new 6-digit code was delivered to the account’s email. It is the email’s one code, the one signing in takes too: it replaces the last one and is valid for 10 minutes and 5 wrong tries.',
  });

export type DeletionCodeSent = z.infer<typeof deletionCodeSentSchema>;

export const accountDeletionBodySchema = z
  .strictObject({
    code: z
      .string()
      .regex(/^\d{6}$/)
      .meta({ description: 'The 6 digits of the last code sent to the account’s email.' }),
  })
  .meta({ id: 'AccountDeletionRequest', description: 'The code sent to the account’s email.' });

export type AccountDeletionBody = z.input<typeof accountDeletionBodySchema>;

export const accountDeletedSchema = z.object({ deleted: z.literal(true) }).meta({
  id: 'AccountDeleted',
  description:
    'The account is deleted with its events, everything under them and what is left of the events it cancelled; its sessions ended and the browser’s cookies cleared.',
});

export type AccountDeleted = z.infer<typeof accountDeletedSchema>;

/** Why the account was not deleted. */
export const accountDeletionRefusedSchema = z.union([
  validationFailedSchema,
  wrongCodeSchema,
  codeExpiredSchema,
  tooManyAttemptsSchema,
]);

export type AccountDeletionRefusedBody = z.infer<typeof accountDeletionRefusedSchema>;

const unauthenticatedResponse = {
  description: 'The request carries no session',
  schema: unauthenticatedSchema,
};

const crossSiteResponse = {
  description: 'The session was sent from a page of another site',
  schema: crossSiteSessionSchema,
};

const unexpectedFailureResponse = {
  description: 'The request failed unexpectedly',
  schema: internalErrorSchema,
};

export const sendDeletionCodeEndpoint = defineEndpoint({
  method: 'post',
  path: '/api/me/deletion-code',
  summary:
    'Sends the signed-in account’s email a code that deletes the account, replacing the email’s last code',
  tags: ['auth'],
  responses: {
    200: { description: 'The code was delivered', schema: deletionCodeSentSchema },
    401: unauthenticatedResponse,
    403: crossSiteResponse,
    429: {
      ...rateLimitedResponse,
      description:
        'Too many codes: a new one only after 30 seconds and at most 5 an hour, and a limit per address',
    },
    500: unexpectedFailureResponse,
    502: { description: 'The code email could not be delivered', schema: codeNotDeliveredSchema },
  },
});

export const deleteAccountEndpoint = defineEndpoint({
  method: 'post',
  path: '/api/me/deletion',
  summary:
    'Deletes the signed-in account and all its events with the code sent to its email, and signs the browser out',
  tags: ['auth'],
  body: accountDeletionBodySchema,
  responses: {
    200: {
      description: 'Deleted: the code is used up and the browser’s cookies cleared',
      schema: accountDeletedSchema,
    },
    400: {
      description:
        'Nothing deleted: the request breaks the contract, or the code is wrong, expired or void',
      schema: accountDeletionRefusedSchema,
    },
    401: unauthenticatedResponse,
    403: crossSiteResponse,
    429: { ...rateLimitedResponse, description: 'Too many tries from this address' },
    500: unexpectedFailureResponse,
  },
});

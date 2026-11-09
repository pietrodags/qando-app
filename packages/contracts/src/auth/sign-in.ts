import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import {
  errorBodySchema,
  internalErrorSchema,
  rateLimitedResponse,
  validationFailedSchema,
} from '../error.js';

/** An email as an account is known by: trimmed and in lower case, at most 254 characters. */
const accountEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254))
  .meta({ description: 'The email the code is sent to; trimmed and compared in lower case.' });

export const signInCodeBodySchema = z
  .strictObject({ email: accountEmailSchema })
  .meta({ id: 'SignInCodeRequest', description: 'The email to send a sign-in code to.' });

export type SignInCodeBody = z.input<typeof signInCodeBodySchema>;

export const signInCodeSentSchema = z
  .object({
    sent: z.literal(true),
    resendAfterSeconds: z.int().min(1).meta({
      description: 'Seconds until a new code may be asked for the same email.',
    }),
  })
  .meta({
    id: 'SignInCodeSent',
    description:
      'A new 6-digit code was delivered to the email; it replaces the last one and is valid for 10 minutes and 5 wrong tries.',
  });

export type SignInCodeSent = z.infer<typeof signInCodeSentSchema>;

export const codeNotDeliveredSchema = errorBodySchema('CODE_NOT_DELIVERED', {}).meta({
  id: 'CodeNotDelivered',
  description: 'The email server did not take the code email; asking again sends a new code.',
});

export type CodeNotDeliveredBody = z.infer<typeof codeNotDeliveredSchema>;

/**
 * A request to sign in sent from a page of another site, or without `Origin`: only qando's pages
 * may sign a browser in (login CSRF) or have codes sent from it.
 */
export const foreignPageSchema = errorBodySchema('FORBIDDEN', {}).meta({
  id: 'ForeignPage',
  description: 'The request was sent from a page of another site, or without `Origin`.',
});

export type ForeignPageBody = z.infer<typeof foreignPageSchema>;

const foreignPageResponse = {
  description: 'The request was sent from a page of another site',
  schema: foreignPageSchema,
};

const unexpectedFailureResponse = {
  description: 'The request failed unexpectedly',
  schema: internalErrorSchema,
};

export const sendSignInCodeEndpoint = defineEndpoint({
  method: 'post',
  path: '/api/auth/sign-in-code',
  summary:
    'Sends a sign-in code to an email, replacing the last one; signing in with it creates the account if the email has none',
  tags: ['auth'],
  body: signInCodeBodySchema,
  responses: {
    200: { description: 'The code was delivered', schema: signInCodeSentSchema },
    400: { description: 'The request breaks the contract', schema: validationFailedSchema },
    403: foreignPageResponse,
    429: {
      ...rateLimitedResponse,
      description:
        'Too many codes: a new one for the same email only after 30 seconds and at most 5 an hour, and a limit per address',
    },
    500: unexpectedFailureResponse,
    502: { description: 'The code email could not be delivered', schema: codeNotDeliveredSchema },
  },
});

export const signInBodySchema = z
  .strictObject({
    email: accountEmailSchema,
    code: z
      .string()
      .regex(/^\d{6}$/)
      .meta({ description: 'The 6 digits of the last code sent to the email.' }),
  })
  .meta({ id: 'SignInRequest', description: 'The email and the code sent to it.' });

export type SignInBody = z.input<typeof signInBodySchema>;

export const signedInSchema = z.object({ signedIn: z.literal(true) }).meta({
  id: 'SignedIn',
  description: 'The browser is signed in: its session cookie is set.',
});

export type SignedIn = z.infer<typeof signedInSchema>;

export const wrongCodeSchema = errorBodySchema('WRONG_CODE', {
  attemptsLeft: z.int().min(1).max(4).meta({ description: 'Wrong tries left for this code.' }),
}).meta({ id: 'WrongCode', description: 'The code is not the last one sent to the email.' });

export const codeExpiredSchema = errorBodySchema('CODE_EXPIRED', {}).meta({
  id: 'CodeExpired',
  description:
    'The email has no valid code: it expired after 10 minutes, was already used, or was never sent.',
});

export const tooManyAttemptsSchema = errorBodySchema('TOO_MANY_ATTEMPTS', {}).meta({
  id: 'TooManyAttempts',
  description: 'The code was void after 5 wrong tries, even if this one is right.',
});

/** Why the browser was not signed in. */
export const signInRefusedSchema = z.union([
  validationFailedSchema,
  wrongCodeSchema,
  codeExpiredSchema,
  tooManyAttemptsSchema,
]);

export type SignInRefusedBody = z.infer<typeof signInRefusedSchema>;

export const signInEndpoint = defineEndpoint({
  method: 'post',
  path: '/api/auth/sign-in',
  summary:
    'Signs the browser in with the code sent to an email, creating the account if the email has none',
  tags: ['auth'],
  body: signInBodySchema,
  responses: {
    200: {
      description: 'Signed in: the session cookie is set and the code is used up',
      schema: signedInSchema,
    },
    400: {
      description:
        'Not signed in: the request breaks the contract, or the code is wrong, expired or void',
      schema: signInRefusedSchema,
    },
    403: foreignPageResponse,
    429: { ...rateLimitedResponse, description: 'Too many sign-in tries from this address' },
    500: unexpectedFailureResponse,
  },
});

import { z } from 'zod';
import type { EndpointResponse } from './endpoint.js';

/**
 * The body every error answer shares: `{ error: { code, message, details } }`. `code` is the
 * stable value clients branch on; `message` is for people reading logs, never shown as UI copy.
 * `shape` adds the fields one error carries besides those (e.g. the title of a cancelled event),
 * or narrows `details` to the problems it lists; it is `{}` otherwise.
 */
export function errorBodySchema<const Code extends string, Shape extends z.ZodRawShape>(
  code: Code,
  shape: Shape,
) {
  return z.object({
    error: z.object({
      code: z.literal(code),
      message: z.string(),
      details: z.array(z.unknown()),
      ...shape,
    }),
  });
}

/** The answer to an unexpected failure; it says nothing about what failed. */
export const internalErrorSchema = errorBodySchema('INTERNAL_ERROR', {}).meta({
  id: 'InternalError',
  description: 'The request failed unexpectedly; it can be retried.',
});

export type InternalErrorBody = z.infer<typeof internalErrorSchema>;

/**
 * A part of the request that breaks its schema: where it travels and the path to it inside, e.g.
 * `{ in: 'body', path: ['votes', '<option ID>'] }`. Never its value, which may be personal data.
 */
export const fieldProblemSchema = z
  .object({
    code: z.literal('INVALID_FIELD'),
    in: z.enum(['path', 'header', 'body']),
    path: z.array(z.union([z.string(), z.number()])),
  })
  .meta({ id: 'FieldProblem', description: 'A part of the request that breaks its schema.' });

export type FieldProblem = z.infer<typeof fieldProblemSchema>;

/** A request that breaks the contract; `details` names each part that does. */
export const validationFailedSchema = errorBodySchema('VALIDATION_FAILED', {
  details: z.array(fieldProblemSchema),
}).meta({
  id: 'ValidationFailed',
  description:
    'The request breaks the contract (e.g. a path with broken percent-encoding, a body that is not JSON).',
});

export type ValidationFailedBody = z.infer<typeof validationFailedSchema>;

/**
 * Too many requests from one address to the endpoints opened with a capability link or token,
 * which could be guessed. The `Retry-After` header says how many seconds to wait.
 */
export const rateLimitedSchema = errorBodySchema('RATE_LIMITED', {}).meta({
  id: 'RateLimited',
  description:
    'Too many requests from this address; the `Retry-After` header says how many seconds to wait.',
});

export type RateLimitedBody = z.infer<typeof rateLimitedSchema>;

/** The 429 answer of every endpoint opened with a capability link or token. */
export const rateLimitedResponse = {
  description: 'Too many requests from this address',
  schema: rateLimitedSchema,
  headers: z.object({
    'Retry-After': z
      .int()
      .min(1)
      .meta({ description: 'Seconds to wait before the next request is answered.' }),
  }),
} as const satisfies EndpointResponse;

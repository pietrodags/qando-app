import { z } from 'zod';

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

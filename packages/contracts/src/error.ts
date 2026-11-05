import { z } from 'zod';

/**
 * The body every error answer shares: `{ error: { code, message, details } }`. `code` is the
 * stable value clients branch on; `message` is for people reading logs, never shown as UI copy.
 * `shape` adds the fields one error carries besides those (e.g. the title of a cancelled event),
 * or is `{}`.
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

/** A request that breaks the contract. `details` names each problem once endpoints check bodies. */
export const validationFailedSchema = errorBodySchema('VALIDATION_FAILED', {}).meta({
  id: 'ValidationFailed',
  description: 'The request breaks the contract (e.g. a path with broken percent-encoding).',
});

export type ValidationFailedBody = z.infer<typeof validationFailedSchema>;

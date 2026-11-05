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

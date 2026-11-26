/**
 * Whether the database refused a row because one with its key is stored already (PostgreSQL's
 * `unique_violation`), said by the error itself or by any of its causes: the query builder and
 * the libraries over it wrap the driver's error.
 */
export const refusedAsStored = (error: unknown): boolean =>
  error instanceof Error &&
  (('code' in error && error.code === '23505') || refusedAsStored(error.cause));

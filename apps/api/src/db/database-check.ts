import type { DatabaseCheck } from '../modules/health/health.js';

/** The part of a PostgreSQL pool or client the check needs. */
export interface Queryable {
  query(sql: string): Promise<unknown>;
}

/** Probes the database with `SELECT 1`; a failure or a slow answer counts as down. */
export function createDatabaseCheck(database: Queryable, timeoutMs = 2000): DatabaseCheck {
  return async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    const probe = database.query('SELECT 1').then(
      () => true,
      () => false,
    );

    try {
      return await Promise.race([probe, timeout]);
    } finally {
      clearTimeout(timer);
    }
  };
}

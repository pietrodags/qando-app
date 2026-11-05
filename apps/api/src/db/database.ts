import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import * as schema from './schema.js';

/** The database with its tables and relations, as the repositories query it. */
export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(pool: pg.Pool): Database {
  return drizzle({ client: pool, schema });
}

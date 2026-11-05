import pg from 'pg';
import { createApp } from './app.js';
import { createDatabase } from './db/database.js';
import { createDatabaseCheck } from './db/database-check.js';
import { logToStandardError } from './http/error-boundary.js';
import { createPublicEvents } from './modules/public-events/public-events-repository.js';

const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn('DATABASE_URL is not set: /api/health will report the database as down');
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
pool.on('error', (error) => {
  console.error('Idle database connection failed', error);
});

const checkDatabase = databaseUrl ? createDatabaseCheck(pool) : () => Promise.resolve(false);

const db = createDatabase(pool);

const server = createApp({
  checkDatabase,
  publicEvents: createPublicEvents(db),
  now: () => new Date(),
  logError: logToStandardError,
}).listen(port, () => {
  console.log(`API listening on port ${port}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    void pool.end();
  });
});

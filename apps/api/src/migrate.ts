import pg from 'pg';
import { runMigrations } from './db/migrate.js';

// Runs before every deploy (Render's pre-deploy command) and with `npm run db:migrate`.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set: nothing to migrate');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
try {
  await runMigrations(pool);
  console.log('Database migrations are up to date');
} finally {
  await pool.end();
}

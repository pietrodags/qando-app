import express from 'express';
import pg from 'pg';
import { createApp } from './app.js';
import { createDatabase } from './db/database.js';
import { createDatabaseCheck } from './db/database-check.js';
import { logToStandardError } from './http/error-boundary.js';
import { testClock } from './http/test-clock.js';
import { authRoutesOf, createAuth, sessionsOf } from './modules/auth/auth.js';
import { createManagedEvents } from './modules/management/managed-events-repository.js';
import { createParticipations } from './modules/participations/participations-repository.js';
import { createPublicEvents } from './modules/public-events/public-events-repository.js';
import { createEventResults } from './modules/results/results-repository.js';

const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;
// Signs the session cookies; the public address of the pages, which sessions are trusted from.
const authSecret = process.env.BETTER_AUTH_SECRET;
const publicUrl = process.env.BETTER_AUTH_URL;

if (!authSecret || !publicUrl) {
  console.error('BETTER_AUTH_SECRET and BETTER_AUTH_URL must be set: no session could be read');
  process.exit(1);
}

if (!databaseUrl) {
  console.warn('DATABASE_URL is not set: /api/health will report the database as down');
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
pool.on('error', (error) => {
  console.error('Idle database connection failed', error);
});

const checkDatabase = databaseUrl ? createDatabaseCheck(pool) : () => Promise.resolve(false);

const db = createDatabase(pool);

const auth = createAuth({
  db,
  secret: authSecret,
  baseURL: publicUrl,
  // No route sends a sign-in code yet.
  sendSignInCode: () => Promise.reject(new Error('Sign-in codes are not sent yet')),
});

// Only the acceptance tests start the API with the test clock: each request may then name the
// time it reads. A deployed API never sets it, so its clock is always the real one.
const clock = process.env.QANDO_TEST_CLOCK === 'on' ? testClock(() => new Date()) : undefined;

const app = createApp({
  checkDatabase,
  publicEvents: createPublicEvents(db),
  participations: createParticipations(db),
  results: createEventResults(db),
  managedEvents: createManagedEvents(db),
  sessions: sessionsOf(auth),
  authRoutes: authRoutesOf(auth),
  now: clock?.now ?? (() => new Date()),
  logError: logToStandardError,
});

const server = (clock ? express().use(clock.readRequestClock, app) : app).listen(port, () => {
  console.log(`API listening on port ${port}${clock ? ' with the test clock' : ''}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    void pool.end();
  });
});

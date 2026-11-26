import express from 'express';
import pg from 'pg';
import { createApp } from './app.js';
import { createDatabase } from './db/database.js';
import { createDatabaseCheck } from './db/database-check.js';
import { describeError, logToStandardError } from './http/error-boundary.js';
import { smtpEmail, type SendEmail } from './email/email.js';
import { composeEventEmail } from './email/event-emails.js';
import { emailOutbox, type OutboxLogEntry } from './email/outbox.js';
import { runEvery } from './email/run-every.js';
import { testClock } from './http/test-clock.js';
import {
  authorizationServerOf,
  connectionRequestsOf,
  connectorAccessOf,
  createAuth,
  emailCodesOf,
  sessionsOf,
  type AuthLogEntry,
} from './modules/auth/auth.js';
import { exampleApplications } from './modules/auth/example-applications.js';
import { createNewEvents } from './modules/events/new-events-repository.js';
import { createManagedEvents } from './modules/management/managed-events-repository.js';
import { createParticipations } from './modules/participations/participations-repository.js';
import { createPublicEvents } from './modules/public-events/public-events-repository.js';
import { geminiEditor } from './phrase-editor/gemini-editor.js';
import { phraseEditor, type PhraseEditLogEntry } from './phrase-editor/phrase-editor.js';
import { createEventResults } from './modules/results/results-repository.js';
import { deleteExpired } from './retention/delete-expired.js';

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

// The SMTP server sign-in codes and the events' emails are sent through: Scaleway in production, a local sink in
// development (`SMTP_SECURE=false`, no user). The password is never logged.
const smtpHost = process.env.SMTP_HOST;
const sendEmail: SendEmail = smtpHost
  ? smtpEmail({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE !== 'false',
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from: process.env.MAIL_FROM ?? 'qando <no-reply@qando.app>',
    })
  : () => Promise.reject(new Error('SMTP_HOST is not set'));

if (!smtpHost) {
  console.warn('SMTP_HOST is not set: no sign-in code or event email can be delivered');
}

const log = (entry: AuthLogEntry | PhraseEditLogEntry | OutboxLogEntry) => {
  console.error(JSON.stringify(entry));
};

// The model that copy-edits date phrases before they are read: Google's Gemini API, with a key
// of the paid tier. Without a key every phrase is read as written.
const geminiKey = process.env.GEMINI_API_KEY;

if (!geminiKey) {
  console.warn('GEMINI_API_KEY is not set: date phrases are read as written, never copy-edited');
}

// Only the acceptance tests start the API with the example applications: the documents of
// applications under `.example`, answered here, and no other. A deployed API never sets it, so
// it reads each application's document at its own address.
const auth = createAuth({
  db,
  secret: authSecret,
  baseURL: publicUrl,
  log,
  ...(process.env.QANDO_TEST_APPLICATIONS === 'on' && {
    fetchApplicationDocument: exampleApplications,
  }),
});
// What tokens are issued for is stored before any request is served, or the API does not start.
await auth.started();

// Only the acceptance tests start the API with the test clock: each request may then name the
// time it reads. A deployed API never sets it, so its clock is always the real one.
const clock = process.env.QANDO_TEST_CLOCK === 'on' ? testClock(() => new Date()) : undefined;
const now = clock?.now ?? (() => new Date());

// The events' emails, queued in the database and sent from it by this process (no worker of its
// own), linking the pages under the public address.
const outbox = emailOutbox({ db, sendEmail, compose: composeEventEmail(publicUrl), now, log });

const codes = emailCodesOf(auth, { sendEmail, log });

const app = createApp({
  checkDatabase,
  publicEvents: createPublicEvents(db),
  participations: createParticipations(db),
  results: createEventResults(db),
  managedEvents: createManagedEvents(db),
  newEvents: createNewEvents(db, now),
  sessions: sessionsOf(auth),
  signInCodes: codes.signInCodes,
  accountDeletion: codes.accountDeletion,
  authorizationServer: authorizationServerOf(auth),
  connectionRequests: connectionRequestsOf(auth, db),
  connectorAccess: connectorAccessOf(auth, db),
  editPhrase: phraseEditor(geminiKey ? geminiEditor({ apiKey: geminiKey }) : undefined, log),
  now,
  publicUrl,
  logError: logToStandardError,
});

// On the test clock the outbox never sends on its own: every scenario's deadline is past by the
// real time, so it would send each email at once. A scenario sends what is due at its own time,
// to its own addresses (`{ "to": [...] }`), through this route instead: the scenarios share the
// database, and one at a later time would otherwise send another's emails before it is ready.
const sendDueRoute = express
  .Router()
  .post('/api/test/send-due-emails', express.json(), async (request, response) => {
    const { to } = (request.body ?? {}) as { to?: unknown };
    if (!Array.isArray(to) || !to.every((address) => typeof address === 'string')) {
      response.sendStatus(400);
      return;
    }
    await outbox.sendDue(undefined, to);
    response.sendStatus(204);
  });

const server = (clock ? express().use(clock.readRequestClock, sendDueRoute, app) : app).listen(
  port,
  () => {
    console.log(`API listening on port ${port}${clock ? ' with the test clock' : ''}`);
  },
);

// The emails due, sent again 30 seconds after each run has ended: a queued email waits about
// that long.
const sending = clock
  ? undefined
  : runEvery(
      30_000,
      (stopping) => outbox.sendDue(stopping),
      (error) => {
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'Emails not sent: the database could not be reached',
            ...describeError(error),
          }),
        );
      },
    );

// What qando no longer keeps, deleted once an hour, each run logged with what it deleted. Never
// on the test clock: the acceptance tests' events are dated by the time each scenario names,
// and the real time would delete them.
const deleting = clock
  ? undefined
  : runEvery(
      60 * 60_000,
      async () => {
        const deleted = await deleteExpired(db, now());
        console.log(JSON.stringify({ level: 'info', message: 'Expired data deleted', ...deleted }));
      },
      (error) => {
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'Expired data not deleted: the database could not be reached',
            ...describeError(error),
          }),
        );
      },
    );

// The database is closed once no request is left, the email being sent, if any, is sent, and
// the deletion in progress, if any, has ended.
process.on('SIGTERM', () => {
  const served = new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
  void Promise.all([served, sending?.stop(), deleting?.stop()]).then(() => pool.end());
});

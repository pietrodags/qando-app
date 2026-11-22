// The email outbox: the emails of an event to its organizer, queued in the `notifications` table
// in the same transaction as the change that calls for them, and sent from it one at a time, each
// failed attempt followed by a longer wait. The table is the queue: no queue library.
import { and, asc, eq, lte, ne, sql } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { notifications, type notificationType } from '../db/schema.js';
import { describeError } from '../http/error-boundary.js';
import type { EmailContent, SendEmail } from './email.js';

/** The emails an event sends its organizer: the summary, and "voting closed" at each closing. */
export type EventEmailType = (typeof notificationType.enumValues)[number];

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** An event's email, to whom it goes and when it is due. */
export interface ScheduledEmail {
  readonly eventId: string;
  readonly type: EventEmailType;
  readonly recipient: string;
  readonly at: Date;
}

/**
 * Queues an event's email in the caller's transaction, so it is undone with the change. There is
 * one per event and type, never a second: one already queued becomes due again as a new one
 * (pending, not tried yet), also when it failed. "Voting closed" does so also once sent, as it is
 * sent once per closing; a sent summary stays sent, as it is sent once per event.
 */
export async function scheduleEmail(
  queries: Database | Transaction,
  { eventId, type, recipient, at }: ScheduledEmail,
): Promise<void> {
  const due = {
    recipient,
    scheduledAt: at,
    status: 'pending',
    attempts: 0,
    lastError: null,
    sentAt: null,
  } as const;
  await queries
    .insert(notifications)
    .values({ eventId, type, ...due })
    .onConflictDoUpdate({
      target: [notifications.eventId, notifications.type],
      set: due,
      setWhere: sql`${notifications.type} = 'voting_closed' OR ${notifications.status} <> 'sent'`,
    });
}

/**
 * How long after voting closes its email is due. A vote checks the closing with the event held
 * `FOR SHARE` and the outbox reads the votes without waiting for it, so one accepted just before
 * the closing is stored by then and counted. (The outbox cannot lock the event instead: it holds
 * the email's row, and a confirmation holds the event while it drops that row, a deadlock.)
 */
const votingClosedDelayMs = 60_000;

/**
 * Queues the event's "voting closed" email, due a minute after voting closes at `closesAt`, in
 * the caller's transaction. As with `scheduleEmail`, one already queued is due again at the new
 * closing, also once sent.
 */
export function scheduleVotingClosed(
  queries: Database | Transaction,
  {
    eventId,
    recipient,
    closesAt,
  }: { readonly eventId: string; readonly recipient: string; readonly closesAt: Date },
): Promise<void> {
  const at = new Date(closesAt.getTime() + votingClosedDelayMs);
  return scheduleEmail(queries, { eventId, type: 'voting_closed', recipient, at });
}

/**
 * Drops the event's "voting closed" email unless it was sent, in the caller's transaction: once a
 * date is confirmed it would ask to choose one, so a pending one is never sent and a failed one
 * never retried. One being sent meanwhile is dropped only if that attempt fails.
 */
export async function dropUnsentVotingClosed(
  queries: Database | Transaction,
  eventId: string,
): Promise<void> {
  await queries
    .delete(notifications)
    .where(
      and(
        eq(notifications.eventId, eventId),
        eq(notifications.type, 'voting_closed'),
        ne(notifications.status, 'sent'),
      ),
    );
}

/**
 * Makes an event's failed email due again at `at`, for one more attempt, when its organizer asks:
 * its attempts keep counting, so with the automatic waits spent a new failure records it failed
 * at once, and the organizer learns within a minute that it did not go. Answers whether it had
 * failed; one sent, still being tried or never queued is left as it is.
 */
export async function retryFailedEmail(
  queries: Database | Transaction,
  {
    eventId,
    type,
    at,
  }: { readonly eventId: string; readonly type: EventEmailType; readonly at: Date },
): Promise<boolean> {
  const retried = await queries
    .update(notifications)
    .set({ status: 'pending', scheduledAt: at })
    .where(
      and(
        eq(notifications.eventId, eventId),
        eq(notifications.type, type),
        eq(notifications.status, 'failed'),
      ),
    )
    .returning({ id: notifications.id });
  return retried.length > 0;
}

/**
 * Writes an event's email when it is sent, reading what it needs in the sending transaction.
 * Rejecting counts as a failed attempt, as a refusal of the email server does.
 */
export type ComposeEmail = (
  email: { readonly eventId: string; readonly type: EventEmailType },
  tx: Transaction,
) => Promise<EmailContent>;

/** A failed attempt: what failed is named by its kind and code, never by its message. */
export type OutboxLogEntry = {
  readonly level: 'warn' | 'error';
  readonly message: 'Email not sent, to be tried again' | 'Email not sent, given up';
  readonly eventId: string;
  readonly type: EventEmailType;
  /** Attempts made so far, this one included. */
  readonly attempts: number;
} & ReturnType<typeof describeError>;

export interface OutboxSettings {
  readonly db: Database;
  readonly sendEmail: SendEmail;
  readonly compose: ComposeEmail;
  /** The clock emails are due by. */
  readonly now: () => Date;
  readonly log: (entry: OutboxLogEntry) => void;
}

export interface EmailOutbox {
  /**
   * Sends every email due now, the one due longest first, until none is left: a sent email is
   * recorded sent and never sent again; a failed one is tried again after the next wait, or
   * recorded failed after the last. Once `stopping` is aborted, ends after the email in progress,
   * leaving the rest due. Rejects only when the database cannot be reached.
   */
  sendDue(stopping?: AbortSignal): Promise<void>;
}

/** The wait after each failed attempt; when none is left, the email has failed. */
const waitsMs = [1, 5, 15, 60].map((minutes) => minutes * 60_000);

/**
 * The emails queued in the database, sent through `sendEmail`. Each one is taken with a lock kept
 * while it is written and sent: another outbox skips it, and if the API stops in between the lock
 * goes and it is sent again at the next start (at least once).
 */
export function emailOutbox({ db, sendEmail, compose, now, log }: OutboxSettings): EmailOutbox {
  /** Sends the email due longest, if there is one; answers whether there was. */
  const sendNext = () =>
    db.transaction(async (tx) => {
      const [due] = await tx
        .select({
          id: notifications.id,
          eventId: notifications.eventId,
          type: notifications.type,
          recipient: notifications.recipient,
          attempts: notifications.attempts,
        })
        .from(notifications)
        .where(and(eq(notifications.status, 'pending'), lte(notifications.scheduledAt, now())))
        .orderBy(asc(notifications.scheduledAt))
        .limit(1)
        .for('update', { skipLocked: true });
      if (!due) return false;

      const { eventId, type } = due;
      const attempts = due.attempts + 1;
      const record = (values: Partial<typeof notifications.$inferInsert>) =>
        tx.update(notifications).set(values).where(eq(notifications.id, due.id));

      let stage: 'compose' | 'send' = 'compose';
      try {
        // In a savepoint: a template whose query fails leaves the transaction usable.
        const content = await tx.transaction((template) => compose({ eventId, type }, template));
        stage = 'send';
        await sendEmail({ to: due.recipient, ...content });
      } catch (error) {
        const failure = failureOf(error);
        const wait = waitsMs[attempts - 1];
        const lastError = `${stage}: ${failure.code ?? failure.error}`;
        await record(
          wait === undefined
            ? { status: 'failed', attempts, lastError }
            : { attempts, lastError, scheduledAt: new Date(now().getTime() + wait) },
        );
        log({
          level: wait === undefined ? 'error' : 'warn',
          message:
            wait === undefined ? 'Email not sent, given up' : 'Email not sent, to be tried again',
          eventId,
          type,
          attempts,
          ...failure,
        });
        return true;
      }
      await record({ status: 'sent', attempts, lastError: null, sentAt: now() });
      return true;
    });

  return {
    sendDue: async (stopping) => {
      while (stopping?.aborted !== true && (await sendNext()));
    },
  };
}

/** A code that names a failure without quoting anything: Nodemailer's `EENVELOPE`, a SQLSTATE. */
const plainCode = /^[A-Z0-9_]{1,32}$/;

/**
 * What of a failure may be stored and logged: `describeError`'s, with the error's own code and
 * the email server's reply code (e.g. `EENVELOPE 550`) when it has them.
 */
function failureOf(error: unknown): ReturnType<typeof describeError> {
  const described = describeError(error);
  const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  const own = typeof code === 'string' && plainCode.test(code) ? code : described.code;
  const reply = Number.isInteger(responseCode) ? String(responseCode) : undefined;
  const named = [own, reply].filter((part) => part !== undefined).join(' ');
  return { ...described, ...(named !== '' && { code: named }) };
}

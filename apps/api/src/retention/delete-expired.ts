// What qando keeps for how long, the periods the privacy page states: everything here is
// deleted 6 months after it is no longer of use, by the API itself, once an hour (`main.ts`).
import { and, inArray, lt, sql } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { cancelledEvents, confirmations, events, options } from '../db/schema.js';
import { deleteUnusedAccounts } from '../modules/auth/unused-accounts.js';

/** How many of each were deleted. */
export interface DeletedCounts {
  readonly events: number;
  readonly cancelledEvents: number;
  readonly accounts: number;
}

/** 6 months before the instant, by the calendar in UTC, whatever the database's time zone. */
const sixMonthsBefore = (now: Date) =>
  sql`(${now}::timestamptz at time zone 'UTC' - interval '6 months') at time zone 'UTC'`;

/**
 * Deletes, in one transaction, by the clock given:
 * - the events whose date passed 6 months ago: the last day of the confirmed option, or the
 *   deadline when none was confirmed, counted in the event's time zone (confirmed for 18 July
 *   2026, deleted on 19 January 2027), with everything under them (options, participations,
 *   votes, confirmation, emails, queued or sent);
 * - what is left of the events cancelled 6 months ago;
 * - then the accounts that own no event and nobody used for 6 months, so an account goes in the
 *   same run as its last event, and the sign-in codes and sessions expired.
 *
 * Deleting again deletes nothing more, so two runs at once or a run cut off are harmless.
 */
export function deleteExpired(db: Database, now: Date): Promise<DeletedCounts> {
  return db.transaction(async (tx) => {
    const lastDay = sql`coalesce(
      (select coalesce(${options.endDate}, ${options.startDate})
         from ${confirmations}
         join ${options} on ${options.id} = ${confirmations.optionId}
        where ${confirmations.eventId} = ${events.id}),
      ${events.deadline})`;
    const today = sql`(${now}::timestamptz at time zone ${events.timeZone})::date`;
    const expired = sql`(${lastDay} + interval '6 months')::date < ${today}`;
    // Every change to an event (a confirmation, a new deadline) holds its row while it is made.
    // The expired events are held first, skipping any being changed (left for the next run);
    // then they are checked again by a new statement, which sees what a change committed before
    // they were held: a statement that waited for a row would read the confirmations as they
    // were before it waited.
    const held = await tx
      .select({ id: events.id })
      .from(events)
      .where(expired)
      .for('update', { skipLocked: true });
    const deletedEvents = await tx
      .delete(events)
      .where(
        and(
          inArray(
            events.id,
            held.map(({ id }) => id),
          ),
          expired,
        ),
      )
      .returning({ id: events.id });
    const deletedCancelled = await tx
      .delete(cancelledEvents)
      .where(lt(cancelledEvents.cancelledAt, sixMonthsBefore(now)))
      .returning({ publicId: cancelledEvents.publicId });
    const accounts = await deleteUnusedAccounts(tx, now);
    return {
      events: deletedEvents.length,
      cancelledEvents: deletedCancelled.length,
      accounts,
    };
  });
}

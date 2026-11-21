import { asc, eq } from 'drizzle-orm';
import { optionFromRow } from '../db/option-row.js';
import { events, options } from '../db/schema.js';
import type { ComposeEmail } from './outbox.js';
import { summaryEmail } from './summary-email.js';

/**
 * Writes an event's email from the event as it is when the email is sent, read in the sending
 * transaction: an event changed after its email was queued is written as it now is. The pages are
 * linked under `siteUrl`, qando's public address. "Voting closed" has no template yet: composing
 * it rejects, as a failed attempt.
 */
export function composeEventEmail(siteUrl: string): ComposeEmail {
  return async ({ eventId, type }, tx) => {
    if (type !== 'summary') throw new Error(`The ${type} email has no template yet`);
    const [event] = await tx
      .select({
        organizerName: events.organizerName,
        title: events.title,
        note: events.note,
        timeZone: events.timeZone,
        deadline: events.deadline,
        participationId: events.publicId,
      })
      .from(events)
      .where(eq(events.id, eventId));
    if (!event) throw new Error('The event of the email is no longer stored');
    const rows = await tx
      .select({
        id: options.id,
        startDate: options.startDate,
        endDate: options.endDate,
        startTime: options.startTime,
        endTime: options.endTime,
      })
      .from(options)
      .where(eq(options.eventId, eventId))
      .orderBy(asc(options.position));
    return summaryEmail({ ...event, options: rows.map(optionFromRow), siteUrl });
  };
}

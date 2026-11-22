import type { VoteState } from '@qando/domain';
import { asc, eq } from 'drizzle-orm';
import { optionFromRow } from '../db/option-row.js';
import { events, options, votes } from '../db/schema.js';
import type { ComposeEmail } from './outbox.js';
import { summaryEmail } from './summary-email.js';
import { votingClosedEmail } from './voting-closed-email.js';

/**
 * Writes an event's email from the event as it is when the email is sent, read in the sending
 * transaction: an event changed after its email was queued is written as it now is, and "voting
 * closed" counts every vote stored by then. The pages are linked under `siteUrl`, qando's public
 * address.
 */
export function composeEventEmail(siteUrl: string): ComposeEmail {
  return async ({ eventId, type }, tx) => {
    const [event] = await tx
      .select({
        organizerName: events.organizerName,
        title: events.title,
        note: events.note,
        timeZone: events.timeZone,
        deadline: events.deadline,
        participationId: events.publicId,
        resultsId: events.resultsId,
      })
      .from(events)
      .where(eq(events.id, eventId));
    if (!event) throw new Error('The event of the email is no longer stored');
    const offered = (
      await tx
        .select({
          id: options.id,
          startDate: options.startDate,
          endDate: options.endDate,
          startTime: options.startTime,
          endTime: options.endTime,
        })
        .from(options)
        .where(eq(options.eventId, eventId))
        .orderBy(asc(options.position))
    ).map(optionFromRow);
    if (type === 'summary') return summaryEmail({ ...event, options: offered, siteUrl });

    const answers = await tx
      .select({
        participationId: votes.participationId,
        optionId: votes.optionId,
        state: votes.state,
      })
      .from(votes)
      .where(eq(votes.eventId, eventId));
    const byVoter = new Map<string, Record<string, VoteState>>();
    for (const { participationId, optionId, state } of answers) {
      byVoter.set(participationId, { ...byVoter.get(participationId), [optionId]: state });
    }
    return votingClosedEmail({ ...event, options: offered, votes: [...byVoter.values()], siteUrl });
  };
}

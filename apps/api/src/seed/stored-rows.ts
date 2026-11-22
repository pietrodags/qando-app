import { eq } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { confirmations, notifications, options, participations, votes } from '../db/schema.js';

/** How many rows of each kind the database holds for an event. */
export interface StoredRows {
  readonly options: number;
  readonly participations: number;
  readonly votes: number;
  readonly confirmations: number;
  readonly emails: number;
}

/**
 * The rows an event's ID still has in each table that hangs from it: lets the acceptance tests
 * check that cancelling leaves nothing of the event but its title behind its links.
 */
export async function storedRows(db: Database, eventId: string): Promise<StoredRows> {
  const [optionRows, participationRows, voteRows, confirmationRows, emailRows] = await Promise.all([
    db.$count(options, eq(options.eventId, eventId)),
    db.$count(participations, eq(participations.eventId, eventId)),
    db.$count(votes, eq(votes.eventId, eventId)),
    db.$count(confirmations, eq(confirmations.eventId, eventId)),
    db.$count(notifications, eq(notifications.eventId, eventId)),
  ]);
  return {
    options: optionRows,
    participations: participationRows,
    votes: voteRows,
    confirmations: confirmationRows,
    emails: emailRows,
  };
}

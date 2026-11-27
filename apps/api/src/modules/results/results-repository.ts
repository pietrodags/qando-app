import { asc, eq, type SQL } from 'drizzle-orm';
import type { VoteState } from '@qando/domain';
import type { Database } from '../../db/database.js';
import { optionFromRow } from '../../db/option-row.js';
import { cancelledEvents, events, options, participations } from '../../db/schema.js';
import type { ActingOrganizer } from '../management/managed-events.js';
import type { EventResults, ResultsLookup, StoredOrganizerEvent } from './read-results.js';

/**
 * The stored events behind `EventResults`: one read of the event with its options, confirmation
 * and votes. Only a link that is no results link costs the reads that tell why.
 */
export function createEventResults(db: Database): EventResults {
  return {
    async find(resultsId: string): Promise<ResultsLookup> {
      const event = await storedEvent(db, eq(events.resultsId, resultsId));
      if (event) return { status: 'found', event };

      const [cancelled] = await db
        .select({ title: cancelledEvents.title })
        .from(cancelledEvents)
        .where(eq(cancelledEvents.resultsId, resultsId));
      if (cancelled) return { status: 'cancelled', title: cancelled.title };

      return (await isParticipationLink(db, resultsId))
        ? { status: 'participation-link' }
        : { status: 'missing' };
    },
    ofOrganizer: ({ eventId }: ActingOrganizer) => storedEvent(db, eq(events.id, eventId)),
  };
}

/** The event the condition picks, as its organizer reads it; undefined if there is none. */
async function storedEvent(db: Database, where: SQL): Promise<StoredOrganizerEvent | undefined> {
  const event = await db.query.events.findFirst({
    where,
    columns: {
      title: true,
      organizerName: true,
      note: true,
      deadline: true,
      timeZone: true,
      anonymous: true,
      state: true,
      closesAt: true,
    },
    with: {
      options: { orderBy: asc(options.position) },
      confirmation: { columns: {}, with: { option: true } },
      participations: {
        // In the order they were cast; the ID orders votes cast in the same instant.
        orderBy: [asc(participations.createdAt), asc(participations.id)],
        columns: { name: true },
        with: { votes: { columns: { optionId: true, state: true } } },
      },
    },
  });
  if (!event) return undefined;
  const { options: offered, confirmation, participations: cast, ...shown } = event;
  return {
    ...shown,
    options: offered.map(optionFromRow),
    confirmedOption: confirmation ? optionFromRow(confirmation.option) : null,
    votes: cast.map(({ name, votes }) => ({
      name,
      votes: Object.fromEntries(
        votes.map(({ optionId, state }): [string, VoteState] => [optionId, state]),
      ),
    })),
  };
}

/** Whether the ID is the participation link of an event, cancelled or not. */
async function isParticipationLink(db: Database, id: string): Promise<boolean> {
  const [event] = await db.select({ id: events.id }).from(events).where(eq(events.publicId, id));
  if (event) return true;
  const [cancelled] = await db
    .select({ publicId: cancelledEvents.publicId })
    .from(cancelledEvents)
    .where(eq(cancelledEvents.publicId, id));
  return cancelled !== undefined;
}

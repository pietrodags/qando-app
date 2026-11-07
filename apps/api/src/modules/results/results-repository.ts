import { asc, eq } from 'drizzle-orm';
import type { VoteState } from '@qando/domain';
import type { Database } from '../../db/database.js';
import { optionFromRow } from '../../db/option-row.js';
import { cancelledEvents, events, options } from '../../db/schema.js';
import type { EventResults, ResultsLookup } from './results.js';

/**
 * The stored events behind `EventResults`: one read of the event with its options, confirmation
 * and votes. Only a link that is no results link costs the reads that tell why.
 */
export function createEventResults(db: Database): EventResults {
  return {
    async find(resultsId: string): Promise<ResultsLookup> {
      const event = await db.query.events.findFirst({
        where: eq(events.resultsId, resultsId),
        columns: { title: true, timeZone: true, anonymous: true, state: true, closesAt: true },
        with: {
          options: { orderBy: asc(options.position) },
          confirmation: { columns: {}, with: { option: true } },
          participations: {
            columns: { name: true },
            with: { votes: { columns: { optionId: true, state: true } } },
          },
        },
      });
      if (event) {
        const { options: offered, confirmation, participations, ...shown } = event;
        return {
          status: 'found',
          event: {
            ...shown,
            options: offered.map(optionFromRow),
            confirmedOption: confirmation ? optionFromRow(confirmation.option) : null,
            votes: participations.map(({ name, votes }) => ({
              name,
              votes: Object.fromEntries(
                votes.map(({ optionId, state }): [string, VoteState] => [optionId, state]),
              ),
            })),
          },
        };
      }

      const [cancelled] = await db
        .select({ title: cancelledEvents.title })
        .from(cancelledEvents)
        .where(eq(cancelledEvents.resultsId, resultsId));
      if (cancelled) return { status: 'cancelled', title: cancelled.title };

      return (await isParticipationLink(db, resultsId))
        ? { status: 'participation-link' }
        : { status: 'missing' };
    },
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

import { asc, eq } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { events, options, participations, votes } from '../db/schema.js';
import type { VoteSeed } from './seed-event.js';

/**
 * The votes stored for the event of a participation link, in the shape they are seeded: each
 * one's name (none on anonymous events) and its states in the order of the event's options,
 * oldest vote first. Lets the acceptance tests check what a vote stored.
 */
export async function storedVotes(db: Database, publicId: string): Promise<VoteSeed[]> {
  const rows = await db
    .select({
      participationId: participations.id,
      name: participations.name,
      state: votes.state,
    })
    .from(votes)
    .innerJoin(participations, eq(votes.participationId, participations.id))
    .innerJoin(options, eq(votes.optionId, options.id))
    .innerJoin(events, eq(votes.eventId, events.id))
    .where(eq(events.publicId, publicId))
    .orderBy(asc(participations.createdAt), asc(participations.id), asc(options.position));

  const byParticipation = new Map<
    string,
    { name: string | null; states: VoteSeed['states'][number][] }
  >();
  for (const { participationId, name, state } of rows) {
    const vote = byParticipation.get(participationId) ?? { name, states: [] };
    vote.states.push(state);
    byParticipation.set(participationId, vote);
  }
  return [...byParticipation.values()].map(({ name, states }) =>
    name === null ? { states } : { name, states },
  );
}

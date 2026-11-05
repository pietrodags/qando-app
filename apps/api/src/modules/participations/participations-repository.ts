import type { ValidVote } from '@qando/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import { cancelledEvents, events, options, participations, votes } from '../../db/schema.js';
import type {
  Ballot,
  Participations,
  StoredParticipation,
  VotingEventLookup,
} from './participations.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** The stored participations behind `Participations`, each vote in one transaction. */
export function createParticipations(db: Database): Participations {
  return {
    transaction: (work) => db.transaction((tx) => work(ballotIn(tx))),
  };
}

function ballotIn(tx: Transaction): Ballot {
  const participationWith = async (tokenHash: string) => {
    const stored = await tx.query.participations.findFirst({
      where: eq(participations.editTokenHash, tokenHash),
      columns: { id: true, eventId: true, name: true },
      with: { votes: { columns: { optionId: true, state: true } } },
    });
    if (!stored) return undefined;
    const { id, eventId, name, votes: states } = stored;
    const answered = Object.fromEntries(states.map(({ optionId, state }) => [optionId, state]));
    return { id, eventId, vote: { name, votes: answered } };
  };

  const storeStates = async (eventId: string, participationId: string, vote: ValidVote) => {
    const states = Object.entries(vote.votes).map(([optionId, state]) => ({
      participationId,
      optionId,
      eventId,
      state,
    }));
    if (states.length > 0) await tx.insert(votes).values(states);
  };

  return {
    async event(publicId): Promise<VotingEventLookup> {
      // FOR SHARE: votes do not wait for each other, but closing, confirming or replacing the
      // options (which update the event row) wait until this vote is stored, and the reverse.
      const [event] = await tx
        .select({
          id: events.id,
          anonymous: events.anonymous,
          state: events.state,
          closesAt: events.closesAt,
        })
        .from(events)
        .where(eq(events.publicId, publicId))
        .for('share');
      if (event) {
        const offered = await tx
          .select({ id: options.id })
          .from(options)
          .where(eq(options.eventId, event.id))
          .orderBy(asc(options.position));
        return {
          status: 'found',
          event: { ...event, optionIds: offered.map((option) => option.id) },
        };
      }

      const [cancelled] = await tx
        .select({ title: cancelledEvents.title })
        .from(cancelledEvents)
        .where(eq(cancelledEvents.publicId, publicId));
      return cancelled ? { status: 'cancelled', title: cancelled.title } : { status: 'missing' };
    },

    participation: participationWith,

    async add(eventId, tokenHash, vote): Promise<StoredParticipation> {
      // A send with the same token running at the same time makes this insert wait for it, then
      // do nothing; the participation it stored is then visible and answered instead.
      const [added] = await tx
        .insert(participations)
        .values({ eventId, name: vote.name, editTokenHash: tokenHash })
        .onConflictDoNothing({ target: participations.editTokenHash })
        .returning({ id: participations.id, eventId: participations.eventId });
      if (!added) {
        const earlier = await participationWith(tokenHash);
        if (!earlier) throw new Error('The conflicting participation is not visible');
        return earlier;
      }
      await storeStates(eventId, added.id, vote);
      return { ...added, vote };
    },

    async replace(eventId, participationId, vote): Promise<void> {
      // Updating the row first locks it: an edit of the same vote running at the same time waits
      // here until this one is stored, then replaces it in turn (the last one wins).
      const [updated] = await tx
        .update(participations)
        .set({ name: vote.name, updatedAt: sql`now()` })
        .where(and(eq(participations.id, participationId), eq(participations.eventId, eventId)))
        .returning({ id: participations.id });
      if (!updated) throw new Error('The participation to replace is not of this event');
      await tx
        .delete(votes)
        .where(and(eq(votes.participationId, participationId), eq(votes.eventId, eventId)));
      await storeStates(eventId, participationId, vote);
    },
  };
}

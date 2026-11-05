import { asc, eq } from 'drizzle-orm';
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
    const [stored] = await tx
      .select({ id: participations.id, eventId: participations.eventId })
      .from(participations)
      .where(eq(participations.editTokenHash, tokenHash));
    return stored;
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

      const states = Object.entries(vote.votes).map(([optionId, state]) => ({
        participationId: added.id,
        optionId,
        eventId,
        state,
      }));
      if (states.length > 0) await tx.insert(votes).values(states);
      return added;
    },
  };
}

import { and, asc, eq } from 'drizzle-orm';
import type { VoteState } from '@qando/domain';
import type { Database } from '../../db/database.js';
import { optionFromRow } from '../../db/option-row.js';
import { cancelledEvents, confirmations, events, options } from '../../db/schema.js';
import type { EventChange, ManagedEvents } from './managed-events.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * The stored events behind `ManagedEvents`. The token is matched by its hash in the query, so a
 * wrong token and an unknown link read the same; only a refusal costs the read that tells a
 * cancelled event apart.
 */
export function createManagedEvents(db: Database): ManagedEvents {
  return {
    async access(participationId, tokenHash) {
      const [event] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(eq(events.publicId, participationId), eq(events.managementTokenHash, tokenHash)),
        );
      if (event) return { status: 'managed', eventId: event.id };

      const [cancelled] = await db
        .select({ title: cancelledEvents.title })
        .from(cancelledEvents)
        .where(eq(cancelledEvents.publicId, participationId));
      return cancelled
        ? { status: 'cancelled', title: cancelled.title }
        : { status: 'not-managed' };
    },

    async event({ eventId }) {
      const event = await db.query.events.findFirst({
        where: eq(events.id, eventId),
        columns: {
          title: true,
          timeZone: true,
          deadline: true,
          state: true,
          closesAt: true,
          publicId: true,
          resultsId: true,
        },
        with: {
          options: { orderBy: asc(options.position) },
          confirmation: { columns: {}, with: { option: true } },
          participations: {
            columns: {},
            with: { votes: { columns: { optionId: true, state: true } } },
          },
        },
      });
      if (!event) return undefined;
      const { options: offered, confirmation, participations: cast, publicId, ...shown } = event;
      return {
        ...shown,
        participationId: publicId,
        options: offered.map(optionFromRow),
        confirmedOption: confirmation ? optionFromRow(confirmation.option) : null,
        votes: cast.map(({ votes }) =>
          Object.fromEntries(
            votes.map(({ optionId, state }): [string, VoteState] => [optionId, state]),
          ),
        ),
      };
    },

    change: (work) => db.transaction((tx) => work(changeIn(tx))),
  };
}

function changeIn(tx: Transaction): EventChange {
  return {
    async lock({ eventId }) {
      // FOR UPDATE: waits for the votes being stored (they hold the row FOR SHARE), and makes
      // votes and other changes sent meanwhile wait until this transaction ends.
      const [event] = await tx
        .select({ id: events.id })
        .from(events)
        .where(eq(events.id, eventId))
        .for('update');
      if (!event) return undefined;
      const offered = await tx
        .select({ id: options.id })
        .from(options)
        .where(eq(options.eventId, eventId))
        .orderBy(asc(options.position));
      const [confirmed] = await tx
        .select({ optionId: confirmations.optionId })
        .from(confirmations)
        .where(eq(confirmations.eventId, eventId));
      return {
        optionIds: offered.map(({ id }) => id),
        confirmedOptionId: confirmed?.optionId ?? null,
      };
    },

    async confirm({ eventId }, optionId) {
      // The keys refuse a second confirmation and an option of another event, should a caller
      // skip the checks.
      await tx.insert(confirmations).values({ eventId, optionId });
      await tx.update(events).set({ state: 'confirmed' }).where(eq(events.id, eventId));
    },
  };
}

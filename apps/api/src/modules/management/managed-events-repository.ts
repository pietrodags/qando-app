import type { EmailType } from '@qando/contracts';
import { and, asc, desc, eq, or } from 'drizzle-orm';
import type { VoteState } from '@qando/domain';
import type { Database } from '../../db/database.js';
import { optionColumns, optionFromRow } from '../../db/option-row.js';
import {
  cancelledEvents,
  confirmations,
  events,
  notifications,
  options,
  participations,
} from '../../db/schema.js';
import {
  dropUnsentVotingClosed,
  retryFailedEmail,
  scheduleVotingClosed,
  type EventEmailType,
} from '../../email/outbox.js';
import type { EventChange, ManagedEvents, StoredEmail } from './managed-events.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Each email's type as the contract names it, by the name it is stored with, and back. */
const shownType = {
  summary: 'summary',
  voting_closed: 'voting-closed',
} as const satisfies Record<EventEmailType, EmailType>;
const storedType = {
  summary: 'summary',
  'voting-closed': 'voting_closed',
} as const satisfies Record<EmailType, EventEmailType>;

/** A stored email as the management page reads it: only a sent one says when. */
function storedEmailOf(row: {
  type: EventEmailType;
  status: 'pending' | 'sent' | 'failed';
  sentAt: Date | null;
}): StoredEmail {
  const type = shownType[row.type];
  const { status, sentAt } = row;
  if (status !== 'sent') return { type, status };
  // The table's check keeps `sent_at` set on every sent email, and only on those.
  if (sentAt === null) throw new Error('A sent email is stored without when it was sent');
  return { type, status, sentAt };
}

/**
 * The stored events behind `ManagedEvents`. The token is matched by its hash in the query, and
 * the session by the event's owner, so a wrong credential and an unknown link read the same; only a refusal costs the read that tells a
 * cancelled event apart.
 */
export function createManagedEvents(db: Database): ManagedEvents {
  return {
    async access(participationId, { tokenHash, ownerId }) {
      const [event] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.publicId, participationId),
            // The match's type holds at least one of them, so this is never empty.
            or(
              tokenHash === undefined ? undefined : eq(events.managementTokenHash, tokenHash),
              ownerId === undefined ? undefined : eq(events.ownerId, ownerId),
            ),
          ),
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

    ownedBy: (accountId) =>
      db
        .select({
          participationId: events.publicId,
          title: events.title,
          deadline: events.deadline,
          state: events.state,
          closesAt: events.closesAt,
          createdAt: events.createdAt,
        })
        .from(events)
        .where(eq(events.ownerId, accountId))
        // Two events never share an instant in practice; the ID keeps the order fixed if they do.
        .orderBy(desc(events.createdAt), desc(events.id)),

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
      const queued = await db
        .select({
          type: notifications.type,
          status: notifications.status,
          sentAt: notifications.sentAt,
        })
        .from(notifications)
        .where(eq(notifications.eventId, eventId))
        // In the order the type's values are declared: the summary first.
        .orderBy(asc(notifications.type));
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
        emails: queued.map(storedEmailOf),
      };
    },

    retryFailedEmail: ({ eventId }, type, at) =>
      retryFailedEmail(db, { eventId, type: storedType[type], at }),

    cancel: ({ eventId }) =>
      db.transaction(async (tx) => {
        // The delete waits for the votes being stored (they hold the event FOR SHARE) and for an
        // email being sent; everything under the event goes with it, as its keys cascade. A
        // cancellation that waited for another, or for its account's deletion, finds nothing
        // left to delete. The tombstone names its owner without a key to the account, so it never
        // waits for an account being deleted.
        const [deleted] = await tx.delete(events).where(eq(events.id, eventId)).returning({
          publicId: events.publicId,
          resultsId: events.resultsId,
          title: events.title,
          ownerId: events.ownerId,
        });
        if (!deleted) return undefined;
        await tx.insert(cancelledEvents).values(deleted);
        return deleted.title;
      }),

    change: (work) => db.transaction((tx) => work(changeIn(tx))),
  };
}

function changeIn(tx: Transaction): EventChange {
  return {
    async lock({ eventId }) {
      // FOR UPDATE: waits for the votes being stored (they hold the row FOR SHARE), and makes
      // votes and other changes sent meanwhile wait until this transaction ends.
      const [event] = await tx
        .select({ timeZone: events.timeZone, state: events.state, closesAt: events.closesAt })
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
      const [voter] = await tx
        .select({ id: participations.id })
        .from(participations)
        .where(eq(participations.eventId, eventId))
        .limit(1);
      return {
        ...event,
        optionIds: offered.map(({ id }) => id),
        confirmedOptionId: confirmed?.optionId ?? null,
        voted: voter !== undefined,
      };
    },

    async confirm({ eventId }, optionId) {
      // The keys refuse a second confirmation and an option of another event, should a caller
      // skip the checks.
      await tx.insert(confirmations).values({ eventId, optionId });
      await tx.update(events).set({ state: 'confirmed' }).where(eq(events.id, eventId));
      await dropUnsentVotingClosed(tx, eventId);
    },

    async setClosing({ eventId }, { state, deadline, closesAt }) {
      const [event] = await tx
        .update(events)
        .set({ state, deadline, closesAt })
        .where(eq(events.id, eventId))
        .returning({ organizerEmail: events.organizerEmail });
      // Cancelling and the scheduled deletion both wait for the lock this change holds.
      if (!event) throw new Error('The event to change is gone');
      await scheduleVotingClosed(tx, { eventId, recipient: event.organizerEmail, closesAt });
    },

    async replaceOptions({ eventId }, replacing) {
      // The votes of the options deleted would go with them (cascade): the caller checked, with
      // the event locked, that nobody has voted.
      await tx.delete(options).where(eq(options.eventId, eventId));
      await tx
        .insert(options)
        .values(
          replacing.map((option, position) => ({ eventId, position, ...optionColumns(option) })),
        );
    },
  };
}

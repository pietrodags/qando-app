import type { ProposedOption } from '@qando/domain';
import { eq } from 'drizzle-orm';
import type { EventCreated } from '@qando/contracts';
import { hashCapabilityToken, newCapabilityToken } from '../../capability-token.js';
import type { Database } from '../../db/database.js';
import { events, options, users } from '../../db/schema.js';
import type { NewEvents } from './create-event.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * The stored events behind `NewEvents`. The account is locked first, so two events it creates at
 * once wait for each other: the first names it once, and a repeat of the same token finds the
 * event the first stored. The event's email is the account's, as Better Auth stores it. Only the
 * management token's hash is stored, unique: an insert that meets it stores nothing, and the event
 * that holds it is answered (another account's, once the insert has waited for it, is `taken`).
 */
export function createNewEvents(db: Database): NewEvents {
  return {
    create: (ownerId, managementToken, event) =>
      db.transaction(async (tx) => {
        const [account] = await tx
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, ownerId))
          .for('update');
        if (!account) throw new Error('The account of the session no longer exists');

        const tokenHash = hashCapabilityToken(managementToken);
        const links = { participationId: newCapabilityToken(), resultsId: newCapabilityToken() };
        const [stored] = await tx
          .insert(events)
          .values({
            ownerId,
            publicId: links.participationId,
            resultsId: links.resultsId,
            managementTokenHash: tokenHash,
            organizerName: event.organizerName,
            organizerEmail: account.email,
            title: event.title,
            note: event.note,
            timeZone: event.timeZone,
            deadline: event.deadline,
            closesAt: event.closesAt,
            anonymous: event.anonymous,
          })
          .onConflictDoNothing({ target: events.managementTokenHash })
          .returning({ id: events.id });
        if (!stored) return eventHolding(tx, tokenHash, ownerId);

        if (account.name === '') {
          await tx
            .update(users)
            .set({ name: event.organizerName, updatedAt: new Date() })
            .where(eq(users.id, ownerId));
        }
        await tx.insert(options).values(
          event.options.map((option, position) => ({
            eventId: stored.id,
            position,
            ...columnsOf(option),
          })),
        );
        return links;
      }),
  };
}

/** The links of the event that holds the token's hash, if the account owns it; else `taken`. */
async function eventHolding(
  tx: Transaction,
  tokenHash: string,
  ownerId: string,
): Promise<EventCreated | 'taken'> {
  const [holder] = await tx
    .select({
      ownerId: events.ownerId,
      participationId: events.publicId,
      resultsId: events.resultsId,
    })
    .from(events)
    .where(eq(events.managementTokenHash, tokenHash));
  if (!holder) throw new Error('The event that holds the token is not visible');
  const { participationId, resultsId } = holder;
  return holder.ownerId === ownerId ? { participationId, resultsId } : 'taken';
}

/** An option's columns: an end date makes a range; a time without an end is a single time. */
function columnsOf({ dates, time }: ProposedOption) {
  return {
    startDate: dates.kind === 'single' ? dates.date : dates.start,
    endDate: dates.kind === 'range' ? dates.end : null,
    startTime: time === null ? null : time.kind === 'single' ? time.at : time.start,
    endTime: time?.kind === 'range' ? time.end : null,
  };
}

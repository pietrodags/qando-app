import type { ProposedOption } from '@qando/domain';
import { eq } from 'drizzle-orm';
import { hashCapabilityToken, newCapabilityToken } from '../../capability-token.js';
import type { Database } from '../../db/database.js';
import { events, options, users } from '../../db/schema.js';
import type { NewEvents } from './create-event.js';

/**
 * The stored events behind `NewEvents`. The account is locked first, so two first events created
 * at once name it once; the event's email is the account's, as Better Auth stores it. Only the
 * management token's hash is stored: the token itself is answered once.
 */
export function createNewEvents(db: Database): NewEvents {
  return {
    create: (ownerId, event) =>
      db.transaction(async (tx) => {
        const [account] = await tx
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, ownerId))
          .for('update');
        if (!account) throw new Error('The account of the session no longer exists');
        if (account.name === '') {
          await tx
            .update(users)
            .set({ name: event.organizerName, updatedAt: new Date() })
            .where(eq(users.id, ownerId));
        }

        const links = {
          participationId: newCapabilityToken(),
          resultsId: newCapabilityToken(),
          managementToken: newCapabilityToken(),
        };
        const [stored] = await tx
          .insert(events)
          .values({
            ownerId,
            publicId: links.participationId,
            resultsId: links.resultsId,
            managementTokenHash: hashCapabilityToken(links.managementToken),
            organizerName: event.organizerName,
            organizerEmail: account.email,
            title: event.title,
            note: event.note,
            timeZone: event.timeZone,
            deadline: event.deadline,
            closesAt: event.closesAt,
            anonymous: event.anonymous,
          })
          .returning({ id: events.id });
        if (!stored) throw new Error('The insert answered no row');

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

/** An option's columns: an end date makes a range; a time without an end is a single time. */
function columnsOf({ dates, time }: ProposedOption) {
  return {
    startDate: dates.kind === 'single' ? dates.date : dates.start,
    endDate: dates.kind === 'range' ? dates.end : null,
    startTime: time === null ? null : time.kind === 'single' ? time.at : time.start,
    endTime: time?.kind === 'range' ? time.end : null,
  };
}

import { asc, eq } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import { optionFromRow } from '../../db/option-row.js';
import { cancelledEvents, events, options } from '../../db/schema.js';
import type { PublicEventLookup, PublicEvents } from './public-events.js';

/** The stored events behind `PublicEvents`; it reads only the columns participants may see. */
export function createPublicEvents(db: Database): PublicEvents {
  return {
    async find(publicId: string): Promise<PublicEventLookup> {
      const event = await db.query.events.findFirst({
        where: eq(events.publicId, publicId),
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
        },
      });
      if (event) {
        const { options: offered, confirmation, ...shown } = event;
        return {
          status: 'found',
          event: {
            ...shown,
            options: offered.map(optionFromRow),
            confirmedOption: confirmation ? optionFromRow(confirmation.option) : null,
          },
        };
      }

      const [cancelled] = await db
        .select({ title: cancelledEvents.title })
        .from(cancelledEvents)
        .where(eq(cancelledEvents.publicId, publicId));
      return cancelled ? { status: 'cancelled', title: cancelled.title } : { status: 'missing' };
    },
  };
}

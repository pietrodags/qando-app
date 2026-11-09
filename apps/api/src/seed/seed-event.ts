// Stores a whole event in one go, straight in the database: the demo events of `npm run db:seed`
// and the events of the acceptance tests, until organizers create them through the API (HU03).
import { randomUUID } from 'node:crypto';
import { closingInstant, type VoteState } from '@qando/domain';
import { hashCapabilityToken, newCapabilityToken } from '../capability-token.js';
import type { Database } from '../db/database.js';
import {
  cancelledEvents,
  confirmations,
  events,
  options,
  participations,
  users,
  votes,
} from '../db/schema.js';

/** An offered date: a whole day (`2026-07-06`), or a day or a range of days with its times. */
export type OptionSeed =
  | string
  | {
      readonly date: string;
      readonly endDate?: string;
      readonly startTime?: string;
      readonly endTime?: string;
    };

/** One participant's answer: a state per option, in the order of the event's options. */
export interface VoteSeed {
  /** Left out on anonymous events. */
  readonly name?: string;
  readonly states: readonly VoteState[];
}

/** How the event ended up; open (or closed by its deadline) when left out. */
export type Outcome = 'closed early' | { readonly confirmed: number } | 'cancelled';

export interface EventSeed {
  readonly title: string;
  /** In chronological order. */
  readonly options: readonly OptionSeed[];
  /** ISO date; voting closes at its end in `timeZone`. */
  readonly deadline: string;
  /** IANA name; `Europe/Madrid` when left out. */
  readonly timeZone?: string;
  readonly anonymous?: boolean;
  readonly note?: string;
  readonly organizer?: { readonly name: string; readonly email: string };
  readonly votes?: readonly VoteSeed[];
  /** `confirmed` is the position of the confirmed option. */
  readonly outcome?: Outcome;
}

/** The stored event's links and tokens, as the pages are opened with them. */
export interface SeededEvent {
  readonly title: string;
  readonly publicId: string;
  readonly resultsId: string;
  /** The management link's token; only its hash is stored. */
  readonly managementToken: string;
  /** In the order of the seed's options. */
  readonly optionIds: readonly string[];
  /** Each vote's name (none on anonymous events) and edit-vote token, in the seed's order. */
  readonly votes: readonly { readonly name?: string; readonly token: string }[];
  /** Cancelled events keep only their participation and results links. */
  readonly cancelled: boolean;
}

/**
 * Stores the event, its options and votes, and how it ended, in one transaction: a seed that
 * breaks a rule of the database (two preferred options, a degenerate range) stores nothing.
 * A cancelled event is stored as what is left of a cancelled event: its title behind its links.
 */
export async function seedEvent(db: Database, seed: EventSeed): Promise<SeededEvent> {
  const links = {
    title: seed.title,
    publicId: newCapabilityToken(),
    resultsId: newCapabilityToken(),
    managementToken: newCapabilityToken(),
  };
  if (seed.outcome === 'cancelled') {
    await db
      .insert(cancelledEvents)
      .values({ publicId: links.publicId, resultsId: links.resultsId, title: seed.title });
    return { ...links, optionIds: [], votes: [], cancelled: true };
  }

  const timeZone = seed.timeZone ?? 'Europe/Madrid';
  const outcome = seed.outcome;
  const organizer = seed.organizer ?? { name: 'Ana', email: 'ana@example.com' };
  return db.transaction(async (tx) => {
    const ownerId = await ownerOf(tx, organizer);
    const { id: eventId } = onlyRow(
      await tx
        .insert(events)
        .values({
          publicId: links.publicId,
          resultsId: links.resultsId,
          ownerId,
          managementTokenHash: hashCapabilityToken(links.managementToken),
          organizerName: organizer.name,
          organizerEmail: organizer.email,
          title: seed.title,
          note: seed.note ?? null,
          timeZone,
          deadline: seed.deadline,
          closesAt: closingInstant(seed.deadline, timeZone),
          anonymous: seed.anonymous ?? false,
          state:
            outcome === 'closed early' ? 'closed' : outcome === undefined ? 'open' : 'confirmed',
        })
        .returning({ id: events.id }),
    );

    const offered = await tx
      .insert(options)
      .values(seed.options.map((option, position) => ({ eventId, position, ...slot(option) })))
      .returning({ id: options.id, position: options.position });
    const optionIds = offered.toSorted((a, b) => a.position - b.position).map(({ id }) => id);
    const optionAt = (position: number): string => {
      const id = optionIds[position];
      if (id === undefined) throw new Error(`"${seed.title}" has no option ${position}`);
      return id;
    };

    const storedVotes: { name?: string; token: string }[] = [];
    for (const vote of seed.votes ?? []) {
      if (vote.states.length !== optionIds.length) {
        throw new Error(`A vote of "${seed.title}" must answer each of its options once`);
      }
      const token = newCapabilityToken();
      const { id: participationId } = onlyRow(
        await tx
          .insert(participations)
          .values({ eventId, name: vote.name ?? null, editTokenHash: hashCapabilityToken(token) })
          .returning({ id: participations.id }),
      );
      await tx.insert(votes).values(
        vote.states.map((state, position) => ({
          participationId,
          optionId: optionAt(position),
          eventId,
          state,
        })),
      );
      storedVotes.push(vote.name === undefined ? { token } : { name: vote.name, token });
    }

    if (typeof outcome === 'object') {
      await tx.insert(confirmations).values({ eventId, optionId: optionAt(outcome.confirmed) });
    }
    return { ...links, optionIds, votes: storedVotes, cancelled: false };
  });
}

/**
 * The verified account of the organizer's email, created for the first event of that email, as
 * signing in with a code would; the email is compared as Better Auth stores it, lowercase.
 */
async function ownerOf(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  organizer: { readonly name: string; readonly email: string },
): Promise<string> {
  const email = organizer.email.trim().toLowerCase();
  const { id } = onlyRow(
    await tx
      .insert(users)
      .values({ id: randomUUID(), name: organizer.name, email, emailVerified: true })
      .onConflictDoUpdate({ target: users.email, set: { email } })
      .returning({ id: users.id }),
  );
  return id;
}

function onlyRow<Row>(rows: readonly Row[]): Row {
  const [row] = rows;
  if (row === undefined) throw new Error('The insert answered no row');
  return row;
}

function slot(option: OptionSeed) {
  if (typeof option === 'string') return { startDate: option };
  return {
    startDate: option.date,
    endDate: option.endDate ?? null,
    startTime: option.startTime ?? null,
    endTime: option.endTime ?? null,
  };
}

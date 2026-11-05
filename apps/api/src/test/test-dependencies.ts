import { randomUUID } from 'node:crypto';
import type { VoteState } from '@qando/domain';
import type { AppDependencies } from '../app.js';
import type { Ballot, Participations } from '../modules/participations/participations.js';
import type { PublicEventLookup } from '../modules/public-events/public-events.js';

/** A stored vote; `eventId` is the participation ID of its event's link. */
export interface TestParticipation {
  readonly id: string;
  readonly eventId: string;
  readonly name: string | null;
  readonly tokenHash: string;
  readonly votes: Readonly<Record<string, VoteState>>;
}

export interface TestState {
  /** Answer of the database check. */
  databaseUp?: boolean;
  /** Stored events by the participation ID of their link; any other ID is missing. */
  publicEvents?: Readonly<Record<string, PublicEventLookup>>;
  /** Stored votes; the app adds the ones it stores, so a test can read them. */
  participations?: TestParticipation[];
  /** The fixed time the app reads. */
  now?: Date;
}

/** The app's edges (database and clock) replaced by fixed answers, for unit tests. */
export function testDependencies({
  databaseUp = true,
  publicEvents = {},
  participations = [],
  now = new Date('2026-06-15T08:00:00Z'),
}: TestState = {}): AppDependencies {
  const stored = new Map(Object.entries(publicEvents));
  return {
    checkDatabase: () => Promise.resolve(databaseUp),
    publicEvents: {
      find: (publicId) => Promise.resolve(stored.get(publicId) ?? { status: 'missing' }),
    },
    participations: inMemoryParticipations(stored, participations),
    now: () => now,
    // A test that expects a failure passes its own log; any other failure fails the test.
    logError: (entry) => {
      throw new Error(`Unexpected request failure: ${JSON.stringify(entry)}`);
    },
  };
}

/** Participations in a list; an event's ID is the participation ID of its link. */
function inMemoryParticipations(
  events: ReadonlyMap<string, PublicEventLookup>,
  list: TestParticipation[],
): Participations {
  const byHash = (tokenHash: string) => list.find((stored) => stored.tokenHash === tokenHash);
  const ballot: Ballot = {
    event: (publicId) => {
      const lookup = events.get(publicId) ?? { status: 'missing' };
      if (lookup.status !== 'found') return Promise.resolve(lookup);
      const { anonymous, state, closesAt, options } = lookup.event;
      return Promise.resolve({
        status: 'found',
        event: {
          id: publicId,
          anonymous,
          state,
          closesAt,
          optionIds: options.map((option) => option.id),
        },
      });
    },
    participation: (tokenHash) => Promise.resolve(byHash(tokenHash)),
    add: (eventId, tokenHash, vote) => {
      const earlier = byHash(tokenHash);
      if (earlier) return Promise.resolve(earlier);
      const participation = { id: randomUUID(), eventId, tokenHash, ...vote };
      list.push(participation);
      return Promise.resolve(participation);
    },
  };
  return { transaction: (work) => work(ballot) };
}

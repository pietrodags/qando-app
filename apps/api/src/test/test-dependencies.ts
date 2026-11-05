import type { AppDependencies } from '../app.js';
import type { PublicEventLookup } from '../modules/public-events/public-events.js';

export interface TestState {
  /** Answer of the database check. */
  databaseUp?: boolean;
  /** Stored events by the participation ID of their link; any other ID is missing. */
  publicEvents?: Readonly<Record<string, PublicEventLookup>>;
  /** The fixed time the app reads. */
  now?: Date;
}

/** The app's edges (database and clock) replaced by fixed answers, for unit tests. */
export function testDependencies({
  databaseUp = true,
  publicEvents = {},
  now = new Date('2026-06-15T08:00:00Z'),
}: TestState = {}): AppDependencies {
  const stored = new Map(Object.entries(publicEvents));
  return {
    checkDatabase: () => Promise.resolve(databaseUp),
    publicEvents: {
      find: (publicId) => Promise.resolve(stored.get(publicId) ?? { status: 'missing' }),
    },
    now: () => now,
  };
}

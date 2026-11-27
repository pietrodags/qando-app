import { randomUUID } from 'node:crypto';
import type { VoteState } from '@qando/domain';
import type { AppDependencies } from '../app.js';
import type { Sessions } from '../http/session.js';
import type {
  Ballot,
  Participations,
  StoredParticipation,
} from '../modules/participations/participations.js';
import type { ManagedEvents, StoredManagedEvent } from '../modules/management/managed-events.js';
import type { PublicEventLookup } from '../modules/public-events/public-events.js';
import type { ResultsLookup, StoredOrganizerEvent } from '../modules/results/read-results.js';

/** A stored vote; `eventId` is the participation ID of its event's link. */
export interface TestParticipation {
  readonly id: string;
  readonly eventId: string;
  readonly name: string | null;
  readonly tokenHash: string;
  readonly votes: Readonly<Record<string, VoteState>>;
}

/** A stored event with the hash of its management token, or what is left of a cancelled one. */
export type TestManagedEvent =
  | {
      readonly status: 'found';
      readonly managementTokenHash: string;
      /** The account that owns it; none when left out. */
      readonly ownerId?: string;
      /** When it was created; the account's list puts the newest first. */
      readonly createdAt?: Date;
      readonly event: StoredManagedEvent;
    }
  | { readonly status: 'cancelled'; readonly title: string };

export interface TestState {
  /** Answer of the database check. */
  databaseUp?: boolean;
  /** Stored events by the participation ID of their link; any other ID is missing. */
  publicEvents?: Readonly<Record<string, PublicEventLookup>>;
  /** What each results ID leads to; any other ID is missing. */
  results?: Readonly<Record<string, ResultsLookup>>;
  /** The events organizers manage, by the participation ID of their link; any other is missing. */
  managedEvents?: Readonly<Record<string, TestManagedEvent>>;
  /**
   * The events as their organizers read them with their results, by the participation ID of
   * their link, which is the organizer's event ID in `managedEvents`; any other is missing.
   */
  organizerEvents?: Readonly<Record<string, StoredOrganizerEvent>>;
  /** Stored votes; the app adds the ones it stores, so a test can read them. */
  participations?: TestParticipation[];
  /** The fixed time the app reads. */
  now?: Date;
}

/** The name of the fake session cookie: `<name>=<account ID>` signs that account in. */
export const testSessionCookie = 'test-session';

/** The account ID whose fake session has ended (expired or signed out). */
export const endedSession = 'ended';

/** The origin of qando's pages for the fake sessions. */
export const testTrustedOrigin = 'https://qando.test';

/**
 * Sessions without Better Auth: the cookie `test-session=<account ID>` signs that account in,
 * without a name and with the email `<account ID>@example.com`, except `ended`, a session that
 * expired or was signed out. Nothing is ever renewed; ending a
 * session only clears its cookie.
 */
export const testSessions: Sessions = {
  carried: (headers) => Promise.resolve(sessionAccountIn(headers.cookie) !== undefined),
  trusts: (origin) => Promise.resolve(origin === testTrustedOrigin),
  read: (headers) => {
    const account = sessionAccountIn(headers.cookie);
    return Promise.resolve({
      account:
        account === undefined || account === endedSession
          ? undefined
          : { id: account, name: '', email: `${account}@example.com` },
      renewedCookies: [],
    });
  },
  end: () => Promise.resolve([`${testSessionCookie}=; Max-Age=0`]),
};

function sessionAccountIn(cookie: string | undefined): string | undefined {
  return cookie
    ?.split('; ')
    .find((pair) => pair.startsWith(`${testSessionCookie}=`))
    ?.slice(testSessionCookie.length + 1);
}

/** The app's edges (database, sessions and clock) replaced by fixed answers, for unit tests. */
export function testDependencies({
  databaseUp = true,
  publicEvents = {},
  participations = [],
  results = {},
  managedEvents = {},
  organizerEvents = {},
  now = new Date('2026-06-15T08:00:00Z'),
}: TestState = {}): AppDependencies {
  const stored = new Map(Object.entries(publicEvents));
  return {
    checkDatabase: () => Promise.resolve(databaseUp),
    publicEvents: {
      find: (publicId) => Promise.resolve(stored.get(publicId) ?? { status: 'missing' }),
    },
    participations: inMemoryParticipations(stored, participations),
    results: {
      find: (resultsId) => Promise.resolve(results[resultsId] ?? { status: 'missing' }),
      ofOrganizer: ({ eventId }) => Promise.resolve(organizerEvents[eventId]),
    },
    managedEvents: inMemoryManagedEvents(managedEvents),
    sessions: testSessions,
    // Sign-in by code has its own tests, each with the codes it needs.
    signInCodes: {
      send: () => Promise.reject(new Error('No sign-in code is sent in this test')),
      signIn: () => Promise.reject(new Error('No sign-in code is tried in this test')),
    },
    accountDeletion: {
      sendCode: () => Promise.reject(new Error('No deletion code is sent in this test')),
      delete: () => Promise.reject(new Error('No account is deleted in this test')),
    },
    // No application is allowed to act for an account: the authorization server has its own tests.
    authorizationServer: (_request, _response, next) => {
      next();
    },
    // No request to connect is read: the consent page's question has its own tests.
    connectionRequests: {
      applicationOf: () => Promise.reject(new Error('No request to connect is read in this test')),
    },
    // No assistant calls the connector: it has its own tests, each with the access it needs.
    connectorAccess: () => () =>
      Promise.reject(new Error('The connector is not called in this test')),
    // No account's applications are read: "Apps conectadas" has its own tests.
    connectedApplications: {
      of: () => Promise.reject(new Error('No connected application is read in this test')),
      disconnect: () => Promise.reject(new Error('No application is disconnected in this test')),
    },
    // Creating events has its own tests, each with the store it needs.
    newEvents: {
      create: () => Promise.reject(new Error('No event is created in this test')),
      createOnce: () => Promise.reject(new Error('No event is created in this test')),
      lastOrganizerName: () => Promise.reject(new Error('No event is created in this test')),
    },
    // No phrase is edited: the editor has its own tests.
    editPhrase: (phrase) => Promise.resolve(phrase),
    now: () => now,
    // The pages are where sessions are trusted from.
    publicUrl: testTrustedOrigin,
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
  const asStored = ({ id, eventId, name, votes }: TestParticipation): StoredParticipation => ({
    id,
    eventId,
    vote: { name, votes },
  });
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
    participation: (tokenHash) => {
      const stored = byHash(tokenHash);
      return Promise.resolve(stored && asStored(stored));
    },
    add: (eventId, tokenHash, vote) => {
      const earlier = byHash(tokenHash);
      if (earlier) return Promise.resolve(asStored(earlier));
      const participation = { id: randomUUID(), eventId, tokenHash, ...vote };
      list.push(participation);
      return Promise.resolve(asStored(participation));
    },
    replace: (eventId, participationId, vote) => {
      const at = list.findIndex(
        (stored) => stored.id === participationId && stored.eventId === eventId,
      );
      const stored = list[at];
      if (!stored) return Promise.reject(new Error('No such participation in this event'));
      list[at] = { ...stored, ...vote };
      return Promise.resolve();
    },
  };
  return { transaction: (work) => work(ballot) };
}

/** Managed events in a record; an event's own ID is the participation ID of its link. */
function inMemoryManagedEvents(events: Readonly<Record<string, TestManagedEvent>>): ManagedEvents {
  const stored = new Map(Object.entries(events));
  return {
    access: (participationId, { tokenHash, ownerId }) => {
      const found = stored.get(participationId);
      if (found?.status === 'cancelled') return Promise.resolve(found);
      const managed =
        found !== undefined &&
        ((tokenHash !== undefined && found.managementTokenHash === tokenHash) ||
          (ownerId !== undefined && found.ownerId === ownerId));
      return Promise.resolve(
        managed ? { status: 'managed', eventId: participationId } : { status: 'not-managed' },
      );
    },
    ownedBy: (accountId) =>
      Promise.resolve(
        [...stored.values()]
          .flatMap((found) =>
            found.status === 'found' && found.ownerId === accountId
              ? [
                  {
                    ...found.event,
                    voters: found.event.votes.length,
                    createdAt: found.createdAt ?? new Date(0),
                  },
                ]
              : [],
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),
    event: ({ eventId }) => {
      const found = stored.get(eventId);
      return Promise.resolve(found?.status === 'found' ? found.event : undefined);
    },
    retryFailedEmail: ({ eventId }, type) => {
      const found = stored.get(eventId);
      if (found?.status !== 'found') return Promise.resolve(false);
      const { emails } = found.event;
      if (!emails.some((email) => email.type === type && email.status === 'failed')) {
        return Promise.resolve(false);
      }
      const retried = emails.map((email) =>
        email.type === type ? { type, status: 'pending' as const } : email,
      );
      stored.set(eventId, { ...found, event: { ...found.event, emails: retried } });
      return Promise.resolve(true);
    },
    cancel: ({ eventId }) => {
      const found = stored.get(eventId);
      if (found?.status !== 'found') return Promise.resolve(undefined);
      const { title } = found.event;
      stored.set(eventId, { status: 'cancelled', title });
      return Promise.resolve(title);
    },
    change: (work) =>
      work({
        lock: ({ eventId }) => {
          const found = stored.get(eventId);
          if (found?.status !== 'found') return Promise.resolve(undefined);
          const { options, confirmedOption, timeZone, state, closesAt, votes } = found.event;
          return Promise.resolve({
            timeZone,
            state,
            closesAt,
            optionIds: options.map(({ id }) => id),
            confirmedOptionId: confirmedOption?.id ?? null,
            voted: votes.length > 0,
          });
        },
        confirm: ({ eventId }, optionId) => {
          const found = stored.get(eventId);
          const option =
            found?.status === 'found'
              ? found.event.options.find(({ id }) => id === optionId)
              : undefined;
          if (found?.status !== 'found' || !option) {
            return Promise.reject(new Error('No such option in this event'));
          }
          stored.set(eventId, {
            ...found,
            event: { ...found.event, state: 'confirmed', confirmedOption: option },
          });
          return Promise.resolve();
        },
        setClosing: ({ eventId }, closing) => {
          const found = stored.get(eventId);
          if (found?.status !== 'found') return Promise.reject(new Error('No such event'));
          // As the outbox queues it: one "voting closed" email per event, due again.
          const due = { type: 'voting-closed', status: 'pending' } as const;
          const others = found.event.emails.filter(({ type }) => type !== 'voting-closed');
          stored.set(eventId, {
            ...found,
            event: { ...found.event, ...closing, emails: [...others, due] },
          });
          return Promise.resolve();
        },
        replaceOptions: ({ eventId }, replacing) => {
          const found = stored.get(eventId);
          if (found?.status !== 'found') return Promise.reject(new Error('No such event'));
          // As the database does: new IDs, and the votes of the options deleted go with them.
          const options = replacing.map((option) => ({ id: randomUUID(), ...option }));
          stored.set(eventId, { ...found, event: { ...found.event, options, votes: [] } });
          return Promise.resolve();
        },
      }),
  };
}

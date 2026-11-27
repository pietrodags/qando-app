import type { Option } from '@qando/contracts';
import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../app.js';
import type { ManagedEvents, StoredManagedEvent } from '../modules/management/managed-events.js';
import { callTool, resultOf, type Revision } from './assistant.js';
import { movingClock, type MovingClock } from './moving-clock.js';
import { testDependencies, testSessionCookie, type TestManagedEvent } from './test-dependencies.js';

/** The two whole days "Cena de verano" offers. */
export const july6: Option = {
  id: '00000000-0000-4000-8000-000000000706',
  dates: { kind: 'single', date: '2026-07-06' },
  time: null,
};
export const july10: Option = {
  id: '00000000-0000-4000-8000-000000000710',
  dates: { kind: 'single', date: '2026-07-10' },
  time: null,
};

/** "Cena de verano", Ana's, open until the end of 1 July in Madrid; Luis and Marta can come on 10 July. */
export const cena: StoredManagedEvent = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  state: 'open',
  closesAt: new Date('2026-07-01T21:59:59.999Z'),
  options: [july6, july10],
  confirmedOption: null,
  participationId: 'k3Jd9',
  resultsId: 'Qw7p2',
  votes: [
    { [july6.id]: 'unavailable', [july10.id]: 'available' },
    { [july6.id]: 'unavailable', [july10.id]: 'available' },
  ],
  emails: [],
};

/**
 * Ana's "Cena de verano" (`k3Jd9`) as it is stored, with those changes; beside it Bea's
 * "Partido" (`Bp4Lk`) and Ana's "Cumpleaños" (`Xc7Tt`), cancelled.
 */
export const anas = (
  event: Partial<StoredManagedEvent> = {},
): Record<string, TestManagedEvent> => ({
  k3Jd9: {
    status: 'found',
    managementTokenHash: 'hash of k3Jd9',
    ownerId: 'ana',
    event: { ...cena, ...event },
  },
  Bp4Lk: {
    status: 'found',
    managementTokenHash: 'hash of Bp4Lk',
    ownerId: 'bea',
    event: { ...cena, title: 'Partido', participationId: 'Bp4Lk' },
  },
  Xc7Tt: { status: 'cancelled', title: 'Cumpleaños' },
});

/**
 * The store, with 10 July confirmed by another request right before a change locks the event: a
 * confirmation from the web that comes first.
 */
export const confirmedMeanwhile = (managedEvents: ManagedEvents): ManagedEvents => ({
  ...managedEvents,
  change: (work) =>
    managedEvents.change((change) =>
      work({
        ...change,
        lock: async (organizer) => {
          await change.confirm(organizer, july10.id);
          return change.lock(organizer);
        },
      }),
    ),
});

/** The store, with the event cancelled by another request right before a change locks it. */
export const cancelledMeanwhile = (managedEvents: ManagedEvents): ManagedEvents => ({
  ...managedEvents,
  change: (work) =>
    managedEvents.change((change) =>
      work({
        ...change,
        lock: async (organizer) => {
          await managedEvents.cancel(organizer);
          return change.lock(organizer);
        },
      }),
    ),
});

/** Monday 15 June 2026, at 10:00 in Madrid. */
export const mondayMorning = new Date('2026-06-15T08:00:00Z');

/** The headers these tests name the account and the application of a call with, in the token's place. */
export const as = (accountId: string, applicationId = 'claude') => ({
  'X-Account': accountId,
  'X-Application': applicationId,
});

/**
 * The API with the connector open, on a clock the test moves: every call acts for the account
 * and the application its headers name. `around` stands in for what happens to the stored
 * events meanwhile, given the store itself.
 */
export function connector({
  events = anas(),
  clock = movingClock(mondayMorning),
  around = (managedEvents) => managedEvents,
}: {
  events?: Record<string, TestManagedEvent>;
  clock?: MovingClock;
  around?: (managedEvents: ManagedEvents) => ManagedEvents;
} = {}) {
  const dependencies = testDependencies({ managedEvents: events });
  return createApp({
    ...dependencies,
    managedEvents: around(dependencies.managedEvents),
    now: clock.now,
    connectorAccess: (serve) => (calling) =>
      serve(calling, {
        accountId: calling.headers.get('x-account') ?? 'nobody',
        applicationId: calling.headers.get('x-application') ?? 'none',
      }),
  });
}

export type App = ReturnType<typeof connector>;

/** What a tool answered, without what the current revision adds to every answer. */
export interface Answer {
  content: { type: string; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

/** What the tool `name` answers for what the call gives it. */
export async function calling(
  app: App,
  name: string,
  args: Record<string, unknown>,
  {
    headers = as('ana'),
    revision = '2026-07-28',
  }: { headers?: Record<string, string>; revision?: Revision } = {},
): Promise<Answer> {
  const response = await callTool(app, revision, name, headers, args);
  expect(response.status).toBe(200);
  const { content, structuredContent, isError } = resultOf(response) as Answer;
  return {
    content,
    ...(structuredContent !== undefined && { structuredContent }),
    ...(isError !== undefined && { isError }),
  };
}

/** The lines of an answer's words. */
export const lines = ({ content }: Answer): string[] =>
  content
    .map(({ text }) => text)
    .join('\n')
    .split('\n');

/** A tool's answer when what was asked was not done: words alone. */
export const notDone = (text: string): Answer => ({
  content: [{ type: 'text', text }],
  isError: true,
});

/** The event as its management page reads it for Ana: its status and its body. */
export async function managementPageOf(
  app: App,
  id = 'k3Jd9',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await request(app)
    .get(`/api/events/${id}`)
    .set('Cookie', `${testSessionCookie}=ana`);
  return { status: response.status, body: response.body as Record<string, unknown> };
}

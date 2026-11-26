import type { EventCreated } from '@qando/contracts';
import {
  validateNewEvent,
  type NewEvent,
  type NewEventInput,
  type NewEventProblem,
} from '@qando/domain';

/** Port to where new events are stored. */
export interface NewEvents {
  /**
   * Stores the event owned by the account, managed with the token given, with its options in
   * their order, two new links and its summary email queued to the account, in one transaction:
   * all of it or nothing. An account without a name yet takes the event's organizer name, as
   * accounts are named by their first event. Answers the links. When the token already holds an
   * event of the account (a repeated send, also one running at the same time), nothing is stored
   * and that event's links are answered; when it holds one of another account, `taken`.
   */
  create(
    ownerId: string,
    managementToken: string,
    event: NewEvent,
  ): Promise<EventCreated | 'taken'>;
  /**
   * Stores the event as `create` does, for a client that sends no token of its own (an
   * assistant): the management token is made here and answered to no one. With the account
   * locked, so two calls at once wait for each other: an event of the account with the same
   * title, deadline and options, created less than `sameWithinMs` ago, is the same event, so
   * nothing is stored and its links are answered; an account that created `atMost.count` events
   * less than `atMost.withinMs` ago stores nothing either, and is answered when the next one can
   * be (`retryAt`). Every event of the account counts, whatever created it.
   */
  createOnce(
    ownerId: string,
    event: NewEvent,
    rules: OnceRules,
  ): Promise<EventCreated | { readonly retryAt: Date }>;
  /** The organizer name of the account's most recently created event; none without an event. */
  lastOrganizerName(ownerId: string): Promise<string | undefined>;
}

/** What `createOnce` holds an account's new event to. */
export interface OnceRules {
  readonly sameWithinMs: number;
  readonly atMost: { readonly count: number; readonly withinMs: number };
}

/**
 * What creating an event amounts to: its links, or why nothing was created: every rule of the
 * domain it breaks, or alone `MANAGEMENT_TOKEN_TAKEN`, a token that holds an event of another
 * account.
 */
export type EventCreation =
  | { readonly status: 'created'; readonly links: EventCreated }
  | {
      readonly status: 'rejected';
      readonly problems: readonly (NewEventProblem | { readonly code: 'MANAGEMENT_TOKEN_TAKEN' })[];
    };

/**
 * The use case behind creating an event, free of HTTP, so every client runs the same checks: the
 * event, checked by the domain with today taken from `now` in its time zone, is stored owned by
 * the account and managed with the token given. The same token sent again by the same account
 * answers the event it created the first time.
 */
export async function createEvent(
  newEvents: NewEvents,
  ownerId: string,
  managementToken: string,
  input: NewEventInput,
  now: Date,
): Promise<EventCreation> {
  const validation = validateNewEvent(input, now);
  if (!validation.ok) return { status: 'rejected', problems: validation.problems };
  const stored = await newEvents.create(ownerId, managementToken, validation.event);
  if (stored === 'taken') {
    return { status: 'rejected', problems: [{ code: 'MANAGEMENT_TOKEN_TAKEN' }] };
  }
  return { status: 'created', links: stored };
}

/**
 * An assistant's call: the same event within 10 minutes is the first one, and an account creates
 * at most 10 events an hour (an assistant in a loop).
 */
const assistantRules: OnceRules = {
  sameWithinMs: 10 * 60_000,
  atMost: { count: 10, withinMs: 60 * 60_000 },
};

/** A new event as an assistant sends it: the organizer's name may be left out. */
export type AssistantEventInput = Omit<NewEventInput, 'organizerName'> & {
  readonly organizerName?: string | undefined;
};

/**
 * What an assistant's call to create amounts to: the event's title and links (also those of the
 * same event created by a call before), every rule of the domain it breaks, or the whole seconds
 * to wait when the account created its events of the hour.
 */
export type OnceCreation =
  | { readonly status: 'created'; readonly title: string; readonly links: EventCreated }
  | { readonly status: 'rejected'; readonly problems: readonly NewEventProblem[] }
  | { readonly status: 'limited'; readonly retryAfterSeconds: number };

/**
 * The use case behind creating an event from an assistant, which sends no token: the event is
 * checked by the domain as `createEvent` checks it and stored once (`NewEvents.createOnce`). A
 * name left out, or only spaces, is the organizer name of the account's last event, as the web
 * proposes it; an account without one is answered that the name is missing.
 */
export async function createEventOnce(
  newEvents: NewEvents,
  ownerId: string,
  input: AssistantEventInput,
  now: Date,
): Promise<OnceCreation> {
  const organizerName = input.organizerName?.trim()
    ? input.organizerName
    : ((await newEvents.lastOrganizerName(ownerId)) ?? '');
  const validation = validateNewEvent({ ...input, organizerName }, now);
  if (!validation.ok) return { status: 'rejected', problems: validation.problems };
  const stored = await newEvents.createOnce(ownerId, validation.event, assistantRules);
  if ('retryAt' in stored) {
    const seconds = Math.ceil((stored.retryAt.getTime() - now.getTime()) / 1000);
    return { status: 'limited', retryAfterSeconds: Math.max(1, seconds) };
  }
  return { status: 'created', title: validation.event.title, links: stored };
}

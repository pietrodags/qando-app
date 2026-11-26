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

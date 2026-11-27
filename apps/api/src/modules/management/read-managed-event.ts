import type { EmailState, ManagedEvent } from '@qando/contracts';
import {
  currentState,
  resultsOf,
  type EventState,
  type StoredEventState,
  type VoteState,
} from '@qando/domain';
import {
  actingOrganizer,
  refusalSinceTheCheck,
  type ManagedEvents,
  type ManagementCredentials,
  type ManagementRefusal,
  type StoredEmail,
  type StoredManagedEvent,
} from './managed-events.js';

/**
 * What the question before confirming a date is asked from, on the management page and in the
 * assistant's chat alike: whether voting is open, how many voted and the dates the results
 * recommend (their winners, in the event's order).
 */
export type DecisionFacts = Pick<ManagedEvent, 'state' | 'voters' | 'recommendedOptionIds'>;

/** The facts of a decision, from the event's options in their order and its votes, at `at`. */
export function decisionFacts(
  optionIds: readonly string[],
  votes: readonly Readonly<Record<string, VoteState>>[],
  stored: StoredEventState,
  at: Date,
): DecisionFacts {
  const { voters, winners } = resultsOf(optionIds, votes);
  return {
    state: currentState(stored, at),
    voters,
    recommendedOptionIds: winners.map(({ optionId }) => optionId),
  };
}

/** What reading an event to manage it amounts to: the event, or why it is refused. */
export type ManagedEventReading =
  { readonly status: 'found'; readonly event: ManagedEvent } | ManagementRefusal;

/**
 * The use case behind the management page, free of HTTP so every adapter (the API's route,
 * later the organizers' MCP connector) reads the same event: who is acting is checked first,
 * then the event comes with the facts a decision needs, at the time `now` answers. The use
 * cases that change the event answer with it too, once their change is stored.
 */
export async function readManagedEvent(
  managedEvents: ManagedEvents,
  participationId: string,
  credentials: ManagementCredentials,
  now: () => Date,
): Promise<ManagedEventReading> {
  const access = await actingOrganizer(managedEvents, participationId, credentials);
  if (access.status !== 'granted') return access;
  const event = await managedEvents.event(access.organizer);
  // Deleted since the check: another request cancelled it (a second tab), answered as a repeat.
  if (!event) return refusalSinceTheCheck(managedEvents, participationId, credentials);
  return { status: 'found', event: managedEventOf(event, now()) };
}

/** The event as its organizer sees it: with the facts of a decision, at `at`. */
function managedEventOf(event: StoredManagedEvent, at: Date): ManagedEvent {
  const { state: stored, closesAt, votes, emails, ...shown } = event;
  const optionIds = event.options.map(({ id }) => id);
  const facts = decisionFacts(optionIds, votes, { state: stored, closesAt }, at);
  return {
    ...shown,
    options: [...shown.options],
    ...facts,
    emails: emails.map((email) => emailStateOf(email, facts.state)),
  };
}

/**
 * An email's state as its organizer reads it. "Voting closed" is queued when the event is
 * created, due just after voting closes: pending while voting is open, it waits for the closing
 * (`scheduled`); once voting has closed, it is being sent.
 */
function emailStateOf(email: StoredEmail, state: EventState): EmailState {
  if (email.status === 'sent') return { ...email, sentAt: email.sentAt.toISOString() };
  if (email.status === 'pending' && email.type === 'voting-closed' && state === 'open') {
    return { type: email.type, status: 'scheduled' };
  }
  return email;
}

import type { EmailState, ManagedEvent } from '@qando/contracts';
import { currentState, resultsOf, type EventState } from '@qando/domain';
import {
  actingOrganizer,
  type ActingOrganizer,
  type ManagedEvents,
  type ManagementCredentials,
  type ManagementRefusal,
  type StoredEmail,
  type StoredManagedEvent,
} from './managed-events.js';

/** What reading an event to manage it amounts to: the event, or why it is refused. */
export type ManagedEventReading =
  { readonly status: 'found'; readonly event: ManagedEvent } | ManagementRefusal;

/**
 * The use case behind the management page, free of HTTP so every adapter (the API's route,
 * later the organizers' MCP connector) reads the same event: who is acting is checked first,
 * then the event comes with the facts a decision needs, at the time `now` answers.
 */
export async function readManagedEvent(
  managedEvents: ManagedEvents,
  participationId: string,
  credentials: ManagementCredentials,
  now: () => Date,
): Promise<ManagedEventReading> {
  const access = await actingOrganizer(managedEvents, participationId, credentials);
  if (access.status !== 'granted') return access;
  return managedEventFor(managedEvents, access.organizer, now);
}

/** The event the organizer manages as the management page shows it, once access is granted. */
export async function managedEventFor(
  managedEvents: ManagedEvents,
  organizer: ActingOrganizer,
  now: () => Date,
): Promise<ManagedEventReading> {
  const event = await managedEvents.event(organizer);
  // Deleted since the check: the token no longer manages anything; the next request says why.
  if (!event) return { status: 'forbidden' };
  return { status: 'found', event: managedEventOf(event, now()) };
}

/**
 * The event as its organizer sees it: the current state and, from the votes, how many voted and
 * which options the results recommend (their winners, in the event's order).
 */
function managedEventOf(event: StoredManagedEvent, at: Date): ManagedEvent {
  const { state: stored, closesAt, votes, emails, ...shown } = event;
  const results = resultsOf(
    event.options.map(({ id }) => id),
    votes,
  );
  const state = currentState({ state: stored, closesAt }, at);
  return {
    ...shown,
    options: [...shown.options],
    state,
    voters: results.voters,
    recommendedOptionIds: results.winners.map(({ optionId }) => optionId),
    emails: emails.map((email) => emailStateOf(email, state)),
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

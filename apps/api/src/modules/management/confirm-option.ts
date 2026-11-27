import { changeManagedEvent } from './change-managed-event.js';
import type {
  ActingOrganizer,
  EventChange,
  LockedEvent,
  ManagedEvents,
  ManagementCredentials,
} from './managed-events.js';
import {
  decisionFacts,
  type DecisionFacts,
  type ManagedEventReading,
} from './read-managed-event.js';

/**
 * What confirming an option amounts to: the event as it is now, or why nothing was confirmed;
 * besides the refusals of every management request, another option is confirmed already, or the
 * option is not one of the event's now (the page that sent it shows options replaced since).
 */
export type Confirmation =
  | ManagedEventReading
  | { readonly status: 'already-confirmed' }
  | { readonly status: 'options-changed' };

/** What confirming as asked amounts to: also, the facts it was asked from are no longer the event's. */
export type ConfirmationAsAsked = Confirmation | { readonly status: 'facts-changed' };

/**
 * The use case behind confirming the final option, free of HTTP like `readManagedEvent`. Allowed
 * before or after the deadline; a confirmation is final, but the confirmed option sent again (a
 * retry after a lost answer) answers the event as the first time and changes nothing. Checked
 * and stored with the event locked, so two confirmations at once cannot both win and no vote is
 * stored after voting closed. Removing the pending "voting closed" email joins this transaction
 * when emails exist.
 */
export function confirmOption(
  managedEvents: ManagedEvents,
  participationId: string,
  credentials: ManagementCredentials,
  optionId: string,
  now: () => Date,
): Promise<Confirmation> {
  return confirming(managedEvents, participationId, credentials, optionId, now);
}

/**
 * Confirming as `confirmOption` does, once the organizer said yes to a question asked from
 * `asked` (the assistant's first answer): only while the event's facts are still those, read
 * with the event locked, so no vote stored meanwhile slips in between the check and the change.
 */
export function confirmAsAsked(
  managedEvents: ManagedEvents,
  participationId: string,
  credentials: ManagementCredentials,
  optionId: string,
  asked: DecisionFacts,
  now: () => Date,
): Promise<ConfirmationAsAsked> {
  return confirming(
    managedEvents,
    participationId,
    credentials,
    optionId,
    now,
    async (event, change, organizer) => {
      const facts = decisionFacts(event.optionIds, await change.votes(organizer), event, now());
      return sameFacts(facts, asked) ? undefined : ({ status: 'facts-changed' } as const);
    },
  );
}

/** The confirmation of both, with what else, if anything, it is checked against once the option is one to confirm. */
function confirming<Refusal>(
  managedEvents: ManagedEvents,
  participationId: string,
  credentials: ManagementCredentials,
  optionId: string,
  now: () => Date,
  check?: (
    event: LockedEvent,
    change: EventChange,
    organizer: ActingOrganizer,
  ) => Promise<Refusal | undefined>,
) {
  return changeManagedEvent(
    managedEvents,
    participationId,
    credentials,
    now,
    async (event, change, organizer) => {
      if (event.confirmedOptionId !== null) {
        return event.confirmedOptionId === optionId
          ? undefined
          : ({ status: 'already-confirmed' } as const);
      }
      if (!event.optionIds.includes(optionId)) return { status: 'options-changed' } as const;
      const refusal = await check?.(event, change, organizer);
      if (refusal !== undefined) return refusal;
      await change.confirm(organizer, optionId);
      return undefined;
    },
  );
}

/** The fields of the facts, written in this order whatever the order they came in. */
const factFields = ['state', 'voters', 'recommendedOptionIds'];

const sameFacts = (a: DecisionFacts, b: DecisionFacts): boolean =>
  JSON.stringify(a, factFields) === JSON.stringify(b, factFields);

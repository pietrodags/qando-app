import type { Option } from '@qando/contracts';
import type { StoredEventState, VoteState } from '@qando/domain';
import { hashCapabilityToken } from '../../capability-token.js';

/**
 * What a request carries to manage an event: the management link's token, the account it is
 * signed in as, or both; either one that manages the event grants it. Later an agent's grant
 * (ADR 0016) becomes one more way to resolve the same acting organizer, so no use case changes
 * when it arrives.
 */
export interface ManagementCredentials {
  readonly managementToken?: string | undefined;
  /** The account of the request's session (`signedInAccount`). */
  readonly accountId?: string | undefined;
}

/** What the stored event is matched by: its management token's hash, its owner, or both. */
export type ManagementMatch =
  | { readonly tokenHash: string; readonly ownerId?: string | undefined }
  | { readonly tokenHash?: string | undefined; readonly ownerId: string };

declare const resolved: unique symbol;

/**
 * The organizer allowed to manage one event. Only `actingOrganizer` makes one, so every
 * management use case and every port method that takes one has checked the credentials first.
 */
export interface ActingOrganizer {
  /** The stored event's own ID, never shown: links carry the participation ID. */
  readonly eventId: string;
  readonly [resolved]: true;
}

/** Whether the credentials manage the event of the link, and if not, why. */
export type ManagementAccess =
  { readonly status: 'granted'; readonly organizer: ActingOrganizer } | ManagementRefusal;

/**
 * Why a management request is refused: no credential at all, one that does not manage this
 * event (another event's token, a participation link, an event that does not exist), or the
 * event was cancelled, which its participation link already tells anyone.
 */
export type ManagementRefusal =
  | { readonly status: 'unauthenticated' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'cancelled'; readonly title: string };

/** What the management page is computed from. */
export type StoredManagedEvent = {
  readonly title: string;
  readonly timeZone: string;
  readonly deadline: string;
  /** In chronological order. */
  readonly options: readonly Option[];
  readonly confirmedOption: Option | null;
  readonly participationId: string;
  readonly resultsId: string;
  /** Each participant's states by option ID. */
  readonly votes: readonly Readonly<Record<string, VoteState>>[];
} & StoredEventState;

/** What a change to an event is checked against, read with the event locked. */
export interface LockedEvent {
  /** In chronological order. */
  readonly optionIds: readonly string[];
  readonly confirmedOptionId: string | null;
}

/** The reads and writes of one change to an event, all inside one transaction. */
export interface EventChange {
  /**
   * The event, locked until the transaction ends: votes being stored finish first, and votes and
   * other changes sent meanwhile wait for this one. Undefined if it was deleted since the check.
   */
  lock(organizer: ActingOrganizer): Promise<LockedEvent | undefined>;
  /** Stores the option as the event's final one, which closes voting. */
  confirm(organizer: ActingOrganizer, optionId: string): Promise<void>;
}

/** Port to the stored events an organizer manages. */
export interface ManagedEvents {
  /**
   * The event of the participation ID that the match manages (its token's hash, or the account
   * that owns it), or why not.
   */
  access(
    participationId: string,
    match: ManagementMatch,
  ): Promise<
    | { readonly status: 'managed'; readonly eventId: string }
    | { readonly status: 'cancelled'; readonly title: string }
    | { readonly status: 'not-managed' }
  >;
  /** The event the organizer manages; undefined if it was deleted since the access check. */
  event(organizer: ActingOrganizer): Promise<StoredManagedEvent | undefined>;
  /** Runs the work in one transaction; it commits when the work's promise resolves. */
  change<T>(work: (change: EventChange) => Promise<T>): Promise<T>;
}

/**
 * The one place that decides who is acting on an event (ADR 0016): the credentials of the
 * request (the management token, the owner's session) resolved into the organizer of the event
 * of the link, or the refusal. A request without a credential costs no database work.
 */
export async function actingOrganizer(
  managedEvents: ManagedEvents,
  participationId: string,
  { managementToken, accountId }: ManagementCredentials,
): Promise<ManagementAccess> {
  const tokenHash =
    managementToken === undefined ? undefined : hashCapabilityToken(managementToken);
  let match: ManagementMatch;
  if (tokenHash !== undefined) match = { tokenHash, ownerId: accountId };
  else if (accountId !== undefined) match = { ownerId: accountId };
  else return { status: 'unauthenticated' };
  const access = await managedEvents.access(participationId, match);
  switch (access.status) {
    case 'managed':
      // The brand is only a type: this is the one place allowed to assert it.
      return { status: 'granted', organizer: { eventId: access.eventId } as ActingOrganizer };
    case 'cancelled':
      return access;
    case 'not-managed':
      return { status: 'forbidden' };
  }
}

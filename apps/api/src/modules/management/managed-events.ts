import type { EmailType, Option } from '@qando/contracts';
import type { Closing, ProposedOption, StoredEventState, VoteState } from '@qando/domain';
import { hashCapabilityToken } from '../../capability-token.js';

/**
 * What a request carries to manage an event: the management link's token, the account it is
 * signed in as, or both; either one that manages the event grants it. Later the grant an
 * organizer gives an AI agent to act for them becomes one more way to resolve the same acting
 * organizer, so no use case changes when it arrives.
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

/** An email of the event to its organizer as the outbox left it; only one sent says when. */
export type StoredEmail =
  | { readonly type: EmailType; readonly status: 'sent'; readonly sentAt: Date }
  | { readonly type: EmailType; readonly status: 'pending' | 'failed' };

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
  /** The emails queued for the event, the summary first. */
  readonly emails: readonly StoredEmail[];
} & StoredEventState;

/** What the account's list of events is computed from. */
export type StoredOwnEvent = {
  readonly participationId: string;
  readonly title: string;
  readonly deadline: string;
  readonly createdAt: Date;
} & StoredEventState;

/** What a change to an event is checked against, read with the event locked. */
export type LockedEvent = {
  /** IANA name: today and the deadline are read in it. */
  readonly timeZone: string;
  /** In chronological order. */
  readonly optionIds: readonly string[];
  readonly confirmedOptionId: string | null;
  /** Whether anyone has voted. */
  readonly voted: boolean;
} & StoredEventState;

/** The reads and writes of one change to an event, all inside one transaction. */
export interface EventChange {
  /**
   * The event, locked until the transaction ends: votes being stored finish first, and votes and
   * other changes sent meanwhile wait for this one. Undefined if it was deleted since the check.
   */
  lock(organizer: ActingOrganizer): Promise<LockedEvent | undefined>;
  /**
   * Stores the option as the event's final one, which closes voting; its "voting closed" email
   * is dropped unless it was sent, as it would ask to choose the date.
   */
  confirm(organizer: ActingOrganizer, optionId: string): Promise<void>;
  /**
   * Stores when voting closes, reopening it or closing it now, and queues the "voting closed"
   * email for that closing: it is sent once per closing, so one sent for an earlier closing is
   * due again.
   */
  setClosing(organizer: ActingOrganizer, closing: Closing): Promise<void>;
  /**
   * Replaces every option of the event with these, stored in their order with new IDs. The votes
   * of an option go with it, so it is only asked while nobody has voted.
   */
  replaceOptions(organizer: ActingOrganizer, options: readonly ProposedOption[]): Promise<void>;
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
  /** The events the account owns, newest first; a cancelled event is no longer one of them. */
  ownedBy(accountId: string): Promise<readonly StoredOwnEvent[]>;
  /** The event the organizer manages; undefined if it was deleted since the access check. */
  event(organizer: ActingOrganizer): Promise<StoredManagedEvent | undefined>;
  /**
   * Makes the organizer's failed email of the type due again at `at`, for one more attempt;
   * answers whether it had failed (one sent, still being tried or never queued is left alone).
   */
  retryFailedEmail(organizer: ActingOrganizer, type: EmailType, at: Date): Promise<boolean>;
  /**
   * Cancels the event: deletes it and everything under it (options, votes, the confirmation, its
   * emails, sent or not) once the votes being stored finish, and keeps only its title behind its
   * participation and results links. Answers the title; undefined if another request cancelled it
   * since the check.
   */
  cancel(organizer: ActingOrganizer): Promise<string | undefined>;
  /** Runs the work in one transaction; it commits when the work's promise resolves. */
  change<T>(work: (change: EventChange) => Promise<T>): Promise<T>;
}

/**
 * The one place that decides who is acting on an event: the credentials of the request (the
 * management token, the owner's session) resolved into the organizer of the event of the link,
 * or the refusal. A request without a credential costs no database work.
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

/**
 * Why a request is refused when its event was gone by the time it was locked or read, although
 * the check had granted it: only cancelling deletes an event, so the request is resolved again
 * and answered as any later one is (`cancelled` with the title), never as a wrong credential.
 */
export async function refusalSinceTheCheck(
  managedEvents: ManagedEvents,
  participationId: string,
  credentials: ManagementCredentials,
): Promise<ManagementRefusal> {
  const access = await actingOrganizer(managedEvents, participationId, credentials);
  return access.status === 'granted' ? { status: 'forbidden' } : access;
}

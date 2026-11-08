import type { Option } from '@qando/contracts';
import type { StoredEventState, VoteState } from '@qando/domain';
import { hashCapabilityToken } from '../../capability-token.js';

/**
 * What a request carries to manage an event. Only the management link's token for now; the
 * organizer's session (and later an agent's grant, ADR 0016) become more ways to resolve the
 * same acting organizer, so no use case changes when they arrive.
 */
export interface ManagementCredentials {
  readonly managementToken?: string | undefined;
}

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

/** Port to the stored events an organizer manages. */
export interface ManagedEvents {
  /** The event of the participation ID whose management token has this hash, or why not. */
  access(
    participationId: string,
    tokenHash: string,
  ): Promise<
    | { readonly status: 'managed'; readonly eventId: string }
    | { readonly status: 'cancelled'; readonly title: string }
    | { readonly status: 'not-managed' }
  >;
  /** The event the organizer manages; undefined if it was deleted since the access check. */
  event(organizer: ActingOrganizer): Promise<StoredManagedEvent | undefined>;
}

/**
 * The one place that decides who is acting on an event (ADR 0016): the credentials of the
 * request resolved into the organizer of the event of the link, or the refusal. A request
 * without a credential costs no database work.
 */
export async function actingOrganizer(
  managedEvents: ManagedEvents,
  participationId: string,
  { managementToken }: ManagementCredentials,
): Promise<ManagementAccess> {
  if (managementToken === undefined) return { status: 'unauthenticated' };
  const access = await managedEvents.access(participationId, hashCapabilityToken(managementToken));
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

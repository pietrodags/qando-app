import { HttpErrorResponse } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import {
  cancelEventEndpoint,
  changeDeadlineEndpoint,
  closeVotingEndpoint,
  confirmOptionEndpoint,
  managedEventEndpoint,
  managementTokenSchema,
  retryEmailEndpoint,
  type EmailState,
  type EmailType,
  type ManagedEvent,
} from '@qando/contracts';
import { ApiClient } from '../../core/api/api-client';
import { apiError } from '../../core/api/api-resource';
import { ManagementTokens } from '../../core/auth/management-tokens';

/**
 * What the management page can show of an event: the event to manage; refused (no credential,
 * another event's, a malformed link); or cancelled, with only its kept title.
 */
export type Management =
  | { readonly kind: 'managed'; readonly event: ManagedEvent }
  | { readonly kind: 'refused' }
  | { readonly kind: 'cancelled'; readonly title: string };

/** What a retry answers: the email as the API now holds it, or else the event as it is. */
export type RetryAnswer = { readonly kind: 'retried'; readonly email: EmailState } | Management;

/**
 * The organizer's access to the events this browser manages. The management link hands its token
 * to the browser (`claim`), which keeps it per event (`ManagementTokens`) until the organizer
 * signs out, and sends it in `X-Management-Token`, never in an address. Every answer the
 * page can show is a `Management`; only a request that did not get through (network, server,
 * rate limit) rejects, for the page to offer trying again. A confirmation the API turns down
 * because the event changed meanwhile (another option confirmed, an option removed) answers the
 * event as it now is; so does retrying an email that was no longer failed (retried meanwhile
 * from another tab). Changing the deadline or closing voting answers the event as the API leaves
 * it, or as it is when a date was confirmed meanwhile. Cancelling answers the event cancelled,
 * also when it already was.
 */
@Service()
export class EventManagement {
  private readonly api = inject(ApiClient);
  private readonly tokens = inject(ManagementTokens);
  private readonly claimCount = signal(0);
  /**
   * How many management links this page has taken: a page that shows an event reads it again
   * when it grows, as when the full link is pasted over the refused page of its event.
   */
  readonly claims = this.claimCount.asReadonly();

  /** Takes the token of a management link just opened; one cut short is ignored. */
  claim(eventId: string, token: string): void {
    if (!managementTokenSchema.safeParse(token).success) return;
    this.tokens.keep(eventId, token);
    this.claimCount.update((count) => count + 1);
  }

  /** The event as its organizer manages it. */
  async read(eventId: string): Promise<Management> {
    try {
      return await this.answer(
        this.api.send(managedEventEndpoint, { params: { id: eventId }, ...this.headers(eventId) }),
      );
    } catch (error) {
      // A malformed event ID: no link of an event the browser could manage.
      if (error instanceof HttpErrorResponse && error.status === 400) return { kind: 'refused' };
      throw error;
    }
  }

  /** Confirms the option as the event's date. */
  async confirm(eventId: string, optionId: string): Promise<Management> {
    try {
      return await this.answer(
        this.api.send(confirmOptionEndpoint, {
          params: { id: eventId },
          ...this.headers(eventId),
          body: { optionId },
        }),
      );
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : undefined;
      if (status === 409 || status === 400) return this.read(eventId);
      throw error;
    }
  }

  /** Tries a failed email once more: answers its new state, being sent. */
  async retry(eventId: string, type: EmailType): Promise<RetryAnswer> {
    try {
      const email = await this.api.send(retryEmailEndpoint, {
        params: { id: eventId, type },
        ...this.headers(eventId),
      });
      return { kind: 'retried', email };
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : undefined;
      if (status === 409 || status === 400) return this.read(eventId);
      return this.refusal(error);
    }
  }

  /**
   * Moves the deadline to `deadline` (`YYYY-MM-DD`), reopening voting if it had closed. A day
   * the API no longer allows (it became yesterday at midnight) rejects, as a failure.
   */
  async changeDeadline(eventId: string, deadline: string): Promise<Management> {
    try {
      return await this.answer(
        this.api.send(changeDeadlineEndpoint, {
          params: { id: eventId },
          ...this.headers(eventId),
          body: { deadline },
        }),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) return this.read(eventId);
      throw error;
    }
  }

  /** Closes voting now; on an event already closed nothing changes. */
  async closeVoting(eventId: string): Promise<Management> {
    try {
      return await this.answer(
        this.api.send(closeVotingEndpoint, { params: { id: eventId }, ...this.headers(eventId) }),
      );
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : undefined;
      if (status === 409 || status === 400) return this.read(eventId);
      throw error;
    }
  }

  /**
   * Cancels the event, which keeps only its title: answers it cancelled, also when another tab
   * or a request whose answer was lost cancelled it first.
   */
  async cancel(eventId: string): Promise<Management> {
    try {
      const { title } = await this.api.send(cancelEventEndpoint, {
        params: { id: eventId },
        ...this.headers(eventId),
      });
      return { kind: 'cancelled', title };
    } catch (error) {
      return this.refusal(error);
    }
  }

  private async answer(sent: Promise<ManagedEvent>): Promise<Management> {
    try {
      return { kind: 'managed', event: await sent };
    } catch (error) {
      return this.refusal(error);
    }
  }

  /** What a refusal shows: the event cancelled or no access; anything else rejects. */
  private refusal(error: unknown): Management {
    const refusal = apiError(managedEventEndpoint, error);
    if (refusal?.status === 410) return { kind: 'cancelled', title: refusal.body.error.title };
    const status = error instanceof HttpErrorResponse ? error.status : undefined;
    if (status === 401 || status === 403) return { kind: 'refused' };
    throw error;
  }

  private headers(eventId: string): { headers?: { 'x-management-token': string } } {
    const token = this.tokens.of(eventId);
    return token === null ? {} : { headers: { 'x-management-token': token } };
  }
}

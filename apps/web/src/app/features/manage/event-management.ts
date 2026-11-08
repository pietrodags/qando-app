import { HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import {
  confirmOptionEndpoint,
  managedEventEndpoint,
  managementTokenSchema,
  type ManagedEvent,
} from '@qando/contracts';
import { ApiClient } from '../../core/api/api-client';
import { apiError } from '../../core/api/api-resource';

/**
 * What the management page can show of an event: the event to manage; refused (no credential,
 * another event's, a malformed link); or cancelled, with only its kept title.
 */
export type Management =
  | { readonly kind: 'managed'; readonly event: ManagedEvent }
  | { readonly kind: 'refused' }
  | { readonly kind: 'cancelled'; readonly title: string };

const storageKey = (eventId: string) => `qando.managementToken.${eventId}`;

/**
 * The organizer's access to the events this browser manages. The management link hands its token
 * to the browser (`claim`), which keeps it per event in its storage, shared by its tabs and kept
 * after a reload, and sends it in `X-Management-Token`, never in an address. Every answer the
 * page can show is a `Management`; only a request that did not get through (network, server,
 * rate limit) rejects, for the page to offer trying again. A confirmation the API turns down
 * because the event changed meanwhile (another option confirmed, an option removed) answers the
 * event as it now is.
 */
@Service()
export class EventManagement {
  private readonly api = inject(ApiClient);
  /** The tokens claimed on this page, for a browser that refuses its storage. */
  private readonly claimed = new Map<string, string>();

  /** Takes the token of a management link just opened; one cut short is ignored. */
  claim(eventId: string, token: string): void {
    if (!managementTokenSchema.safeParse(token).success) return;
    this.claimed.set(eventId, token);
    try {
      localStorage.setItem(storageKey(eventId), token);
    } catch {
      // Private windows and blocked site data refuse it: this page keeps it alone.
    }
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

  private async answer(sent: Promise<ManagedEvent>): Promise<Management> {
    try {
      return { kind: 'managed', event: await sent };
    } catch (error) {
      const refusal = apiError(managedEventEndpoint, error);
      if (refusal?.status === 410) return { kind: 'cancelled', title: refusal.body.error.title };
      const status = error instanceof HttpErrorResponse ? error.status : undefined;
      if (status === 401 || status === 403) return { kind: 'refused' };
      throw error;
    }
  }

  private headers(eventId: string): { headers?: { 'x-management-token': string } } {
    const token = this.claimed.get(eventId) ?? readStored(eventId);
    return token === null ? {} : { headers: { 'x-management-token': token } };
  }
}

function readStored(eventId: string): string | null {
  try {
    return localStorage.getItem(storageKey(eventId));
  } catch {
    return null;
  }
}

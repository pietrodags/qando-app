import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, Service, inject } from '@angular/core';
import { type ConnectingApplication, connectingApplicationEndpoint } from '@qando/contracts';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { apiError } from '../../core/api/api-resource';

/**
 * Why a request to connect has nothing to allow any more: it `expired` (the authorization server
 * did not sign it, or more than 10 minutes ago), or the session that was to answer it ended
 * (`signed-out`).
 */
export type NothingToAllow = 'expired' | 'signed-out';

/** The authorization server's route for the account's answer, which is not the API's own. */
const CONSENT_ROUTE = '/api/auth/oauth2/consent';

/** Addresses a browser runs or draws by itself instead of opening them: never followed. */
const NEVER_OPENED = new Set(['javascript:', 'data:', 'vbscript:', 'blob:']);

/**
 * A request to connect an application, as the consent page deals with it: which application it
 * names, and the account's answer to it. Both take the request as the page's address carries it,
 * whole, and tell an expired request and an ended session apart from a failure, which rejects
 * with the error itself (an HTTP error, whose rate limit the page can then count down).
 */
@Service()
export class ConnectionConsent {
  private readonly api = inject(ApiClient);
  private readonly http = inject(HttpClient);
  private readonly page = inject(DOCUMENT);

  /** The application the request names: what it says of itself, to show the account. */
  async application(connectionRequest: string): Promise<ConnectingApplication | NothingToAllow> {
    try {
      return await this.api.send(connectingApplicationEndpoint, {
        params: {},
        body: { connectionRequest },
      });
    } catch (error: unknown) {
      const status = apiError(connectingApplicationEndpoint, error)?.status;
      if (status === 410) return 'expired';
      if (status === 401) return 'signed-out';
      throw error;
    }
  }

  /**
   * Sends the account's answer, to allow the application or not. Either way the authorization
   * server says where the browser goes on (`returnTo`): back to the application, with the access
   * or the refusal. An address that would run in this page is never answered: it fails.
   */
  async answer(
    connectionRequest: string,
    allow: boolean,
  ): Promise<{ readonly returnTo: string } | NothingToAllow> {
    let answered: unknown;
    try {
      answered = await firstValueFrom(
        this.http.post<unknown>(CONSENT_ROUTE, { accept: allow, oauth_query: connectionRequest }),
      );
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401) return 'signed-out';
        if (error.status === 400 && reasonOf(error.error) === 'invalid_signature') return 'expired';
      }
      throw error;
    }
    const returnTo = fieldOf(answered, 'url');
    if (typeof returnTo !== 'string' || !this.opens(returnTo)) {
      throw new Error('The authorization server gave no address to go on at');
    }
    return { returnTo };
  }

  /** Whether the browser opens `address` as a page, of this site, another or an application. */
  private opens(address: string): boolean {
    if (address === '') return false;
    // Read as the browser will: against this page's address, spaces and tabs dropped.
    const { protocol } = new URL(address, this.page.baseURI);
    return !NEVER_OPENED.has(protocol);
  }
}

/** The reason the authorization server gives in a refusal's body; none in any other body. */
function reasonOf(body: unknown): unknown {
  return fieldOf(body, 'error');
}

/** What a body that was sent as JSON holds under `name`; nothing in a body that holds no fields. */
function fieldOf(body: unknown, name: string): unknown {
  return (body as Readonly<Record<string, unknown>> | null | undefined)?.[name];
}

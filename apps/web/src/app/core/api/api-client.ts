import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import {
  successBodyOf,
  urlOf,
  type Endpoint,
  type HeadersOf,
  type ParamsOf,
  type RequestBodyOf,
  type SuccessBody,
} from '@qando/contracts';
import { firstValueFrom } from 'rxjs';

/** What a request to the endpoint carries: its path parameters, headers and body, as typed. */
export interface ApiRequest<E extends Endpoint> {
  readonly params: ParamsOf<E>;
  readonly headers?: HeadersOf<E>;
  readonly body?: RequestBodyOf<E>;
}

/**
 * Sends a request to an endpoint of the contract, for the actions a page takes (reads that follow
 * the page go through `apiResource`). Resolves with the success body checked against the
 * endpoint's schema; rejects with the HTTP error, whose documented answer `apiError` reads.
 */
@Service()
export class ApiClient {
  private readonly http = inject(HttpClient);

  send<E extends Endpoint>(endpoint: E, request: ApiRequest<E>): Promise<SuccessBody<E>> {
    return firstValueFrom(
      this.http.request(endpoint.method.toUpperCase(), urlOf(endpoint, request.params), {
        headers: (request.headers ?? {}) as Readonly<Record<string, string>>,
        body: request.body,
      }),
    ).then((body) => successBodyOf(endpoint, body));
  }
}

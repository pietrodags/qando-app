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
import { firstValueFrom, timeout } from 'rxjs';

/** What a request to the endpoint carries: its path parameters, headers and body, as typed. */
export interface ApiRequest<E extends Endpoint> {
  readonly params: ParamsOf<E>;
  readonly headers?: HeadersOf<E>;
  readonly body?: RequestBodyOf<E>;
  /** The milliseconds the answer is waited for before the request is given up; no limit when absent. */
  readonly within?: number;
}

/**
 * Sends a request to an endpoint of the contract, for the actions a page takes (reads that follow
 * the page go through `apiResource`). Resolves with the success body checked against the
 * endpoint's schema; rejects with the HTTP error, whose documented answer `apiError` reads, or
 * with a timeout once the time the request was given has passed, the request given up.
 */
@Service()
export class ApiClient {
  private readonly http = inject(HttpClient);

  send<E extends Endpoint>(endpoint: E, request: ApiRequest<E>): Promise<SuccessBody<E>> {
    const answer = this.http.request(
      endpoint.method.toUpperCase(),
      urlOf(endpoint, request.params),
      {
        headers: (request.headers ?? {}) as Readonly<Record<string, string>>,
        body: request.body,
      },
    );
    return firstValueFrom(
      request.within === undefined ? answer : answer.pipe(timeout(request.within)),
    ).then((body) => successBodyOf(endpoint, body));
  }
}

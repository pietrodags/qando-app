import type { ParamMap } from '@angular/router';

/**
 * The request to connect an application that opened the sign-in page, from the query of the
 * page's address: the whole query, as the API takes it with the sign-in, when the authorization
 * server signed it (`sig`); none otherwise.
 */
export function connectionRequestOf(query: ParamMap): string | undefined {
  if (!query.has('sig')) return undefined;
  const request = new URLSearchParams();
  for (const name of query.keys) {
    for (const value of query.getAll(name)) request.append(name, value);
  }
  return request.toString();
}

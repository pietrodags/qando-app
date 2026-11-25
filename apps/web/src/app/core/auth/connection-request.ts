import type { ParamMap } from '@angular/router';

/**
 * The request to connect an application that a page was opened with (the sign-in page, then the
 * consent page), from the query of the page's address: the whole query, as the API and the
 * authorization server take it, when it carries what a request always does (what is asked,
 * `response_type`; the application, `client_id`) or the authorization server's signature
 * (`sig`); none otherwise. Any one of them is enough: what is left of a request whose address was
 * cut short is still sent, and the API says what it is worth, so the person is told to start
 * again where they would otherwise be told nothing.
 */
export function connectionRequestOf(query: ParamMap): string | undefined {
  if (!['response_type', 'client_id', 'sig'].some((name) => query.has(name))) return undefined;
  const request = new URLSearchParams();
  for (const name of query.keys) {
    for (const value of query.getAll(name)) request.append(name, value);
  }
  return request.toString();
}

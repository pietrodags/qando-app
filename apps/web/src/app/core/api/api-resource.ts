import { HttpErrorResponse, httpResource, type HttpResourceRef } from '@angular/common/http';
import {
  errorResponseOf,
  successBodyOf,
  urlOf,
  type Endpoint,
  type ErrorResponse,
  type ParamsOf,
  type SuccessBody,
} from '@qando/contracts';

type GetEndpoint = Endpoint & { readonly method: 'get' };

/** The path parameters, read in a reactive context: required exactly when the path has some. */
type ParamsArgument<E extends GetEndpoint> = E['params'] extends object
  ? [params: () => ParamsOf<E>]
  : [];

/**
 * Reads a GET endpoint of the contract. The value is its success body, checked against the
 * endpoint's schema, so a contract change breaks the build of every page that reads it.
 * An endpoint with path parameters takes them as a function, and is read again when they change.
 * Must run in an injection context, like `httpResource`.
 */
export function apiResource<E extends GetEndpoint>(
  endpoint: E,
  ...[params]: ParamsArgument<E>
): HttpResourceRef<SuccessBody<E> | undefined> {
  return httpResource(() => urlOf(endpoint, params?.() ?? ({} as ParamsOf<E>)), {
    parse: (body) => successBodyOf(endpoint, body),
  });
}

/**
 * The documented error answer behind a resource error, typed by its status; undefined when the
 * request never reached the API or the answer is not in the contract.
 */
export function apiError<E extends Endpoint>(
  endpoint: E,
  error: unknown,
): ErrorResponse<E> | undefined {
  return error instanceof HttpErrorResponse
    ? errorResponseOf(endpoint, error.status, error.error)
    : undefined;
}

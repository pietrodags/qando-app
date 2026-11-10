import { HttpErrorResponse } from '@angular/common/http';
import { computed, type Signal } from '@angular/core';
import { rateLimitedSchema } from '@qando/contracts';
import { secondsUntil } from './wait';

/**
 * How a request failed, as a page tells it: `failed` when trying again may work now; `limited`
 * when the API refused too many requests from this address, with the seconds still to wait.
 */
export type RequestFailure =
  { readonly kind: 'failed' } | { readonly kind: 'limited'; readonly seconds: number };

/**
 * Follows the error a request rejected or a resource failed with (null or undefined: none) as
 * the failure a page shows. A rate limit counts its `Retry-After` seconds down each second, from
 * the clock, so a tab whose timers were held back still shows the time left, and stays at 0;
 * a new error starts again. Must run in an injection context, whose end stops the count.
 */
export function requestFailure(error: () => unknown): Signal<RequestFailure | null> {
  const reported = computed<Reported | null>(() => {
    const current = error();
    if (current === null || current === undefined) return null;
    const seconds = retryAfter(current);
    return seconds === null
      ? { kind: 'failed' }
      : { kind: 'limited', until: Date.now() + seconds * 1000 };
  });
  const seconds = secondsUntil(() => {
    const shown = reported();
    return shown?.kind === 'limited' ? shown.until : null;
  });

  return computed<RequestFailure | null>(() => {
    const shown = reported();
    return shown?.kind === 'limited' ? { kind: 'limited', seconds: seconds() } : shown;
  });
}

/** A failure as reported: a limit by the clock time it ends at, in milliseconds. */
type Reported = { readonly kind: 'failed' } | { readonly kind: 'limited'; readonly until: number };

/** A rate limit with seconds left: sending again now would be refused. */
export function waiting(failure: RequestFailure | null): boolean {
  return failure?.kind === 'limited' && failure.seconds > 0;
}

/** The whole seconds a `429 RATE_LIMITED` asks to wait; null for any other error. */
function retryAfter(error: unknown): number | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 429) return null;
  if (!rateLimitedSchema.safeParse(error.error).success) return null;
  // A missing header reads 0, refused like any value that is not a whole number of seconds.
  const seconds = Number(error.headers.get('Retry-After'));
  return Number.isInteger(seconds) && seconds >= 1 ? seconds : null;
}

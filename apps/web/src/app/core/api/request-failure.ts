import { HttpErrorResponse } from '@angular/common/http';
import { computed, effect, signal, type Signal } from '@angular/core';
import { rateLimitedSchema } from '@qando/contracts';

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
  const now = signal(Date.now());

  effect((onCleanup) => {
    const shown = reported();
    if (shown?.kind !== 'limited') return;
    now.set(Date.now());
    const timer = setInterval(() => {
      now.set(Date.now());
      if (Date.now() >= shown.until) clearInterval(timer);
    }, 1000);
    onCleanup(() => {
      clearInterval(timer);
    });
  });

  return computed<RequestFailure | null>(() => {
    const shown = reported();
    if (shown?.kind !== 'limited') return shown;
    return { kind: 'limited', seconds: Math.max(0, Math.ceil((shown.until - now()) / 1000)) };
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

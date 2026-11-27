import { DestroyRef, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Session } from './session';
import { signInFrom } from './sign-in-return';

/**
 * Called in a private page's constructor: once `ended` says the session ended while the page was
 * open (the API answered 401), the header learns that the session has gone and the page goes to
 * the sign-in page, which comes back to `from`. Unless the user went elsewhere meanwhile (the
 * logo, "Cerrar sesión"): their choice stands.
 */
export function signInAgainOnceEnded(ended: () => boolean, from: string): void {
  const session = inject(Session);
  const router = inject(Router);
  let left = false;
  inject(DestroyRef).onDestroy(() => {
    left = true;
  });

  async function signInAgain(): Promise<void> {
    await session.refresh();
    if (left) return;
    await router.navigate(['/sign-in'], { queryParams: signInFrom(from) });
  }

  effect(() => {
    if (ended()) void signInAgain();
  });
}

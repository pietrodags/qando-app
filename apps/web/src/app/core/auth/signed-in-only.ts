import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { Session } from './session';
import { signInFrom } from './sign-in-return';

/**
 * Guard of the private pages: opens them for an account signed in; sends anyone else to the
 * sign-in page, which comes back to the page asked for once signed in.
 */
export const signedInOnly: CanActivateFn = async (_route, { url }) => {
  const router = inject(Router);
  const signedIn = await inject(Session).signedIn();
  return signedIn || router.createUrlTree(['/sign-in'], { queryParams: signInFrom(url) });
};

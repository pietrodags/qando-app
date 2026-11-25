import { DefaultUrlSerializer, type Params } from '@angular/router';

/** Where signing in leads when no page asked for it: "Mis eventos". */
const DEFAULT_TARGET = '/my-events';

const SIGN_IN_PATH = '/sign-in';

/**
 * The query of a link to the sign-in page from the page at `url` (path and query), so that
 * signing in comes back to it: nothing from the home page, and from the sign-in page its own
 * query, whole: what it was already asked, a page to come back to or an application's request
 * to connect.
 */
export function signInFrom(url: string): Params {
  const { pathname } = new URL(url, 'http://qando');
  if (pathname === '/') return {};
  return pathname === SIGN_IN_PATH
    ? new DefaultUrlSerializer().parse(url).queryParams
    : { returnTo: url };
}

/**
 * The page to open after signing in, from the sign-in page's `returnTo`: that page when it is
 * one of qando's other than the home and the sign-in pages, "Mis eventos" otherwise (an address
 * of another site is never followed).
 */
export function returnTarget(returnTo: string | undefined): string {
  // A path of this site: one slash, then anything but a second slash or a backslash.
  if (returnTo === undefined || !/^\/(?![/\\])/.test(returnTo)) return DEFAULT_TARGET;
  const { pathname } = new URL(returnTo, 'http://qando');
  return pathname === '/' || pathname === SIGN_IN_PATH ? DEFAULT_TARGET : returnTo;
}

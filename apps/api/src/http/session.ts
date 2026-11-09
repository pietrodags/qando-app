import type { CrossSiteSessionBody, ForeignPageBody } from '@qando/contracts';
import type { Request, RequestHandler, Response } from 'express';

/** What reading a request's session cookie found. */
export interface SessionRead {
  /** The signed-in account; undefined when the session expired or was signed out. */
  readonly accountId: string | undefined;
  /** `Set-Cookie` values to send back: the session's cookie renewed with a later expiry. */
  readonly renewedCookies: readonly string[];
}

/** Port to the organizers' sign-in sessions (Better Auth's, in `modules/auth`). */
export interface Sessions {
  /** Whether the request carries a session cookie at all, valid or not; costs no database work. */
  carried(headers: Request['headers']): Promise<boolean>;
  /** Whether a page of this origin is one of qando's own. */
  trusts(origin: string): Promise<boolean>;
  /** The account of the request's session cookie. */
  read(headers: Request['headers']): Promise<SessionRead>;
  /**
   * Deletes the request's session on the server, then answers the `Set-Cookie` values that clear
   * its cookies. Rejects when the session could not be deleted, so the browser keeps its cookie
   * and can retry; without a session it only clears the cookies.
   */
  end(headers: Request['headers']): Promise<readonly string[]>;
}

/** Methods that change nothing: a page of another site gains nothing by sending them. */
const readOnly = new Set(['GET', 'HEAD', 'OPTIONS']);

const accounts = new WeakMap<Request, string | undefined>();

/**
 * Refuses a change (any method but GET, HEAD and OPTIONS) that carries the session cookie from a
 * page of another site, or without an `Origin`, with `403 FORBIDDEN`, before the session is read:
 * the browser sends the cookie with any request, so only the origin tells qando's pages apart
 * (CSRF). A request without the cookie passes untouched.
 */
export function sessionOriginCheck(sessions: Sessions): RequestHandler {
  return async (request, response: Response<CrossSiteSessionBody>, next) => {
    const origin = request.headers.origin;
    if (
      !readOnly.has(request.method) &&
      (await sessions.carried(request.headers)) &&
      !(origin !== undefined && (await sessions.trusts(origin)))
    ) {
      response.set('Cache-Control', 'no-store');
      response.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'The session cannot be used from this origin',
          details: [],
        },
      });
      return;
    }
    next();
  };
}

/**
 * Refuses a request from a page of another site, or without `Origin`, with `403 FORBIDDEN`,
 * session cookie or not: for the routes that sign a browser in, where another site could sign
 * the person into an account of its own (login CSRF) or have codes sent from their browser.
 * Browsers send `Origin` with every POST, so qando's own pages always pass.
 */
export function ownPagesOnly(sessions: Sessions): RequestHandler {
  return async (request, response: Response<ForeignPageBody>, next) => {
    const origin = request.headers.origin;
    if (origin === undefined || !(await sessions.trusts(origin))) {
      response.set('Cache-Control', 'no-store');
      response.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only qando’s pages can sign in',
          details: [],
        },
      });
      return;
    }
    next();
  };
}

/**
 * Signs each request in as the account of its session cookie, read by `signedInAccount`, and
 * sends back the cookie renewed while reading it, or the browser keeps its old expiry. Runs
 * `sessionOriginCheck` first; a request without the cookie reads nothing.
 */
export function sessionReader(sessions: Sessions): RequestHandler[] {
  const read: RequestHandler = async (request, response, next) => {
    if (!(await sessions.carried(request.headers))) {
      next();
      return;
    }
    const { accountId, renewedCookies } = await sessions.read(request.headers);
    // Appending none sends no header.
    response.append('Set-Cookie', [...renewedCookies]);
    accounts.set(request, accountId);
    next();
  };
  return [sessionOriginCheck(sessions), read];
}

/** The account the request is signed in as, once `sessionReader` has read it. */
export function signedInAccount(request: Request): string | undefined {
  return accounts.get(request);
}

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
}

/** Methods that change nothing: a page of another site gains nothing by sending them. */
const readOnly = new Set(['GET', 'HEAD', 'OPTIONS']);

const accounts = new WeakMap<Request, string>();

interface CrossSiteBody {
  readonly error: { readonly code: 'FORBIDDEN'; readonly message: string; readonly details: [] };
}

/**
 * Signs each request in as the account of its session cookie, read by `signedInAccount`, and
 * sends back the cookie renewed while reading it, or the browser keeps its old expiry. A change
 * (any method but GET, HEAD and OPTIONS) that carries the session from a page of another site,
 * or without an `Origin`, is refused `403 FORBIDDEN` before the session is read: the cookie goes
 * along with any request the browser sends, so only the origin tells qando's pages apart (CSRF).
 */
export function sessionReader(sessions: Sessions): RequestHandler {
  return async (request, response: Response<CrossSiteBody>, next) => {
    if (!(await sessions.carried(request.headers))) {
      next();
      return;
    }
    const origin = request.headers.origin;
    if (
      !readOnly.has(request.method) &&
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
    const { accountId, renewedCookies } = await sessions.read(request.headers);
    if (renewedCookies.length > 0) response.append('Set-Cookie', [...renewedCookies]);
    if (accountId !== undefined) accounts.set(request, accountId);
    next();
  };
}

/** The account the request is signed in as, once `sessionReader` has read it. */
export function signedInAccount(request: Request): string | undefined {
  return accounts.get(request);
}

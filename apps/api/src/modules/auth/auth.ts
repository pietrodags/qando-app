// Sign-in by email code, through Better Auth on our own database (ADR 0004). This module is the
// only one that knows Better Auth: the rest of the API reads accounts and sessions through it.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getSessionCookie } from 'better-auth/cookies';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { emailOTP } from 'better-auth/plugins';
import { Router } from 'express';
import type { Database } from '../../db/database.js';
import { describeError, type ErrorLogEntry } from '../../http/error-boundary.js';
import type { Sessions } from '../../http/session.js';
import { accounts, sessions, users, verifications } from '../../db/schema.js';

export interface AuthDependencies {
  readonly db: Database;
  /** Signs the session cookies: at least 32 random characters, the same on every instance. */
  readonly secret: string;
  /**
   * The public address of qando's pages and API (`https://qando.app`): Better Auth builds its
   * URLs from it, trusts only pages of its origin, and marks the cookies `Secure` over HTTPS.
   */
  readonly baseURL: string;
  /**
   * Delivers a sign-in code to its email (already lowercase), once per code. Awaited: the request
   * answers once the email is handed over (there is no timing to hide: a code is sent whether the
   * account exists or not). Better Auth logs a rejected delivery and still answers success.
   */
  readonly sendSignInCode: (email: string, code: string) => Promise<void>;
  /** Writes what Better Auth reports: never its messages, only what `describeError` keeps. */
  readonly log: (entry: AuthLogEntry) => void;
}

/**
 * What the API logs of a warning or failure inside Better Auth: the level and what of the error
 * may be logged. Never Better Auth's message or its arguments: a failed query quotes its
 * parameters, among them a session token or an email (ADR 0012).
 */
export type AuthLogEntry = {
  readonly level: 'error' | 'warn';
  readonly message: 'Authentication problem';
} & Partial<Pick<ErrorLogEntry, 'error' | 'cause' | 'code' | 'stack'>>;

/** Names the cookies `qando.*` (`__Secure-qando.*` over HTTPS) instead of `better-auth.*`. */
const cookiePrefix = 'qando';

/** A session lasts 90 days from its last use (ADR 0004), renewed at most once a day. */
const sessionDays = 90;
const day = 24 * 60 * 60;

/**
 * Better Auth on qando's tables: codes of 6 digits, stored hashed, valid for 10 minutes and for
 * 5 wrong tries; a new code replaces the last one. The first code an email signs in with creates
 * its account, already verified. Only sign-in codes are sent: qando has no passwords to reset.
 * A session is an HttpOnly, SameSite=Lax cookie (Secure over HTTPS) that lasts 90 days from its
 * last use.
 */
export function createAuth({ db, secret, baseURL, sendSignInCode, log }: AuthDependencies) {
  return betterAuth({
    secret,
    baseURL,
    basePath: '/api/auth',
    logger: {
      level: 'warn',
      log: (level, _message, ...args: unknown[]) => {
        const error = args.find((arg) => arg instanceof Error);
        log({
          level: level === 'error' ? 'error' : 'warn',
          message: 'Authentication problem',
          ...(error !== undefined && describeError(error)),
        });
      },
    },
    session: { expiresIn: sessionDays * day, updateAge: day },
    advanced: {
      cookiePrefix,
      // Better Auth skips its Origin check when NODE_ENV is `test`: it is kept on everywhere, so
      // the tests check what production does.
      disableOriginCheck: false,
    },
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { users, sessions, accounts, verifications },
      usePlural: true,
      transaction: true,
    }),
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type === 'sign-in') await sendSignInCode(email, otp);
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * The sessions as the API reads them (the `Sessions` port): the cookie Better Auth signed, its
 * account, and the cookie renewed while reading it, which Better Auth's own routes send back but
 * a read from our routes only returns.
 */
export function sessionsOf(auth: Auth): Sessions {
  return {
    carried: (headers) =>
      Promise.resolve(getSessionCookie(fromNodeHeaders(headers), { cookiePrefix }) !== null),
    trusts: async (origin) => (await auth.$context).isTrustedOrigin(origin),
    read: async (headers) => {
      const { headers: answered, response } = await auth.api.getSession({
        headers: fromNodeHeaders(headers),
        returnHeaders: true,
      });
      return { accountId: response?.user.id, renewedCookies: answered.getSetCookie() };
    },
  };
}

/**
 * Better Auth's own routes that qando serves, each with Better Auth's Origin check and rate
 * limit: signing out (`POST /api/auth/sign-out`) deletes the session and clears its cookies.
 * Every other route of Better Auth stays unreachable (`404`): qando sends its codes itself.
 */
export function authRoutesOf(auth: Auth): Router {
  const router = Router();
  router.post('/api/auth/sign-out', toNodeHandler(auth));
  return router;
}

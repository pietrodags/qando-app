// Sign-in by email code, through Better Auth on our own database (ADR 0004). This module is the
// only one that knows Better Auth: the rest of the API reads accounts and sessions through it.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { isAPIError } from 'better-auth/api';
import { getSessionCookie } from 'better-auth/cookies';
import { fromNodeHeaders } from 'better-auth/node';
import { emailOTP } from 'better-auth/plugins';
import type { Database } from '../../db/database.js';
import type { SendEmail } from '../../email/email.js';
import { describeError, type ErrorLogEntry } from '../../http/error-boundary.js';
import type { Sessions } from '../../http/session.js';
import { accounts, sessions, users, verifications } from '../../db/schema.js';
import { signInCodeEmail } from './sign-in-code-email.js';
import type { SignInCodes, SignInOutcome } from './sign-in.js';

export interface AuthDependencies {
  readonly db: Database;
  /** Signs the session cookies: at least 32 random characters, the same on every instance. */
  readonly secret: string;
  /**
   * The public address of qando's pages and API (`https://qando.app`): Better Auth builds its
   * URLs from it, trusts only pages of its origin, and marks the cookies `Secure` over HTTPS.
   */
  readonly baseURL: string;
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
  readonly message: 'Authentication problem' | 'Sign-in code not delivered';
} & Partial<Pick<ErrorLogEntry, 'error' | 'cause' | 'code' | 'stack'>>;

/** Names the cookies `qando.*` (`__Secure-qando.*` over HTTPS) instead of `better-auth.*`. */
const cookiePrefix = 'qando';

/** Wrong tries a code allows; the next try, even with the right code, finds it void. */
const allowedAttempts = 5;

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
export function createAuth({ db, secret, baseURL, log }: AuthDependencies) {
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
        allowedAttempts,
        storeOTP: 'hashed',
        // None of Better Auth's routes is served: qando's own route creates the code and delivers
        // it (`signInCodesOf`), so a failed delivery reaches the page.
        sendVerificationOTP: () =>
          Promise.reject(new Error('Sign-in codes are delivered by qando’s own route')),
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * The sessions as the API reads and ends them (the `Sessions` port): the cookie Better Auth
 * signed, its account, the cookie renewed while reading it (which Better Auth's own routes send
 * back but a read from our routes only returns), and signing out. None of Better Auth's own
 * routes is served: qando's routes call it, behind their own Origin check.
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
    end: async (headers) => {
      const requestHeaders = fromNodeHeaders(headers);
      const signedIn = await auth.api.getSession({
        headers: requestHeaders,
        query: { disableRefresh: true },
      });
      // Deleted by us first: Better Auth's sign-out logs a failed deletion and still answers
      // success, which would leave the session usable with its old cookie.
      if (signedIn) {
        await (await auth.$context).internalAdapter.deleteSession(signedIn.session.token);
      }
      const { headers: answered } = await auth.api.signOut({
        headers: requestHeaders,
        returnHeaders: true,
      });
      return answered.getSetCookie();
    },
  };
}

/** What delivering sign-in codes needs besides Better Auth. */
export interface SignInCodeDelivery {
  readonly sendEmail: SendEmail;
  /** Writes a failed delivery: never its message, which may quote the address. */
  readonly log: (entry: AuthLogEntry) => void;
}

/**
 * Sign-in by email code as the API offers it (the `SignInCodes` port): Better Auth creates,
 * stores (hashed) and checks the codes; qando delivers them with its own email, greeting the
 * account by its stored name, and tells a wrong code with the tries left, which Better Auth keeps
 * but does not answer. Only a delivered code replaces the last one: after a failed delivery the
 * code the person already holds is still accepted, with its own tries and expiry.
 */
export function signInCodesOf(auth: Auth, { sendEmail, log }: SignInCodeDelivery): SignInCodes {
  return {
    send: async (email) => {
      const { internalAdapter } = await auth.$context;
      const lastDelivered = await internalAdapter.findVerificationValue(storedCodeOf(email));
      const code = await auth.api.createVerificationOTP({ body: { email, type: 'sign-in' } });
      const account = await internalAdapter.findUserByEmail(email);
      const content = signInCodeEmail({
        code,
        name: account?.user.name,
        siteUrl: auth.options.baseURL,
      });
      try {
        await sendEmail({ to: email, ...content });
        return 'sent';
      } catch (error) {
        log({ level: 'error', message: 'Sign-in code not delivered', ...describeError(error) });
        // A code nobody received is taken back, and the last delivered one stored again as it
        // was (its hash, wrong tries and expiry): the failed delivery changes nothing.
        await internalAdapter.deleteVerificationByIdentifier(storedCodeOf(email));
        if (lastDelivered) {
          await internalAdapter.createVerificationValue({
            identifier: storedCodeOf(email),
            value: lastDelivered.value,
            expiresAt: lastDelivered.expiresAt,
          });
        }
        return 'not-delivered';
      }
    },
    signIn: async (email, code) => {
      try {
        const { headers } = await auth.api.signInEmailOTP({
          body: { email, otp: code },
          returnHeaders: true,
        });
        return { status: 'signed-in', cookies: headers.getSetCookie() };
      } catch (error) {
        if (!isAPIError(error)) throw error;
        switch (error.body?.code) {
          case 'INVALID_OTP':
            return triesLeft(auth, email);
          case 'OTP_EXPIRED':
            return { status: 'expired' };
          case 'TOO_MANY_ATTEMPTS':
            return { status: 'too-many-attempts' };
          default:
            throw error;
        }
      }
    },
  };
}

/**
 * Where Better Auth stores an email's sign-in code, as `<hash>:<wrong tries>`. Its storage is not
 * a public interface: an upgrade that changes it fails loudly, here (`triesLeft`) and in the
 * integration tests, never with a wrong count or a lost code.
 */
const storedCodeOf = (email: string) => `sign-in-otp-${email}`;

/**
 * After a wrong code, the tries left: Better Auth keeps them with the stored code and answers
 * only that the code is wrong (owner, 2026-11-09). A wrong code with none stored means there is
 * no valid code.
 */
async function triesLeft(auth: Auth, email: string): Promise<SignInOutcome> {
  const { internalAdapter } = await auth.$context;
  const stored = await internalAdapter.findVerificationValue(storedCodeOf(email));
  if (!stored || stored.expiresAt.getTime() <= Date.now()) return { status: 'expired' };
  const tries = /^[^:]+:(\d+)$/.exec(stored.value)?.[1];
  if (tries === undefined) throw new Error('A stored sign-in code has an unknown format');
  const left = allowedAttempts - Number(tries);
  return left > 0 ? { status: 'wrong-code', attemptsLeft: left } : { status: 'too-many-attempts' };
}

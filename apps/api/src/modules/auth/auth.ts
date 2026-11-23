// Sign-in by email code, so nobody has a password to set or recover, through Better Auth on our
// own database, so accounts and sessions are tables of ours. This module is the only one that
// knows Better Auth: the rest of the API reads accounts and sessions through it.
import { runWithTransaction } from '@better-auth/core/context';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { isAPIError } from 'better-auth/api';
import { getSessionCookie } from 'better-auth/cookies';
import { fromNodeHeaders } from 'better-auth/node';
import { emailOTP } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/database.js';
import type { EmailContent, SendEmail } from '../../email/email.js';
import { describeError, type ErrorLogEntry } from '../../http/error-boundary.js';
import type { Sessions } from '../../http/session.js';
import { accounts, sessions, users, verifications } from '../../db/schema.js';
import type { AccountDeletion } from './account-deletion.js';
import { deleteAccount } from './delete-account.js';
import {
  deletionCodeEmail,
  signInCodeEmail,
  type SignInCodeEmailData,
} from './sign-in-code-email.js';
import type { CodeDelivery, CodeRefusal, SignInCodes } from './sign-in.js';

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
 * parameters, among them a session token or an email, and logs hold neither.
 */
export type AuthLogEntry = {
  readonly level: 'error' | 'warn';
  readonly message: 'Authentication problem' | 'Sign-in code not delivered';
} & Partial<Pick<ErrorLogEntry, 'error' | 'cause' | 'code' | 'stack'>>;

/** Names the cookies `qando.*` (`__Secure-qando.*` over HTTPS) instead of `better-auth.*`. */
const cookiePrefix = 'qando';

/** Wrong tries a code allows; the next try, even with the right code, finds it void. */
const allowedAttempts = 5;

/**
 * A session lasts 90 days from its last use, so an organizer who comes back now and then stays
 * signed in; it is renewed at most once a day.
 */
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
  const recordUse = async ({ userId, updatedAt }: { userId: string; updatedAt: Date }) => {
    await db.update(users).set({ lastSeenAt: updatedAt }).where(eq(users.id, userId));
  };
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
    // Better Auth copies the IP address and the browser of the request that signs in into the
    // session; qando never reads them and promises not to keep them, whatever route signs in.
    // A session created or renewed (at most once a day) is a use of its account, the date the
    // scheduled deletion reads (`deleteUnusedAccounts`).
    databaseHooks: {
      session: {
        create: {
          before: () => Promise.resolve({ data: { ipAddress: '', userAgent: '' } }),
          after: recordUse,
        },
        update: { after: recordUse },
      },
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
      const user = response?.user;
      return {
        account: user && { id: user.id, name: user.name, email: user.email },
        renewedCookies: answered.getSetCookie(),
      };
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

/** What the email codes need besides Better Auth. */
export interface EmailCodeDependencies {
  /** Where an account is deleted with everything it owns. */
  readonly db: Database;
  readonly sendEmail: SendEmail;
  /** Writes a failed delivery: never its message, which may quote the address. */
  readonly log: (entry: AuthLogEntry) => void;
}

/** The ports that take a code sent to an account's email. */
export interface EmailCodes {
  readonly signInCodes: SignInCodes;
  readonly accountDeletion: AccountDeletion;
}

/**
 * Codes sent by email as the API offers them, to sign in (the `SignInCodes` port) and to delete
 * an account (the `AccountDeletion` port): Better Auth creates, stores (hashed) and checks the
 * codes; qando delivers them with its own emails, greeting the account by its stored name, and
 * tells a wrong code with the tries left, which Better Auth keeps but does not answer. An email
 * has one stored code, whatever it was sent for, and only a delivered code replaces the last
 * one: until the new one is delivered, and after a delivery that failed, the code the person
 * already holds is the one accepted, with its own tries and expiry.
 */
export function emailCodesOf(
  auth: Auth,
  { db, sendEmail, log }: EmailCodeDependencies,
): EmailCodes {
  const inTurns = inTurnsPerKey();

  /** Creates a code for the email and delivers it in the email `write` makes of it. */
  const deliver = async (
    email: string,
    write: (data: SignInCodeEmailData) => EmailContent,
  ): Promise<CodeDelivery> => {
    const { internalAdapter, adapter } = await auth.$context;
    const stored = storedCodeOf(email);
    /** Leaves this as the email's one stored code, exactly as it was read. */
    const store = async (code: { readonly value: string; readonly expiresAt: Date } | null) => {
      await internalAdapter.deleteVerificationByIdentifier(stored);
      if (code) {
        await internalAdapter.createVerificationValue({
          identifier: stored,
          value: code.value,
          expiresAt: code.expiresAt,
        });
      }
    };

    // Better Auth can only create a code by storing it, beside the older ones, and reads the
    // one stored latest, to the millisecond. So the new code is created alone, set aside as
    // stored, and the last delivered one put back while the email is on its way: tries are
    // checked against the code the person holds, and a failed delivery has nothing to undo.
    // Each swap of the stored code is one transaction, and an email's swaps run in turns: a
    // database failure midway leaves the code that was stored, and two sends of one email
    // (a slow one may still be on its way when the next is granted) never mix their steps,
    // nor with a try of the code, which takes its turn too.
    const swap = <T>(steps: () => Promise<T>) =>
      inTurns(email, () => runWithTransaction(adapter, steps));
    const { code, created } = await swap(async () => {
      const lastDelivered = await internalAdapter.findVerificationValue(stored);
      await internalAdapter.deleteVerificationByIdentifier(stored);
      const code = await auth.api.createVerificationOTP({ body: { email, type: 'sign-in' } });
      const created = await internalAdapter.findVerificationValue(stored);
      if (!created) throw new Error('The code just created is not stored');
      await store(lastDelivered);
      return { code, created };
    });

    const account = await internalAdapter.findUserByEmail(email);
    const content = write({ code, name: account?.user.name, siteUrl: auth.options.baseURL });
    try {
      await sendEmail({ to: email, ...content });
    } catch (error) {
      log({ level: 'error', message: 'Sign-in code not delivered', ...describeError(error) });
      return 'not-delivered';
    }
    await swap(() => store(created));
    return 'sent';
  };

  /**
   * Runs `attempt`, which tries the email's code, in the email's turn (a try never meets a
   * stored code half swapped), and answers why a code was not taken.
   */
  const tryCode = <T>(email: string, attempt: () => Promise<T>): Promise<T | CodeRefusal> =>
    inTurns(email, async () => {
      try {
        return await attempt();
      } catch (error) {
        if (!isAPIError(error)) throw error;
        switch (error.body?.code) {
          case 'INVALID_OTP':
            return triesLeft(auth, email);
          case 'OTP_EXPIRED':
            return { status: 'expired' } as const;
          case 'TOO_MANY_ATTEMPTS':
            return { status: 'too-many-attempts' } as const;
          default:
            throw error;
        }
      }
    });

  /** The email of the account; none once it is gone. */
  const emailOf = async (accountId: string) =>
    (await (await auth.$context).internalAdapter.findUserById(accountId))?.email;

  return {
    signInCodes: {
      send: (email) => deliver(email, signInCodeEmail),
      signIn: (email, code, name) =>
        tryCode(email, async () => {
          // Better Auth gives the name only to an account it creates.
          const { headers } = await auth.api.signInEmailOTP({
            body: { email, otp: code, ...(name !== undefined && { name }) },
            returnHeaders: true,
          });
          return { status: 'signed-in', cookies: headers.getSetCookie() } as const;
        }),
    },
    accountDeletion: {
      sendCode: async (accountId) => {
        const email = await emailOf(accountId);
        if (email === undefined) throw new Error('The account to send a deletion code to is gone');
        return deliver(email, deletionCodeEmail);
      },
      delete: async (accountId, code) => {
        const email = await emailOf(accountId);
        if (email === undefined) return { status: 'deleted' };
        return tryCode(email, async () => {
          // Checks the code and counts a wrong try, leaving it stored: the deletion uses it up.
          await auth.api.checkVerificationOTP({ body: { email, type: 'sign-in', otp: code } });
          await deleteAccount(db, accountId, storedCodeOf(email));
          return { status: 'deleted' } as const;
        });
      },
    },
  };
}

/**
 * Runs the work of one key in turns, in the order asked; other keys do not wait. A failed turn
 * does not stop the next. Lives in memory: the API runs as one instance.
 */
function inTurnsPerKey() {
  /** Each key's last turn, settled or not; forgotten once nothing waits behind it. */
  const last = new Map<string, Promise<void>>();
  return <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const turn = (last.get(key) ?? Promise.resolve()).then(work);
    const settled = turn.then(
      () => undefined,
      () => undefined,
    );
    last.set(key, settled);
    void settled.then(() => {
      if (last.get(key) === settled) last.delete(key);
    });
    return turn;
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
async function triesLeft(auth: Auth, email: string): Promise<CodeRefusal> {
  const { internalAdapter } = await auth.$context;
  const stored = await internalAdapter.findVerificationValue(storedCodeOf(email));
  // The system's clock, never the API's injectable one: Better Auth wrote this expiry from the
  // system's clock and checks it against it, and this must answer as the library would.
  if (!stored || stored.expiresAt.getTime() <= Date.now()) return { status: 'expired' };
  const tries = /^[^:]+:(\d+)$/.exec(stored.value)?.[1];
  if (tries === undefined) throw new Error('A stored sign-in code has an unknown format');
  const left = allowedAttempts - Number(tries);
  return left > 0 ? { status: 'wrong-code', attemptsLeft: left } : { status: 'too-many-attempts' };
}

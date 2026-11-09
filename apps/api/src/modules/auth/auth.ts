// Sign-in by email code, through Better Auth on our own database (ADR 0004). This module is the
// only one that knows Better Auth: the rest of the API reads accounts and sessions through it.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import type { Database } from '../../db/database.js';
import { accounts, sessions, users, verifications } from '../../db/schema.js';

export interface AuthDependencies {
  readonly db: Database;
  /** Signs the session cookies: at least 32 random characters, the same on every instance. */
  readonly secret: string;
  /** The API's public address (`https://qando.app`), which Better Auth builds its URLs from. */
  readonly baseURL: string;
  /**
   * Delivers a sign-in code to its email (already lowercase), once per code. Awaited: the request
   * answers once the email is handed over (there is no timing to hide: a code is sent whether the
   * account exists or not). Better Auth logs a rejected delivery and still answers success.
   */
  readonly sendSignInCode: (email: string, code: string) => Promise<void>;
}

/**
 * Better Auth on qando's tables: codes of 6 digits, stored hashed, valid for 10 minutes and for
 * 5 wrong tries; a new code replaces the last one. The first code an email signs in with creates
 * its account, already verified. Only sign-in codes are sent: qando has no passwords to reset.
 */
export function createAuth({ db, secret, baseURL, sendSignInCode }: AuthDependencies) {
  return betterAuth({
    secret,
    baseURL,
    basePath: '/api/auth',
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

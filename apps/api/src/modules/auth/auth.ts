// Sign-in by email code, so nobody has a password to set or recover, through Better Auth on our
// own database, so accounts and sessions are tables of ours. This module is the only one that
// knows Better Auth: the rest of the API reads accounts and sessions through it.
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { runWithTransaction } from '@better-auth/core/context';
import { mcp } from '@better-auth/mcp';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { isAPIError } from 'better-auth/api';
import { getSessionCookie } from 'better-auth/cookies';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { emailOTP, jwt } from 'better-auth/plugins';
import type { RequestHandler } from 'express';
import type { Database } from '../../db/database.js';
import type { SendEmail } from '../../email/email.js';
import { describeError, type ErrorLogEntry } from '../../http/error-boundary.js';
import type { Sessions } from '../../http/session.js';
import {
  accounts,
  oauthAccessTokens,
  oauthClientAssertions,
  oauthClientResources,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  oauthResources,
  sessions,
  signingKeys,
  users,
  verifications,
} from '../../db/schema.js';
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
  /**
   * PROTOTYPE: whether an application may register itself without a metadata document of its
   * own (anyone can, with any name); off, only applications that publish one are accepted.
   */
  readonly openRegistration?: boolean;
}

/** PROTOTYPE: what an assistant may be allowed to do with an organizer's events. */
export const agentScopes = { read: 'events:read', manage: 'events:manage' } as const;

/** PROTOTYPE: the address assistants call, which access tokens are issued for. */
export const mcpResourceOf = (baseURL: string) => `${baseURL}/api/mcp`;

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
export function createAuth({
  db,
  secret,
  baseURL,
  log,
  openRegistration = false,
}: AuthDependencies) {
  return betterAuth({
    secret,
    baseURL,
    basePath: '/api/auth',
    // The token signing plugin's own route (a token of the session), never the OAuth one.
    disabledPaths: ['/token'],
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
      schema: {
        users,
        sessions,
        accounts,
        verifications,
        jwkss: signingKeys,
        oauthClients,
        oauthResources,
        oauthClientResources,
        oauthRefreshTokens,
        oauthAccessTokens,
        oauthConsents,
        oauthClientAssertions,
      },
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
      // PROTOTYPE: an assistant asks an organizer for access to their events (OAuth 2.1). Access
      // tokens are signed, bound to the MCP address and last 5 minutes; the refresh token lasts
      // beyond the session (`offline_access`).
      jwt({ disableSettingJwtHeader: true }),
      mcp({
        loginPage: '/sign-in',
        consentPage: '/connect',
        resource: mcpResourceOf(baseURL),
        scopes: [agentScopes.read, agentScopes.manage, 'offline_access'],
        grantTypes: ['authorization_code', 'refresh_token'],
        accessTokenExpiresIn: 5 * 60,
        allowDynamicClientRegistration: openRegistration,
        allowUnauthenticatedClientRegistration: openRegistration,
        clientRegistrationDefaultApplicationType: 'infer',
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** PROTOTYPE: the only routes of Better Auth that are served, all of the OAuth provider. */
const servedRoutes = new Set([
  'GET /api/auth/oauth2/authorize',
  'POST /api/auth/oauth2/token',
  'POST /api/auth/oauth2/register',
  'POST /api/auth/oauth2/revoke',
  'POST /api/auth/oauth2/consent',
  'GET /api/auth/oauth2/public-client',
  'GET /api/auth/jwks',
  // Where applications look for the authorization server and the protected address.
  'GET /.well-known/oauth-authorization-server/api/auth',
  'GET /.well-known/oauth-protected-resource',
  'GET /.well-known/oauth-protected-resource/api/mcp',
]);

/**
 * PROTOTYPE: serves the OAuth routes an assistant and the consent page need, straight from
 * Better Auth, and nothing else of it. Mounted before any body is read: the token route takes a
 * form.
 */
export function agentAccessRoutes(
  auth: Auth,
  log: (entry: Record<string, unknown>) => void,
): RequestHandler {
  const handler = toNodeHandler(auth);
  return (request, response, next) => {
    const method = request.method === 'HEAD' ? 'GET' : request.method;
    if (!servedRoutes.has(`${method} ${request.path}`)) {
      next();
      return;
    }
    response.on('finish', () => {
      log({
        spike: 'oauth',
        route: `${request.method} ${request.path}`,
        status: response.statusCode,
        client:
          typeof request.query['client_id'] === 'string' ? request.query['client_id'] : undefined,
        agent: request.headers['user-agent'],
      });
    });
    void handler(request, response);
  };
}

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
 * but does not answer. Only a delivered code replaces the last one, and an email has one stored
 * code: until the new one is delivered, and after a delivery that failed, the code the person
 * already holds is the one accepted, with its own tries and expiry.
 */
export function signInCodesOf(auth: Auth, { sendEmail, log }: SignInCodeDelivery): SignInCodes {
  const inTurns = inTurnsPerKey();
  return {
    send: async (email) => {
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
        if (!created) throw new Error('The sign-in code just created is not stored');
        await store(lastDelivered);
        return { code, created };
      });

      const account = await internalAdapter.findUserByEmail(email);
      const content = signInCodeEmail({
        code,
        name: account?.user.name,
        siteUrl: auth.options.baseURL,
      });
      try {
        await sendEmail({ to: email, ...content });
      } catch (error) {
        log({ level: 'error', message: 'Sign-in code not delivered', ...describeError(error) });
        return 'not-delivered';
      }
      await swap(() => store(created));
      return 'sent';
    },
    // In the same turns as the swaps: a try never meets a stored code half swapped.
    signIn: (email, code, name, oauthQuery) =>
      inTurns(email, async () => {
        try {
          // Better Auth gives the name only to an account it creates.
          // PROTOTYPE: with the signed query of an application's request, Better Auth goes on
          // with it once signed in and answers where the browser continues, instead of the
          // account. It only does with headers given, even empty ones.
          const { headers, response } = await auth.api.signInEmailOTP({
            body: {
              email,
              otp: code,
              ...(name !== undefined && { name }),
              ...(oauthQuery !== undefined && { oauth_query: oauthQuery }),
            },
            headers: new Headers(),
            returnHeaders: true,
          });
          const answered: unknown = response;
          const continueTo =
            typeof answered === 'object' &&
            answered !== null &&
            'url' in answered &&
            typeof answered.url === 'string'
              ? answered.url
              : undefined;
          return {
            status: 'signed-in',
            cookies: headers.getSetCookie(),
            ...(continueTo !== undefined && { continueTo }),
          };
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
      }),
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
async function triesLeft(auth: Auth, email: string): Promise<SignInOutcome> {
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

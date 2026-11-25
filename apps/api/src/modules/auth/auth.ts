// Sign-in by email code, so nobody has a password to set or recover, through Better Auth on our
// own database, so accounts and sessions are tables of ours. This module is the only one that
// knows Better Auth: the rest of the API reads accounts and sessions through it.
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { runWithTransaction } from '@better-auth/core/context';
import { mcp } from '@better-auth/mcp';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, isAPIError } from 'better-auth/api';
import { getSessionCookie } from 'better-auth/cookies';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { emailOTP, jwt } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { Router, type RequestHandler } from 'express';
import type { Database } from '../../db/database.js';
import type { EmailContent, SendEmail } from '../../email/email.js';
import { describeError, type ErrorLogEntry } from '../../http/error-boundary.js';
import { requestLimit } from '../../http/rate-limit.js';
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
import type { AccountDeletion } from './account-deletion.js';
import { deleteAccount } from './delete-account.js';
import {
  deletionCodeEmail,
  signInCodeEmail,
  type SignInCodeEmailData,
} from './sign-in-code-email.js';
import type { CodeDelivery, CodeRefusal, SignInCodes } from './sign-in.js';
import { wholeRequests } from './whole-requests.js';

export interface AuthDependencies {
  readonly db: Database;
  /** Signs the session cookies: at least 32 random characters, the same on every instance. */
  readonly secret: string;
  /**
   * The public address of qando's pages and API (`https://qando.app`): Better Auth builds its
   * URLs from it, trusts only pages of its origin, and marks the cookies `Secure` over HTTPS.
   * HTTPS, or HTTP on this computer (`http://localhost:4200`): tokens are issued for an address
   * under it, and Better Auth takes no other, so `createAuth` throws.
   */
  readonly baseURL: string;
  /** Writes what Better Auth reports: never its messages, only what `describeError` keeps. */
  readonly log: (entry: AuthLogEntry) => void;
  /**
   * Reads the document an application publishes about itself at its own address. Left out, it
   * is the library's own transport: HTTPS only, public addresses only, redirects never followed.
   * Tests give their own, so nothing leaves the computer.
   */
  readonly fetchApplicationDocument?: ApplicationDocumentFetch;
}

type ApplicationDocumentFetch = Parameters<typeof cimd>[0]['fetchClientMetadataResource'];

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

/** Where Better Auth's own routes hang from, and so the path of the authorization server. */
const basePath = '/api/auth';

/** The path of the connector, the address assistants call. */
const connectorPath = '/api/mcp';

/** Where an application exchanges its code for tokens, and renews them. */
const tokenPath = `${basePath}/oauth2/token`;

/** Where an application hands back a refresh token it no longer needs. */
const handBackPath = `${basePath}/oauth2/revoke`;

/** The routes whose requests are whole (`createAuth`): those that give or take a refresh token. */
const wholePaths = new Set([tokenPath, handBackPath]);

/**
 * What an account may allow an application: to read its events, to create and manage them, and
 * to keep its access while the organizer is away (without `offline_access` no refresh token is
 * issued). No `openid`: qando is not an identity provider.
 */
const applicationScopes = ['events:read', 'events:manage', 'offline_access'];

/**
 * Better Auth on qando's tables: codes of 6 digits, stored hashed, valid for 10 minutes and for
 * 5 wrong tries; a new code replaces the last one. The first code an email signs in with creates
 * its account, already verified. Only sign-in codes are sent: qando has no passwords to reset.
 * A session is an HttpOnly, SameSite=Lax cookie (Secure over HTTPS) that lasts 90 days from its
 * last use. Its OAuth provider is installed too, with which an account allows an application
 * (an AI assistant) to act for it: when it starts it stores what tokens are issued for, and
 * nothing else until a route asks. Which of its routes are served, `authorizationServerOf` says.
 *
 * A token request is whole (`wholeRequests`) from the moment it reads its code or its refresh
 * token: the refresh token it uses up, the one it gives and the use of the account are kept
 * together or not at all, so one that fails midway can be sent again. Better Auth writes them
 * one by one, and left alone a failure between two would use the refresh token (or the code) up
 * with nothing in its place. Renewals of the same refresh token take turns, so two sent at once
 * (two workers of an assistant that find the access expired) are both answered with the same
 * tokens: left alone both read the refresh token as unused, and the one that loses is refused
 * as if the connection were gone. An application that signs its requests presents a proof with
 * each, taken once: Better Auth records it as used while it identifies the application, before
 * the request is whole, so left alone the proof of a request that failed midway stays used and
 * the same request, sent again, is refused. Here it is held back and recorded as the request
 * reads its code or its refresh token, with what the request gives: one presented twice is
 * refused there, and a request answered before it gets there records its proof as it ends,
 * unless it is undone.
 *
 * A request that hands a refresh token back is whole in the same way, from the moment it reads
 * that token: the token marked as handed back and the proof of a request that signs are kept
 * together or not at all, so one that fails midway can be sent again too, and it takes its turn
 * with a renewal of the same token. Better Auth catches a failure of the database on that route
 * and answers a bare fault: the request then fails as the database did (`wholeRequests`), and
 * the API answers and logs it as any other. Only these two routes (`wholePaths`): theirs are
 * the writes that cost an application its connection, or leave it one it gave up, and every
 * wait of theirs for another server goes through `fetchApplicationDocument`, before which the
 * request gives its connection back.
 *
 * What Better Auth stores once and remembers in memory as stored is never part of a whole
 * request, where a failure would undo it and leave the memory wrong. An application's document
 * is stored before the request reads its code or its refresh token, so at once. What tokens are
 * issued for is stored as Better Auth starts, and `started` fails if it is not: Better Auth
 * would otherwise store it inside the first request that looks for it.
 */
export function createAuth({
  db,
  secret,
  baseURL,
  log,
  fetchApplicationDocument = fetchClientMetadataResource,
}: AuthDependencies) {
  const whole = wholeRequests(db);
  /** The address assistants will call, which access tokens are issued for. */
  const issuedFor = `${baseURL}${connectorPath}`;
  const recordUse = async ({ userId, updatedAt }: { userId: string; updatedAt: Date }) => {
    await whole.write((queries) =>
      queries.update(users).set({ lastSeenAt: updatedAt }).where(eq(users.id, userId)),
    );
  };
  const auth = betterAuth({
    secret,
    baseURL,
    basePath,
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
    // A failure inside one of Better Auth's routes is thrown to the API, which answers and logs
    // it as any other: left to Better Auth it is printed whole, with the query that failed and
    // its values, and answered with an empty body.
    onAPIError: { throw: true },
    // Better Auth's own limit per address, which it turns on in production alone, stays off: it
    // reads no client address behind the hosting's proxies, so it would count every caller as
    // one. The routes of Better Auth that are served are limited by the API's own count
    // (`authorizationServerOf`), which reads the address as every other limit does.
    rateLimit: { enabled: false },
    advanced: {
      cookiePrefix,
      // Better Auth skips its Origin check when NODE_ENV is `test`: it is kept on everywhere, so
      // the tests check what production does.
      disableOriginCheck: false,
    },
    // Better Auth copies the IP address and the browser of the request that signs in into the
    // session; qando never reads them and promises not to keep them, whatever route signs in.
    // A session created or renewed (at most once a day) is a use of its account, the date the
    // scheduled deletion reads (`deleteUnusedAccounts`). So is a token given to an application
    // or renewed by it, recorded where the provider is set up below.
    databaseHooks: {
      session: {
        create: {
          before: () => Promise.resolve({ data: { ipAddress: '', userAgent: '' } }),
          after: recordUse,
        },
        update: { after: recordUse },
      },
    },
    database: whole.adapter(
      (queries) =>
        drizzleAdapter(queries, {
          provider: 'pg',
          // Every table of every plugin, each under its model's name in the plural (`jwkss` for the
          // signing keys' `jwks`): with one missing, Better Auth fails whatever it is asked.
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
      // What a request takes, by Better Auth's names: its code, or its refresh token, which
      // it asks for by its `token` to renew its access or to hand the token back. Requests for
      // the same refresh token take turns: each asks for its one turn before it writes, so none
      // waits for a request that waits for it.
      [{ model: 'verification' }, { model: 'oauthRefreshToken', inTurnsBy: 'token' }],
      // The proof an application that signs its requests presents, recorded so that it is
      // taken once. Better Auth records it while it identifies the application, before the
      // request reads its code or its refresh token: held back until then, it is recorded with
      // what the request gives, and one presented twice is refused as Better Auth refuses it.
      {
        model: 'oauthClientAssertion',
        storedAlready: () =>
          new APIError('BAD_REQUEST', {
            error: 'invalid_client',
            error_description: 'client assertion jti has already been used',
          }),
      },
    ),
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts,
        storeOTP: 'hashed',
        // None of Better Auth's sign-in routes is served: qando's own route creates the code and
        // delivers it (`emailCodesOf`), so a failed delivery reaches the page.
        sendVerificationOTP: () =>
          Promise.reject(new Error('Sign-in codes are delivered by qando’s own route')),
      }),
      // What an account allows an application (an AI assistant) to act for it with: Better
      // Auth's OAuth provider, its signed access tokens, and applications that say who they are
      // with a document at an address of their own instead of registering, which stays off.
      // Reading a session signs no token for the browser: only applications get tokens.
      jwt({ disableSettingJwtHeader: true }),
      mcp({
        loginPage: '/sign-in',
        consentPage: '/connect',
        resource: issuedFor,
        scopes: applicationScopes,
        // An application connects for an account and renews its access; none acts on its own.
        grantTypes: ['authorization_code', 'refresh_token'],
        // An access token lasts an hour, and the application renews it without the organizer.
        accessTokenExpiresIn: 60 * 60,
        // A refresh token lasts 30 days from its last use: each renewal replaces it and starts
        // the 30 days again, so an application unused for that long must connect again.
        refreshTokenExpiresIn: 30 * day,
        // Better Auth's only call each time a token is given or renewed, with the account at
        // hand: using qando through an assistant is a use of the account too. It adds nothing
        // to the answer.
        customTokenResponseFields: async ({ user }) => {
          if (user) await recordUse({ userId: user.id, updatedAt: new Date() });
          return {};
        },
      }),
      cimd({
        fetchClientMetadataResource: (...asked) =>
          whole.waiting(async () => fetchApplicationDocument(...asked)),
        // The rules assistants' connectors follow: a document must say the application's name
        // and where it returns to, or the application is refused.
        metadataProfile: 'mcp-2026-07-28',
      }),
    ],
  });
  const wholeRequest = whole.asOne(auth.handler);
  return {
    ...auth,
    handler: (request: Request) =>
      wholePaths.has(new URL(request.url).pathname) ? wholeRequest(request) : auth.handler(request),
    /**
     * Resolves once Better Auth has started with what tokens are issued for stored, and fails if
     * it is not stored: the API waits for it before it serves any request.
     */
    started: async (): Promise<void> => {
      await auth.$context;
      const stored = await db
        .select({ id: oauthResources.id })
        .from(oauthResources)
        .where(eq(oauthResources.identifier, issuedFor));
      if (stored.length === 0) throw new Error('What tokens are issued for is not stored');
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * The sessions as the API reads and ends them (the `Sessions` port): the cookie Better Auth
 * signed, its account, the cookie renewed while reading it (which Better Auth's own routes send
 * back but a read from our routes only returns), and signing out. None of Better Auth's own
 * session routes is served: qando's routes call it, behind their own Origin check.
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

/**
 * The authorization server an application (an AI assistant) is allowed to act for an account
 * through, as the API serves it. Only the routes listed here, by method and exact path, are
 * handed to Better Auth: any other request goes on, so none of its other routes is served, nor
 * one an upgrade adds. The server's metadata is a document of ours: Better Auth's always
 * announces an address to introspect tokens, which is not served, and never qando's policy and
 * terms, which are the privacy page. A client address may send these routes 60 requests a
 * minute, counted together and refused past them with `429 RATE_LIMITED` like every limit of the
 * API, whose count this is: Better Auth's own is off (`createAuth`). Mounted before any body is
 * read: the token route takes a form, which Better Auth reads itself.
 */
export function authorizationServerOf(auth: Auth): RequestHandler {
  const privacyPage = `${auth.options.baseURL}/privacy`;
  const betterAuth = toNodeHandler(auth);
  const routeOf = ({ method, path }: { method: string; path: string }) => `${method} ${path}`;
  return Router().use(
    // Any other request leaves here for the rest of the API, uncounted.
    (request, _response, next) => {
      const route = routeOf(request);
      next(route === metadataRoute || servedRoutes.has(route) ? undefined : 'router');
    },
    requestLimit({ limit: requestsPerMinute, windowMs: 60_000 }),
    async (request, response) => {
      if (routeOf(request) !== metadataRoute) {
        await betterAuth(request, response);
        return;
      }
      const described = await auth.api.getOAuthServerConfig();
      response.json({
        ...Object.fromEntries(
          Object.entries(described).filter(([key]) => !key.startsWith('introspection_')),
        ),
        op_policy_uri: privacyPage,
        op_tos_uri: privacyPage,
      });
    },
  );
}

/**
 * Requests one client address may send to the authorization server in a minute, counted together
 * over its routes, as on the endpoints a link or token opens. An assistant calls the token route
 * from its own servers, so the organizers who use one assistant share its addresses' counts.
 */
const requestsPerMinute = 60;

/**
 * The metadata of the authorization server, where an application looks for it when the server's
 * address has a path: the path goes after the well-known one.
 */
const metadataRoute = `GET /.well-known/oauth-authorization-server${basePath}`;

/** The routes of Better Auth that are served. */
const servedRoutes = new Set([
  // Connecting: the request to connect, the account's answer on the consent page, and the code
  // exchanged for tokens, which is also where they are renewed.
  `GET ${basePath}/oauth2/authorize`,
  `POST ${basePath}/oauth2/consent`,
  `POST ${tokenPath}`,
  // An application hands back a refresh token it no longer needs.
  `POST ${handBackPath}`,
  // The public keys access tokens are signed with.
  `GET ${basePath}/jwks`,
  // The connector's metadata, where an application looks for it: with the connector's path
  // after the well-known one, or without it.
  'GET /.well-known/oauth-protected-resource',
  `GET /.well-known/oauth-protected-resource${connectorPath}`,
]);

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
        if (email === undefined) return { status: 'deleted', events: 0 };
        return tryCode(email, async () => {
          // Checks the code and counts a wrong try, leaving it stored: the deletion uses it up.
          await auth.api.checkVerificationOTP({ body: { email, type: 'sign-in', otp: code } });
          const events = await deleteAccount(db, accountId, storedCodeOf(email));
          return { status: 'deleted', events } as const;
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

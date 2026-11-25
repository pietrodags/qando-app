import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import type { Express } from 'express';
import request, { type Response as Answer } from 'supertest';
import type { AuthDependencies } from '../modules/auth/auth.js';

/** An application (an AI assistant) as qando knows it: by the document it publishes. */
export interface PublishedApplication {
  /** The address its document is published at, which is also how it names itself. */
  readonly address: string;
  /** Where it asks the browser to be sent back to once the account has answered. */
  readonly redirectUri: string;
  /**
   * Only an application that signs its requests has it: a proof of who it is, signed now with
   * its key for the qando it was published to, good for a minute and for one request: one sent
   * to the token route unless `presentedAt` says another.
   */
  readonly proof?: (presentedAt?: ProofAudience) => string;
}

/**
 * Where a proof says it is presented: the route tokens are given at, the one a refresh token is
 * handed back at, or the authorization server, which every route of it takes.
 */
export type ProofAudience = 'token' | 'revoke' | 'server';

/** An application that signs its requests with a key of its own, as ChatGPT does. */
export interface SigningApplication extends PublishedApplication {
  readonly proof: (presentedAt?: ProofAudience) => string;
}

/**
 * The network between qando and the applications, in memory: the documents applications publish
 * about themselves, and the fetch that reads them, so nothing leaves the computer.
 */
export interface PublishedApplications {
  /** Publishes a well-formed application with this name at an address of its own. */
  publish(name: string): PublishedApplication;
  /**
   * Publishes an application that signs its token requests to the qando at `origin`: its
   * document says so and where its public key is read, at an address beside it that the fetch
   * answers too.
   */
  publishSigning(name: string, origin: string): SigningApplication;
  /** Publishes a document exactly as written: a broken one, or one shaped like a real assistant's. */
  publishDocument(address: string, document: unknown): void;
  /**
   * The fetch to give `createAuth`: answers the document published at an address (`200`, JSON)
   * and `404` for any other.
   */
  readonly fetch: NonNullable<AuthDependencies['fetchApplicationDocument']>;
  /** Every address the fetch was asked for, in order. */
  readonly asked: readonly string[];
  /**
   * Holds the next fetch of the address until `release` is called: `reached` resolves once it
   * has started, as a document on its way over the network.
   */
  hold(address: string): HeldFetch;
}

/** A fetch held on its way (`PublishedApplications.hold`). */
export interface HeldFetch {
  readonly reached: Promise<void>;
  release(): void;
}

export function publishedApplications(): PublishedApplications {
  const documents = new Map<string, string>();
  const asked: string[] = [];
  /** For each address held, what its next fetch waits for once it has started. */
  const held = new Map<string, { started: () => void; released: Promise<void> }>();
  return {
    publish: (name) => {
      // A name under `.example` is public for the sign-in library and belongs to nobody.
      const host = `${randomUUID()}.example`;
      const application = {
        address: `https://${host}/client.json`,
        redirectUri: `https://${host}/callback`,
      };
      documents.set(
        application.address,
        JSON.stringify({
          client_id: application.address,
          client_name: name,
          redirect_uris: [application.redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      );
      return application;
    },
    publishSigning: (name, origin) => {
      const host = `${randomUUID()}.example`;
      const address = `https://${host}/client.json`;
      const redirectUri = `https://${host}/callback`;
      const keysAddress = `https://${host}/jwks.json`;
      const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const kid = randomUUID();
      documents.set(
        address,
        JSON.stringify({
          client_id: address,
          client_name: name,
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'private_key_jwt',
          token_endpoint_auth_signing_alg: 'ES256',
          jwks_uri: keysAddress,
        }),
      );
      documents.set(
        keysAddress,
        JSON.stringify({
          keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' }],
        }),
      );
      const encoded = (part: unknown) => Buffer.from(JSON.stringify(part)).toString('base64url');
      return {
        address,
        redirectUri,
        proof: (presentedAt = 'token') => {
          const now = Math.floor(Date.now() / 1000);
          const server = `${origin}/api/auth`;
          const said = [
            encoded({ alg: 'ES256', typ: 'JWT', kid }),
            encoded({
              iss: address,
              sub: address,
              aud: presentedAt === 'server' ? server : `${server}/oauth2/${presentedAt}`,
              iat: now,
              exp: now + 60,
              jti: randomUUID(),
            }),
          ].join('.');
          const signature = sign('sha256', Buffer.from(said), {
            key: privateKey,
            dsaEncoding: 'ieee-p1363',
          });
          return `${said}.${signature.toString('base64url')}`;
        },
      };
    },
    publishDocument: (address, document) => {
      documents.set(address, JSON.stringify(document));
    },
    fetch: async (input: string | URL | Request) => {
      const address = input instanceof Request ? input.url : input.toString();
      asked.push(address);
      const holding = held.get(address);
      if (holding !== undefined) {
        held.delete(address);
        holding.started();
        await holding.released;
      }
      const document = documents.get(address);
      return document === undefined
        ? new Response(null, { status: 404 })
        : new Response(document, { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
    asked,
    hold: (address) => {
      const reached = Promise.withResolvers<undefined>();
      const released = Promise.withResolvers<undefined>();
      held.set(address, {
        started: () => {
          reached.resolve(undefined);
        },
        released: released.promise,
      });
      return {
        reached: reached.promise,
        release: () => {
          released.resolve(undefined);
        },
      };
    },
  };
}

/** The permissions an application asks for when it connects: all of them, at once. */
const everyPermission = 'events:read events:manage offline_access';

/** A request to connect: who asks, for which qando, and as which browser. */
export interface ConnectionRequest {
  readonly application: PublishedApplication;
  /** The public address of qando's pages and API. */
  readonly origin: string;
  /** The session cookie of the browser the assistant opened; none when it is not signed in. */
  readonly cookie?: string;
  /** Parameters of the request changed (`undefined` leaves one out), for a request to refuse. */
  readonly query?: Readonly<Record<string, string | undefined>>;
}

/** What a request to connect answered, with what the application keeps to finish connecting. */
export interface ConnectionAsked {
  readonly answer: Answer;
  /** The secret the application proves itself with when it exchanges the code. */
  readonly verifier: string;
  /** What the application expects to get back with the code. */
  readonly state: string;
}

/**
 * Sends the browser an assistant opened to the authorization server with the application's
 * request to connect: every permission, for the connector, with a challenge only the
 * application can answer.
 */
export async function askToConnect(
  api: Express,
  { application, origin, cookie, query = {} }: ConnectionRequest,
): Promise<ConnectionAsked> {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomUUID();
  const asked = {
    response_type: 'code',
    client_id: application.address,
    redirect_uri: application.redirectUri,
    scope: everyPermission,
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource: `${origin}/api/mcp`,
    ...query,
  };
  const sent = request(api).get('/api/auth/oauth2/authorize').query(asked);
  const answer = await (cookie === undefined ? sent : sent.set('Cookie', cookie));
  return { answer, verifier, state };
}

/** The account's answer on the consent page it was sent to. */
export interface ConsentAnswer {
  /** The address of the consent page the browser was sent to, with its signed query. */
  readonly consentPage: string;
  readonly accept: boolean;
  /** The session cookie of the browser that answers; none when it is no longer signed in. */
  readonly cookie?: string;
  /** The site whose page sends the answer: qando's own, unless a test says otherwise. */
  readonly origin: string;
}

/** Sends the account's answer as the consent page does: with the signed query it was opened with. */
export async function answerConsent(
  api: Express,
  { consentPage, accept, cookie, origin }: ConsentAnswer,
): Promise<Answer> {
  const sent = request(api).post('/api/auth/oauth2/consent').set('Origin', origin);
  return await (cookie === undefined ? sent : sent.set('Cookie', cookie)).send({
    accept,
    oauth_query: new URL(consentPage, origin).search.slice(1),
  });
}

/** The code an application was sent back with, and the secret it asked with. */
export interface CodeExchange {
  readonly application: PublishedApplication;
  readonly origin: string;
  readonly code: string;
  readonly verifier: string;
  /** The proof an application that signs sends with it; one signed now when left out. */
  readonly proof?: string;
  /** The proof of a key the tokens are to be bound to (DPoP), sent in its header; none if left out. */
  readonly dpop?: string;
}

/**
 * How a request says who sends it: the application's address, and with it the proof of an
 * application that signs (the one given, or one signed now for the token route).
 */
function sentBy(application: PublishedApplication, proof = application.proof?.()) {
  return {
    client_id: application.address,
    ...(proof !== undefined && {
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: proof,
    }),
  };
}

/** Exchanges the code for tokens, as the application's server does: with a form, no cookie. */
export async function exchangeCode(
  api: Express,
  { application, origin, code, verifier, proof, dpop }: CodeExchange,
): Promise<Answer> {
  return await request(api)
    .post('/api/auth/oauth2/token')
    .set(dpop === undefined ? {} : { DPoP: dpop })
    .type('form')
    .send({
      grant_type: 'authorization_code',
      code,
      redirect_uri: application.redirectUri,
      ...sentBy(application, proof),
      code_verifier: verifier,
      resource: `${origin}/api/mcp`,
    });
}

/** What the token route answers an application it gives access to. */
export interface ApplicationAccess {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: string;
  /** Seconds the access token lasts. */
  readonly expires_in: number;
  readonly scope: string;
}

/**
 * Connects the application to the signed-in account, over HTTP, exactly as an assistant and the
 * consent page do: the request to connect, "allow" on the consent page (unless the account had
 * already allowed it), and the code exchanged for tokens.
 */
export async function connectApplication(
  api: Express,
  connection: ConnectionRequest & { readonly cookie: string },
): Promise<ApplicationAccess> {
  const { application, origin, cookie } = connection;
  const { answer: asked, verifier } = await askToConnect(api, connection);
  let returned = locationOf(asked, 'The request to connect');
  if (!returned.startsWith(application.redirectUri)) {
    const allowed = await answerConsent(api, {
      consentPage: returned,
      accept: true,
      cookie,
      origin,
    });
    const { url } = allowed.body as { url?: unknown };
    if (allowed.status !== 200 || typeof url !== 'string') {
      throw new Error(`The consent answered ${allowed.status}: ${allowed.text}`);
    }
    returned = url;
  }
  const code = new URL(returned).searchParams.get('code');
  if (code === null) throw new Error(`The application was sent back without a code: ${returned}`);
  const exchanged = await exchangeCode(api, { application, origin, code, verifier });
  if (exchanged.status !== 200) {
    throw new Error(`The code exchange answered ${exchanged.status}: ${exchanged.text}`);
  }
  return exchanged.body as ApplicationAccess;
}

/**
 * Renews the application's access with its refresh token, as its server does. An application
 * that signs sends `proof` with it, or one signed now when none is given.
 */
export async function renewAccess(
  api: Express,
  application: PublishedApplication,
  refreshToken: string,
  proof?: string,
): Promise<Answer> {
  return await request(api)
    .post('/api/auth/oauth2/token')
    .type('form')
    .send({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      ...sentBy(application, proof),
    });
}

/**
 * Hands a refresh token back, as the application's server does when it is disconnected there.
 * An application that signs sends `proof` with it, or one signed now for this route when none
 * is given. `saidToBe` is what the request says the token is, which it may leave unsaid.
 */
export async function handBack(
  api: Express,
  application: PublishedApplication,
  refreshToken: string,
  { proof, saidToBe = 'refresh_token' }: { proof?: string; saidToBe?: string | null } = {},
): Promise<Answer> {
  return await request(api)
    .post('/api/auth/oauth2/revoke')
    .type('form')
    .send({
      token: refreshToken,
      ...(saidToBe !== null && { token_type_hint: saidToBe }),
      ...sentBy(application, proof ?? application.proof?.('revoke')),
    });
}

/** Where a request sent the browser on. */
function locationOf(answer: Answer, what: string): string {
  const location: unknown = answer.headers.location;
  if (answer.status !== 302 || typeof location !== 'string') {
    throw new Error(`${what} answered ${answer.status}: ${answer.text}`);
  }
  return location;
}

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request, { type Response as Answer } from 'supertest';
import type { AuthDependencies } from '../modules/auth/auth.js';

/** An application (an AI assistant) as qando knows it: by the document it publishes. */
export interface PublishedApplication {
  /** The address its document is published at, which is also how it names itself. */
  readonly address: string;
  /** Where it asks the browser to be sent back to once the account has answered. */
  readonly redirectUri: string;
}

/**
 * The network between qando and the applications, in memory: the documents applications publish
 * about themselves, and the fetch that reads them, so nothing leaves the computer.
 */
export interface PublishedApplications {
  /** Publishes a well-formed application with this name at an address of its own. */
  publish(name: string): PublishedApplication;
  /** Publishes a document exactly as written: a broken one, or one shaped like a real assistant's. */
  publishDocument(address: string, document: unknown): void;
  /**
   * The fetch to give `createAuth`: answers the document published at an address (`200`, JSON)
   * and `404` for any other.
   */
  readonly fetch: NonNullable<AuthDependencies['fetchApplicationDocument']>;
  /** Every address the fetch was asked for, in order. */
  readonly asked: readonly string[];
}

export function publishedApplications(): PublishedApplications {
  const documents = new Map<string, string>();
  const asked: string[] = [];
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
    publishDocument: (address, document) => {
      documents.set(address, JSON.stringify(document));
    },
    fetch: (input: string | URL | Request) => {
      const address = input instanceof Request ? input.url : input.toString();
      asked.push(address);
      const document = documents.get(address);
      return document === undefined
        ? new Response(null, { status: 404 })
        : new Response(document, { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
    asked,
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
  readonly cookie: string;
  /** The site whose page sends the answer: qando's own, unless a test says otherwise. */
  readonly origin: string;
}

/** Sends the account's answer as the consent page does: with the signed query it was opened with. */
export async function answerConsent(
  api: Express,
  { consentPage, accept, cookie, origin }: ConsentAnswer,
): Promise<Answer> {
  return await request(api)
    .post('/api/auth/oauth2/consent')
    .set('Cookie', cookie)
    .set('Origin', origin)
    .send({ accept, oauth_query: new URL(consentPage, origin).search.slice(1) });
}

/** The code an application was sent back with, and the secret it asked with. */
export interface CodeExchange {
  readonly application: PublishedApplication;
  readonly origin: string;
  readonly code: string;
  readonly verifier: string;
}

/** Exchanges the code for tokens, as the application's server does: with a form, no cookie. */
export async function exchangeCode(
  api: Express,
  { application, origin, code, verifier }: CodeExchange,
): Promise<Answer> {
  return await request(api)
    .post('/api/auth/oauth2/token')
    .type('form')
    .send({
      grant_type: 'authorization_code',
      code,
      redirect_uri: application.redirectUri,
      client_id: application.address,
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

/** Renews the application's access with its refresh token, as its server does. */
export async function renewAccess(
  api: Express,
  application: PublishedApplication,
  refreshToken: string,
): Promise<Answer> {
  return await request(api).post('/api/auth/oauth2/token').type('form').send({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: application.address,
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

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { APIRequestContext, BrowserContext } from '@playwright/test';

/** Everything the connector lets an application ask for. */
const everyPermission = 'events:read events:manage offline_access';

/** What an access token says of the access it gives: a signed JSON token, read without checking it. */
export interface AccessClaims {
  /** The account's ID. */
  readonly sub: string;
  /** What the token is for: the connector's address. */
  readonly aud: string;
  readonly scope: string;
}

/**
 * An application of the scenario, as an assistant is: it publishes its document under a host of
 * its own that exists nowhere (`.example`; the API of a run answers it itself, api-process.ts),
 * opens a browser with its request to connect, and exchanges the code it is sent back with.
 */
export class Assistant {
  /** The address of the document it publishes: what the authorization server knows it by. */
  readonly address: string;
  /** Where it asks the browser back. */
  readonly redirectUri: string;
  /** The secret and the state of the request it last made, until its answer is read. */
  #pending: { readonly verifier: string; readonly state: string } | undefined;

  constructor(
    readonly name: string,
    /** The site qando is served at. */
    private readonly origin: string,
  ) {
    const site = `https://${randomBytes(6).toString('hex')}.example`;
    this.address = `${site}/${name}.json`;
    this.redirectUri = `${site}/callback`;
  }

  /** The host its document is published at, as the consent page names it. */
  get host(): string {
    return new URL(this.address).host;
  }

  /** The connector it asks access to. */
  get connector(): string {
    return `${this.origin}/api/mcp`;
  }

  /** Whether it made a request whose answer no step has read yet. */
  get waits(): boolean {
    return this.#pending !== undefined;
  }

  /**
   * Makes a request to connect: the address, on qando's site, it sends the browser to, asking
   * for every permission on the connector with a challenge only it can answer.
   */
  request(): string {
    const verifier = randomBytes(32).toString('base64url');
    this.#pending = { verifier, state: randomUUID() };
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: this.address,
      redirect_uri: this.redirectUri,
      scope: everyPermission,
      state: this.#pending.state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      resource: this.connector,
    });
    return `/api/auth/oauth2/authorize?${query.toString()}`;
  }

  /** Whether `address` is where it asked the browser back. */
  isReturn(address: string): boolean {
    return address.startsWith(`${this.redirectUri}?`);
  }

  /**
   * Reads the answer the browser came back with at `returned`: the code, exchanged for tokens as
   * the application's server does (a form, no cookie, from the scenario's `clientAddress`), or
   * the reason it was refused. The answer must carry the state of the request last made.
   */
  async answer(
    client: APIRequestContext,
    returned: string,
    clientAddress: string,
  ): Promise<{ readonly access: AccessClaims } | { readonly refused: string }> {
    const pending = this.#pending;
    if (pending === undefined) throw new Error(`${this.name} made no request to connect`);
    if (!this.isReturn(returned)) throw new Error(`${this.name} was not sent back: ${returned}`);
    const answer = new URL(returned).searchParams;
    if (answer.get('state') !== pending.state) {
      throw new Error(`${this.name} was sent back with another request's state`);
    }
    this.#pending = undefined;
    const code = answer.get('code');
    if (code === null) return { refused: answer.get('error') ?? '' };

    const exchanged = await client.post('/api/auth/oauth2/token', {
      headers: { 'x-forwarded-for': clientAddress },
      form: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        client_id: this.address,
        code_verifier: pending.verifier,
        resource: this.connector,
      },
    });
    if (exchanged.status() !== 200) {
      throw new Error(`The code was refused: ${exchanged.status()} ${await exchanged.text()}`);
    }
    const { access_token: token } = (await exchanged.json()) as { access_token: string };
    const claims = token.split('.')[1] ?? '';
    return { access: JSON.parse(Buffer.from(claims, 'base64url').toString()) as AccessClaims };
  }
}

/** The page a browser sent back to an application lands on: nothing of qando's. */
const applicationPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Application</title></head>
  <body><main><h1>Back in the application</h1></main></body>
</html>`;

/** The scenario's applications, each by the name its steps give it. */
export class Assistants {
  readonly #named = new Map<string, Assistant>();

  constructor(private readonly origin: string) {}

  named(name: string): Assistant {
    const known = this.#named.get(name);
    if (known) return known;
    const assistant = new Assistant(name, this.origin);
    this.#named.set(name, assistant);
    return assistant;
  }

  /** Answers the pages of every application in `context`'s browsers: no request leaves for `.example`. */
  async serveIn(context: BrowserContext): Promise<void> {
    await context.route(/^https:\/\/[^/]+\.example\//, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: applicationPage }),
    );
  }
}

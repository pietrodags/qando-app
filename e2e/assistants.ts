import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  Client,
  StreamableHTTPClientTransport,
  type CallToolResult,
  type FetchLike,
} from '@modelcontextprotocol/client';
import type { APIRequestContext, BrowserContext } from '@playwright/test';

/** Everything the connector lets an application ask for. */
export const everyPermission = 'events:read events:manage offline_access';

/** What every request of the scenario carries: its client address and, once set, its time. */
export type ScenarioHeaders = () => Record<string, string>;

/** What a tool of the connector answered: its words, its data, and whether it is a refusal. */
export interface ToolAnswer {
  readonly text: string;
  readonly data: unknown;
  readonly error: boolean;
}

/**
 * How the connector answered a call: the tool's answer, or `unauthorized` with the challenge
 * of its `401` (the `WWW-Authenticate` header), which says where to ask for access.
 */
export type Called = { readonly answered: ToolAnswer } | { readonly unauthorized: string };

/** The words of a tool's answer: its text blocks, one per line. */
function textOf({ content }: CallToolResult): string {
  return content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n');
}

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
 * opens a browser with its request to connect, exchanges the code it is sent back with for an
 * access token, and keeps that token to call the connector's tools with a client of the protocol.
 */
export class Assistant {
  /** The address of the document it publishes: what the authorization server knows it by. */
  readonly address: string;
  /** Where it asks the browser back. */
  readonly redirectUri: string;
  /** The secret and the state of the request it last made, until its answer is read. */
  #pending: { readonly verifier: string; readonly state: string } | undefined;
  /** The access token it was last given, if any. */
  #token: string | undefined;

  constructor(
    readonly name: string,
    /** The site qando is served at. */
    private readonly origin: string,
    private readonly scenario: ScenarioHeaders,
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

  /** Whether it holds an access token: it was connected, whether or not the token still works. */
  get connected(): boolean {
    return this.#token !== undefined;
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
    this.#token = token;
    const claims = token.split('.')[1] ?? '';
    return { access: JSON.parse(Buffer.from(claims, 'base64url').toString()) as AccessClaims };
  }

  /**
   * Calls the connector's tool `name`, without arguments, as an assistant's server does: a
   * client of the protocol's 2026-07-28 revision (the API's own tests serve the 2025 ones too)
   * connects with the access token it holds, or with none, reads the list of tools, so that it
   * checks the tool's data against the shape announced there, and calls it. Every request goes
   * on the scenario's time and from its client address, with no `Origin`, as from a server.
   */
  async call(name: string): Promise<Called> {
    let challenge: string | undefined;
    const fetch: FetchLike = async (url, init) => {
      const headers = new Headers(init?.headers);
      for (const [header, value] of Object.entries(this.scenario())) headers.set(header, value);
      const response = await globalThis.fetch(url, { ...init, headers });
      // The client's error on a refused request does not carry the answer's headers.
      if (response.status === 401) challenge = response.headers.get('www-authenticate') ?? '';
      return response;
    };
    const token = this.#token;
    const client = new Client(
      { name: this.name, version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    const transport = new StreamableHTTPClientTransport(new URL(this.connector), {
      fetch,
      ...(token !== undefined && { authProvider: { token: () => Promise.resolve(token) } }),
    });
    try {
      await client.connect(transport);
      await client.listTools();
      const result = await client.callTool({ name });
      return {
        answered: {
          text: textOf(result),
          data: result.structuredContent,
          error: result.isError === true,
        },
      };
    } catch (error) {
      if (challenge !== undefined) return { unauthorized: challenge };
      throw error;
    } finally {
      await client.close();
    }
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

  constructor(
    private readonly origin: string,
    private readonly scenario: ScenarioHeaders,
  ) {}

  named(name: string): Assistant {
    const known = this.#named.get(name);
    if (known) return known;
    const assistant = new Assistant(name, this.origin, this.scenario);
    this.#named.set(name, assistant);
    return assistant;
  }

  /** "The assistant" of the steps that name none: the one application the scenario connected. */
  get connected(): Assistant {
    const connected = [...this.#named.values()].filter((assistant) => assistant.connected);
    const [assistant] = connected;
    if (connected.length !== 1 || !assistant) {
      throw new Error(`The scenario connected ${connected.length} applications, not one`);
    }
    return assistant;
  }

  /** Answers the pages of every application in `context`'s browsers: no request leaves for `.example`. */
  async serveIn(context: BrowserContext): Promise<void> {
    await context.route(/^https:\/\/[^/]+\.example\//, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: applicationPage }),
    );
  }
}

// PROTOTYPE (never merged as is): the address assistants call (MCP over HTTP), behind the access
// token an organizer granted. Two tools: one that reads, one marked destructive that does nothing.
import { requireMcpAuth } from '@better-auth/mcp';
import { toNodeHandler } from '@modelcontextprotocol/node';
import {
  createMcpHandler,
  McpServer,
  requireScopes,
  type AuthInfo,
} from '@modelcontextprotocol/server';
import { desc, eq } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import type { Database } from '../../db/database.js';
import { events } from '../../db/schema.js';
import { agentScopes, mcpResourceOf, type Auth } from '../auth/auth.js';

/** Writes what the prototype wants to learn about each call; never a token. */
type SpikeLog = (entry: Record<string, unknown>) => void;

/**
 * Serves `/api/mcp`: `401` with the challenge that starts the OAuth flow without a valid access
 * token for this address, the MCP exchange with one. Both protocol eras are answered (the
 * revisions of 2025 and of 2026-07-28), each request on its own: nothing is kept between calls.
 */
export function mcpEndpoint(
  auth: Auth,
  db: Database,
  baseURL: string,
  log: SpikeLog,
): RequestHandler {
  const resource = mcpResourceOf(baseURL);
  const resourceMetadataUrl = `${baseURL}/.well-known/oauth-protected-resource/api/mcp`;

  const mcp = createMcpHandler(
    ({ era, authInfo }) => {
      const accountId = String(authInfo?.extra?.['accountId']);
      log({ spike: 'mcp', era, client: authInfo?.clientId, scopes: authInfo?.scopes });
      const server = new McpServer({ name: 'qando', title: 'qando', version: '0.0.0' });

      server.registerTool(
        'list_my_events',
        {
          title: 'Mis eventos',
          description:
            'Lists the events the signed-in organizer created in qando, newest first: title, state (open, closed or confirmed), voting deadline and the link people vote at.',
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        async () => {
          const mine = await db
            .select({
              title: events.title,
              state: events.state,
              deadline: events.deadline,
              publicId: events.publicId,
            })
            .from(events)
            .where(eq(events.ownerId, accountId))
            .orderBy(desc(events.createdAt));
          log({ spike: 'tool', tool: 'list_my_events', events: mine.length });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  events: mine.map(({ title, state, deadline, publicId }) => ({
                    title,
                    state,
                    deadline,
                    votingLink: `${baseURL}/vote/${publicId}`,
                  })),
                }),
              },
            ],
          };
        },
      );

      server.registerTool(
        'spike_delete_nothing',
        {
          title: 'Prueba destructiva (no hace nada)',
          description:
            'A test tool marked destructive: it changes nothing and answers "ok". Call it only when asked to try it.',
          annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
          scopeChallenge: requireScopes(agentScopes.manage),
        },
        () => {
          log({ spike: 'tool', tool: 'spike_delete_nothing' });
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      );

      return server;
    },
    { legacy: 'stateless', responseMode: 'json' },
  );

  const guarded = requireMcpAuth(
    auth,
    (request, claims) => {
      const authInfo: AuthInfo = {
        token: (request.headers.get('authorization') ?? '').replace(/^Bearer /i, ''),
        clientId: String(claims['azp']),
        scopes: typeof claims['scope'] === 'string' ? claims['scope'].split(' ') : [],
        ...(claims.exp !== undefined && { expiresAt: claims.exp }),
        resource: new URL(resource),
        resourceMetadataUrl,
        extra: { accountId: claims.sub },
      };
      return mcp.fetch(request, { authInfo });
    },
    { resource, requiredScopes: [agentScopes.read] },
  );

  const node = toNodeHandler({
    fetch: async (request: Request) => {
      const answer = challengeNamingEveryScope(await guarded(request));
      log({
        spike: 'mcp-request',
        method: request.method,
        status: answer.status,
        protocol: request.headers.get('mcp-protocol-version'),
        mcpMethod: request.headers.get('mcp-method'),
        accept: request.headers.get('accept'),
        agent: request.headers.get('user-agent'),
        answered: answer.headers.get('content-type'),
      });
      return answer;
    },
  });
  return (request, response) => void node(request, response);
}

/**
 * PROTOTYPE: the `401` challenge names every scope the tools may need, not only the one every
 * call needs: ChatGPT asks for what this challenge names and nothing else, even after a `403`
 * that names another scope.
 */
function challengeNamingEveryScope(answer: Response): Response {
  const challenge = answer.headers.get('www-authenticate');
  if (answer.status !== 401 || challenge === null) return answer;
  const headers = new Headers(answer.headers);
  headers.set(
    'www-authenticate',
    challenge.replace(
      /scope="[^"]*"/,
      `scope="${agentScopes.read} ${agentScopes.manage} offline_access"`,
    ),
  );
  return new Response(answer.body, { status: answer.status, headers });
}

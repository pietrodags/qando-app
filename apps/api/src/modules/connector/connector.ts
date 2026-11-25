import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { Router } from 'express';
import { describeError, type ErrorLog } from '../../http/error-boundary.js';
import { noStore } from '../../http/no-store.js';
import { noForeignPages, type Sessions } from '../../http/session.js';
import { texts } from './texts.js';

/** The path of the connector, the address assistants call. */
export const connectorPath = '/api/mcp';

/** How a request is answered, in the web's own `Request` and `Response`. */
export type Served = (calling: Request) => Promise<Response>;

/**
 * Who may call the connector (the port; the sign-in library's check, in `modules/auth`): given
 * how the connector serves a request, how it serves one once the caller is known. A request
 * that carries no access token issued for the connector, or one whose application is no longer
 * connected to the account, is answered by the check itself, with the `401` that says where to
 * ask for access; any other reaches `serve` as it came.
 */
export type ConnectorAccess = (serve: Served) => Served;

/**
 * The largest request taken, in bytes: creating an event, the largest call an assistant makes,
 * sends up to 16 kB on the web.
 */
const bodyLimit = 32 * 1024;

/**
 * The connector, a remote MCP server at `/api/mcp`: one more way into the API's use cases, for
 * the applications (AI assistants) an account allowed to act for it. It answers the 2026-07-28
 * revision of the protocol and the 2025 ones, each request on its own: no conversation is kept
 * between two, so a `GET` or a `DELETE`, which the 2025 revisions listen and hang up with, is
 * answered `405`. Both read the same presentation of qando when they connect.
 *
 * A request sent by a page of another site is refused before its token is looked at; one
 * without `Origin` is an assistant's own server calling and goes on to the access check.
 *
 * A failure while serving a request is logged as every failed request of the API is, and
 * answered `500` in the protocol's own shape, without a word of what failed.
 */
export function connectorRouter(
  access: ConnectorAccess,
  sessions: Sessions,
  logError: ErrorLog,
): Router {
  const connector = createMcpHandler(
    () =>
      new McpServer(
        { name: 'qando', version: '1.0.0' },
        { instructions: texts.server.instructions },
      ),
  );
  const served = access((calling) => connector.fetch(calling));
  return Router().all(
    connectorPath,
    noStore,
    noForeignPages(sessions),
    async (request, response) => {
      const answer = toNodeHandler(
        { fetch: served },
        {
          maxRequestBodySize: bodyLimit,
          onerror: (error) => {
            logError({
              level: 'error',
              message: 'Request failed',
              method: request.method,
              route: connectorPath,
              ...describeError(error),
            });
          },
        },
      );
      await answer(request, response);
    },
  );
}

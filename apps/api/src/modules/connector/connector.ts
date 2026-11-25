import { AsyncLocalStorage } from 'node:async_hooks';
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
 * The methods the protocol has: it posts each request, and its 2025 revisions listen with a
 * `GET` and hang up with a `DELETE`.
 */
const methods = new Set(['POST', 'GET', 'DELETE']);

/**
 * The connector, a remote MCP server at `/api/mcp`: one more way into the API's use cases, for
 * the applications (AI assistants) an account allowed to act for it. It answers the 2026-07-28
 * revision of the protocol and the 2025 ones, each request on its own: no conversation is kept
 * between two, so a `GET` or a `DELETE` is answered `405`. Both read the same presentation of
 * qando when they connect. A request with any other method is not one of the connector's: it
 * goes on to the rest of the API, which has no route for it.
 *
 * A request sent by a page of another site is refused before its token is looked at; one
 * without `Origin` is an assistant's own server calling and goes on to the access check.
 *
 * No answer is to be stored, an event stream's neither: the protocol's handler marks a stream
 * only as not to be reused unchecked, and that mark is replaced.
 *
 * A failure while serving a request, of the access check or of the protocol's handler, is logged
 * as every failed request of the API is and answered `500` in the protocol's own shape, without
 * a word of what failed. A request the protocol refuses is an answer, and logs nothing: the
 * handler reports both, and only what it reported before answering `500` is a failure.
 */
export function connectorRouter(
  access: ConnectorAccess,
  sessions: Sessions,
  logError: ErrorLog,
): Router {
  /** What the protocol's handler reported while it served the request at hand. */
  const reported = new AsyncLocalStorage<Error[]>();
  const connector = createMcpHandler(
    () =>
      new McpServer(
        { name: 'qando', version: '1.0.0' },
        { instructions: texts.server.instructions },
      ),
    { onerror: (error) => reported.getStore()?.push(error) },
  );
  return Router().all(
    connectorPath,
    (request, _response, next) => {
      next(methods.has(request.method) ? undefined : 'router');
    },
    noStore,
    noForeignPages(sessions),
    async (request, response) => {
      const failed = (error: unknown) => {
        logError({
          level: 'error',
          message: 'Request failed',
          method: request.method,
          route: connectorPath,
          ...describeError(error),
        });
      };
      const served = access(async (calling) => {
        const said: Error[] = [];
        const answer = await reported.run(said, () => connector.fetch(calling));
        if (answer.status >= 500) failed(said.at(-1));
        if (answer.headers.has('Cache-Control')) {
          answer.headers.set('Cache-Control', 'no-store, no-transform');
        }
        return answer;
      });
      // The adapter makes an address of the `Host` it reads, and fails on one that makes none.
      // Nothing reads that address: the access check goes by the connector's public one.
      request.headers.host = 'connector';
      const answer = toNodeHandler(
        {
          fetch: async (calling) => {
            try {
              return await served(calling);
            } catch (error) {
              failed(error);
              throw error;
            }
          },
        },
        { maxRequestBodySize: bodyLimit },
      );
      await answer(request, response);
    },
  );
}

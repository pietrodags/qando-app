import { AsyncLocalStorage } from 'node:async_hooks';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { Router } from 'express';
import { describeError, type ErrorLog } from '../../http/error-boundary.js';
import { noStore } from '../../http/no-store.js';
import { quota } from '../../http/quota.js';
import { noForeignPages, type Sessions } from '../../http/session.js';
import type { InterpretPhrase } from '../date-interpretations/interpret-phrase.js';
import type { NewEvents } from '../events/create-event.js';
import type { ManagedEvents } from '../management/managed-events.js';
import type { EventResults } from '../results/read-results.js';
import { confirmOptionTool } from './confirm-option.js';
import { confirmationCodes } from './confirmation-code.js';
import { createEventTool } from './create-event.js';
import { listEventsTool } from './list-events.js';
import { readDatesTool } from './read-dates.js';
import { readEventTool } from './read-event.js';
import { serverFor, type Caller } from './tool.js';

/** The path of the connector, the address assistants call. */
export const connectorPath = '/api/mcp';

/** How a request is answered, in the web's own `Request` and `Response`. */
export type Served = (calling: Request) => Promise<Response>;

/** How the connector answers the request of an application that acts for an account. */
export type ServedFor = (calling: Request, caller: Caller) => Promise<Response>;

/**
 * Who may call the connector (the port; the sign-in library's check, in `modules/auth`): given
 * how the connector serves a request, how it serves one once the caller is known. A request
 * that carries no access token issued for the connector, or one whose application is no longer
 * connected to the account, is answered by the check itself, with the `401` that says where to
 * ask for access; any other reaches `serve` as it came, with the account its token is of and
 * its application.
 */
export type ConnectorAccess = (serve: ServedFor) => Served;

/** What the tools run: the ports of the API's use cases they answer with. */
interface UseCases {
  /** The account's events (`apps/api/src/modules/management`). */
  readonly managedEvents: ManagedEvents;
  /** The reading of a date phrase (`apps/api/src/modules/date-interpretations`). */
  readonly interpret: InterpretPhrase;
  /** Where new events are stored (`apps/api/src/modules/events`). */
  readonly newEvents: NewEvents;
  /** The account's events with their results (`apps/api/src/modules/results`). */
  readonly eventResults: EventResults;
}

/**
 * What the connector is served among: the clock, qando's website, the log of failures and the
 * secret its confirmation codes are signed with.
 */
interface Surroundings {
  /** The clock an account's calls are counted on, and the use cases run with. */
  readonly now: () => Date;
  /** qando's website, the public address of its pages, which the presentation names. */
  readonly website: string;
  readonly logError: ErrorLog;
  readonly confirmationSecret: string;
}

/** Logs a failure while serving a request. */
type Failed = (error: unknown) => void;

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
 * qando when they connect and are offered the same tools, each a use case of the API run for the
 * account the application acts for (`serverFor`); an account's calls are counted on the clock
 * given (`now`), and the presentation names the site's public address (`website`). A request with any other method is not one of the connector's: it goes on to
 * the rest of the API, which has no route for it.
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
 * handler reports both, and only what it reported before answering `500` is a failure. A call
 * to a tool that fails is logged the same way and answered as a tool answers.
 */
export function connectorRouter(
  access: ConnectorAccess,
  sessions: Sessions,
  { managedEvents, interpret, newEvents, eventResults }: UseCases,
  { now, website, logError, confirmationSecret }: Surroundings,
): Router {
  const tools = [
    readDatesTool(interpret),
    createEventTool(newEvents, now, website),
    listEventsTool(managedEvents, now),
    readEventTool(managedEvents, eventResults, now, website),
    confirmOptionTool(managedEvents, confirmationCodes(confirmationSecret), now),
  ];
  const calls = quota({ gapMs: 0, limit: 60, per: 'minute' }, now);
  /** The request at hand: who it is from, and what the protocol's handler reported. */
  const serving = new AsyncLocalStorage<{ caller: Caller; said: Error[]; failed: Failed }>();
  const connector = createMcpHandler(
    () => {
      const request = serving.getStore();
      // Stryker disable next-line all: the handler builds a server only while it serves a
      // request, so there is always one at hand; the check is for the compiler.
      if (!request) throw new Error('No request is being served');
      return serverFor(request.caller, { tools, calls, failed: request.failed, website });
    },
    { onerror: (error) => serving.getStore()?.said.push(error) },
  );
  return Router().all(
    connectorPath,
    (request, _response, next) => {
      next(methods.has(request.method) ? undefined : 'router');
    },
    noStore,
    noForeignPages(sessions),
    async (request, response) => {
      const failed: Failed = (error) => {
        logError({
          level: 'error',
          message: 'Request failed',
          method: request.method,
          route: connectorPath,
          ...describeError(error),
        });
      };
      const served = access(async (calling, caller) => {
        const said: Error[] = [];
        const answer = await serving.run({ caller, said, failed }, () => connector.fetch(calling));
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

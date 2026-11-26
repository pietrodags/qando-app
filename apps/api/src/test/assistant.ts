import type { Express } from 'express';
import request from 'supertest';

/** The revisions of the protocol the connector answers: the current one and the 2025 ones. */
export const revisions = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'] as const;

export type Revision = (typeof revisions)[number];

/** What an assistant of the 2026-07-28 revision says of itself inside each request. */
const said = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'an assistant', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

/**
 * Sends the connector one request of the protocol as an assistant of that revision does: the
 * 2026-07-28 revision names the revision, the method and the tool in headers and says who it is
 * inside the request; the 2025 ones name only the revision. `headers` are the test's own: the
 * access token, an `Origin`.
 */
export function ask(
  app: Express,
  revision: Revision,
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): request.Test {
  const current = revision === '2026-07-28';
  return request(app)
    .post('/api/mcp')
    .set({
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': revision,
      ...(current && { 'Mcp-Method': method }),
      ...(current && typeof params.name === 'string' && { 'Mcp-Name': params.name }),
      ...headers,
    })
    .send({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: current ? { ...params, _meta: said } : params,
    });
}

/** Calls a tool of the connector, without arguments, as an assistant of that revision does. */
export function callTool(
  app: Express,
  revision: Revision,
  name: string,
  headers: Record<string, string> = {},
): request.Test {
  return ask(app, revision, 'tools/call', { name, arguments: {} }, headers);
}

/**
 * The result the connector answered a request with, whichever way it was sent: as one JSON
 * document (the 2026-07-28 revision) or as an event stream of one message (the 2025 ones).
 * Undefined when the answer is not a result.
 */
export function resultOf(response: request.Response): unknown {
  if (response.type !== 'text/event-stream') return (response.body as { result?: unknown }).result;
  const data = response.text.split('\n').find((line) => line.startsWith('data: '));
  return data === undefined
    ? undefined
    : (JSON.parse(data.slice('data: '.length)) as { result?: unknown }).result;
}

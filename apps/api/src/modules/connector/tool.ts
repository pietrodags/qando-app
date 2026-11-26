import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import type { Quota } from '../../http/quota.js';
import { icon } from './icon.js';
import { texts } from './texts.js';

/**
 * What a tool answers a call with: its words, which the assistant reads, and beside them the
 * same as data, which a view can draw.
 */
export interface Said<Data> {
  readonly text: string;
  readonly data: Data;
}

/** One thing an application can do through the connector for the account it acts for. */
export interface Tool<Data extends Record<string, unknown> = Record<string, unknown>> {
  /** The name applications call it by. */
  readonly name: string;
  /** What the organizer sees in the chat. */
  readonly title: string;
  /** What the assistant reads to know when to call it. */
  readonly description: string;
  /** Whether a call only reads: an assistant may then call it without asking the organizer. */
  readonly readOnly: boolean;
  /** The shape of the data beside its words. */
  readonly data: z.ZodType<Data>;
  /** What it answers the account, from a use case of the API. */
  answer(accountId: string): Promise<Said<Data>>;
}

/** What every call of the connector is served with, whoever calls. */
export interface Serving {
  readonly tools: readonly Tool[];
  /** Each account's calls: at most 60 in any minute. */
  readonly calls: Quota;
  /** Told of a call that failed, to log it. */
  readonly failed: (error: unknown) => void;
  /** qando's website, the public address of its pages, which the presentation names. */
  readonly website: string;
}

/** A tool's answer in words alone: what was asked was not done. */
const notDone = (text: string): CallToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
});

/**
 * The server that answers one request of an application acting for the account: qando's
 * presentation (its name, website and symbol, and what an assistant is told of it) and the tools. The list of tools is the same until the next deployment, and says
 * so: no application needs to listen for changes.
 *
 * This is the one place a tool's answer becomes the protocol's, the same for every tool:
 *
 * - its words as text and its data beside them as structured content, checked against the shape
 *   the tool announces before it leaves;
 * - a call past the account's 60 in a minute is not run, and answered in words with the time to
 *   wait: an assistant reads a tool's answer, not a status. Only calls to a tool count; asking
 *   what the connector offers costs no more than its access check;
 * - a call that fails is told to `failed` and answered in fixed words. The protocol's library
 *   would answer the failure's own message, which may name what is stored.
 */
export function serverFor(
  accountId: string,
  { tools, calls, failed, website }: Serving,
): McpServer {
  const server = new McpServer(
    { name: 'qando', title: 'qando', version: '1.0.0', websiteUrl: website, icons: [icon] },
    { instructions: texts.server.instructions, capabilities: { tools: { listChanged: false } } },
  );
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        outputSchema: tool.data,
        annotations: { readOnlyHint: tool.readOnly },
      },
      async () => {
        const turn = calls.take(accountId);
        if (!turn.granted) return notDone(texts.limits.calls(turn.retryAfterSeconds));
        try {
          const { text, data } = await tool.answer(accountId);
          return { content: [{ type: 'text', text }], structuredContent: tool.data.parse(data) };
        } catch (error) {
          failed(error);
          return notDone(texts.answers.failed);
        }
      },
    );
  }
  return server;
}

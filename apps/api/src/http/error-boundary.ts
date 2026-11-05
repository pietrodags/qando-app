import type { InternalErrorBody, ValidationFailedBody } from '@qando/contracts';
import type { ErrorRequestHandler, Response } from 'express';

/**
 * What the API logs about a failed request. Never the message, the URL or the request data:
 * database errors quote the query's parameters, and paths carry capability links (ADR 0012).
 */
export interface ErrorLogEntry {
  readonly level: 'error';
  readonly message: 'Request failed';
  readonly method: string;
  /** The matched route pattern, e.g. `/api/public/events/:id`, or `unknown`. */
  readonly route: string;
  /** The error's name, or the type of a thrown value that is not an error. */
  readonly error: string;
  readonly cause?: string;
  /** e.g. PostgreSQL's SQLSTATE. */
  readonly code?: string;
  /** The stack frames, without the message lines above them. */
  readonly stack: readonly string[];
}

export type ErrorLog = (entry: ErrorLogEntry) => void;

/** Structured JSON on standard error, one line per failure. */
export const logToStandardError: ErrorLog = (entry) => {
  console.error(JSON.stringify(entry));
};

/**
 * The last middleware: answers every failure in the shared error body. A request Express could
 * not read (e.g. a path with broken percent-encoding, a body too large) is the client's error:
 * 400, not logged. Any
 * other failure is unexpected: 500, logged without anything that could carry a link, a token or
 * personal data.
 */
export function errorBoundary(log: ErrorLog): ErrorRequestHandler {
  return (
    error: unknown,
    request,
    response: Response<InternalErrorBody | ValidationFailedBody>,
    next,
  ) => {
    if (isMalformedRequest(error) && !response.headersSent) {
      response.set('Cache-Control', 'no-store');
      response.status(400).json({
        error: { code: 'VALIDATION_FAILED', message: 'The request is malformed', details: [] },
      });
      return;
    }
    const route: unknown = (request.route as { path?: unknown } | undefined)?.path;
    log({
      level: 'error',
      message: 'Request failed',
      method: request.method,
      route: typeof route === 'string' ? route : 'unknown',
      ...describe(error),
    });
    if (response.headersSent) {
      next(error);
      return;
    }
    response.set('Cache-Control', 'no-store');
    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The request failed', details: [] },
    });
  };
}

/**
 * Express's router marks a path it cannot decode with status 400; its body parser marks a body
 * it cannot read with a client status and `expose` (400 broken JSON, 413 too large, 415 unknown
 * charset). Any other error, whatever status it carries, is ours.
 */
function isMalformedRequest(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  if (typeof status !== 'number' || status < 400 || status > 499) return false;
  return status === 400 || expose === true;
}

function describe(error: unknown): Pick<ErrorLogEntry, 'error' | 'cause' | 'code' | 'stack'> {
  if (!(error instanceof Error)) return { error: typeof error, stack: [] };
  const cause = error.cause instanceof Error ? error.cause : undefined;
  const code: unknown = (cause as { code?: unknown } | undefined)?.code;
  return {
    error: error.name,
    ...(cause && { cause: cause.name }),
    ...(typeof code === 'string' && { code }),
    stack: frames(error),
  };
}

/**
 * Only the `at …` lines after the message. The message is cut off whole first: it may quote
 * request data over several lines, one of which could look like a frame. A stack that does not
 * start with the message (rewritten by someone) is not trusted at all.
 */
function frames(error: Error): string[] {
  const header = String(error);
  const stack = error.stack ?? '';
  if (!stack.startsWith(header)) return [];
  return stack
    .slice(header.length)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '));
}

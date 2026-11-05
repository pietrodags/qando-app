import type { InternalErrorBody } from '@qando/contracts';
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
 * The last middleware: any unexpected failure answers the shared error body with 500, and is
 * logged without anything that could carry a link, a token or personal data.
 */
export function errorBoundary(log: ErrorLog): ErrorRequestHandler {
  return (error: unknown, request, response: Response<InternalErrorBody>, next) => {
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

function describe(error: unknown): Pick<ErrorLogEntry, 'error' | 'cause' | 'code' | 'stack'> {
  if (!(error instanceof Error)) return { error: typeof error, stack: [] };
  const cause = error.cause instanceof Error ? error.cause : undefined;
  const code: unknown = (cause as { code?: unknown } | undefined)?.code;
  return {
    error: error.name,
    ...(cause && { cause: cause.name }),
    ...(typeof code === 'string' && { code }),
    stack: frames(error.stack),
  };
}

/** Only the `at …` lines: the lines above them repeat the message. */
function frames(stack: string | undefined): string[] {
  return (stack ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '));
}

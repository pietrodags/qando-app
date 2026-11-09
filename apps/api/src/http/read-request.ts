import type { Endpoint, FieldProblem, ValidationFailedBody } from '@qando/contracts';
import type { Request } from 'express';
import type { z } from 'zod';

/** An endpoint whose request is read: its path parameters, headers and body, those it declares. */
type ReadingEndpoint = Endpoint;

/** The parsed part, or nothing for an endpoint that does not declare it. */
type PartOf<Schema> = Schema extends z.ZodType ? z.output<Schema> : Record<string, never>;

/** The parsed body, or `undefined` for an endpoint that takes none. */
type BodyOf<E extends ReadingEndpoint> = E['body'] extends z.ZodType
  ? z.output<E['body']>
  : undefined;

type Read<E extends ReadingEndpoint> =
  | {
      readonly ok: true;
      readonly params: PartOf<E['params']>;
      readonly headers: PartOf<E['headers']>;
      readonly body: BodyOf<E>;
    }
  | { readonly ok: false; readonly problems: FieldProblem[] };

type Parsed<Schema extends z.ZodType> = z.ZodSafeParseResult<z.output<Schema>>;

const noBody = { success: true, data: undefined, error: undefined } as const;
const nothingDeclared = { success: true, data: {}, error: undefined } as const;

/**
 * Parses the path, headers and body of a request with the endpoint's schemas. Headers it does
 * not declare are left out, and so is the body of an endpoint that takes none. Problems name where each broken part travels and the path to it,
 * never the value, which may be a token or personal data.
 */
export function readRequest<E extends ReadingEndpoint>(endpoint: E, request: Request): Read<E> {
  // Zod types a generic schema's result loosely; each result is the output of its own schema.
  const params = (endpoint.params?.safeParse(request.params) ?? nothingDeclared) as
    Parsed<z.ZodType<PartOf<E['params']>>> | typeof nothingDeclared;
  const headers = (endpoint.headers?.safeParse(request.headers) ?? nothingDeclared) as
    Parsed<z.ZodType<PartOf<E['headers']>>> | typeof nothingDeclared;
  const body = (endpoint.body?.safeParse(request.body) ?? noBody) as
    Parsed<NonNullable<E['body']>> | typeof noBody;
  if (params.success && headers.success && body.success) {
    return {
      ok: true,
      params: params.data as PartOf<E['params']>,
      headers: headers.data as PartOf<E['headers']>,
      body: body.data as BodyOf<E>,
    };
  }
  return {
    ok: false,
    problems: [
      ...problemsOf('path', params.error),
      ...problemsOf('header', headers.error),
      ...problemsOf('body', body.error),
    ],
  };
}

function problemsOf(place: FieldProblem['in'], error: z.ZodError | undefined): FieldProblem[] {
  const paths = new Map<string, FieldProblem['path']>();
  for (const issue of error?.issues ?? []) {
    const path = issue.path.map((key) => (typeof key === 'number' ? key : String(key)));
    paths.set(JSON.stringify(path), path);
  }
  return [...paths.values()].map((path) => ({ code: 'INVALID_FIELD', in: place, path }));
}

/** The answer to a request that breaks the contract: each broken part, never its value. */
export function contractBroken(problems: FieldProblem[]): ValidationFailedBody {
  return {
    error: {
      code: 'VALIDATION_FAILED',
      message: 'The request breaks the contract',
      details: problems,
    },
  };
}

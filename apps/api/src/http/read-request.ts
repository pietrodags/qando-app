import type { Endpoint, FieldProblem } from '@qando/contracts';
import type { Request } from 'express';
import type { z } from 'zod';

/** An endpoint that reads all three parts of a request. */
type ReadingEndpoint = Endpoint & {
  readonly params: z.ZodObject;
  readonly headers: z.ZodObject;
  readonly body: z.ZodType;
};

type Read<E extends ReadingEndpoint> =
  | {
      readonly ok: true;
      readonly params: z.output<E['params']>;
      readonly headers: z.output<E['headers']>;
      readonly body: z.output<E['body']>;
    }
  | { readonly ok: false; readonly problems: FieldProblem[] };

type Parsed<Schema extends z.ZodType> = z.ZodSafeParseResult<z.output<Schema>>;

/**
 * Parses the path, headers and body of a request with the endpoint's schemas. Headers it does
 * not declare are left out. Problems name where each broken part travels and the path to it,
 * never the value, which may be a token or personal data.
 */
export function readRequest<E extends ReadingEndpoint>(endpoint: E, request: Request): Read<E> {
  // Zod types a generic schema's result loosely; each result is the output of its own schema.
  const params = endpoint.params.safeParse(request.params) as Parsed<E['params']>;
  const headers = endpoint.headers.safeParse(request.headers) as Parsed<E['headers']>;
  const body = endpoint.body.safeParse(request.body) as Parsed<E['body']>;
  if (params.success && headers.success && body.success) {
    return { ok: true, params: params.data, headers: headers.data, body: body.data };
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

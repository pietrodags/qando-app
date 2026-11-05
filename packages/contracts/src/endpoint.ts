import type { z } from 'zod';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface EndpointResponse {
  readonly description: string;
  readonly schema: z.ZodType;
}

/** One HTTP endpoint of the API: the single source for validation, types and the OpenAPI document. */
export interface Endpoint {
  readonly method: HttpMethod;
  /** OpenAPI style: parameters are written `{name}`, e.g. `/api/public/events/{id}`. */
  readonly path: `/api/${string}`;
  readonly summary: string;
  readonly tags: readonly string[];
  /** The path parameters, named as the `{placeholders}` of `path`. */
  readonly params?: z.ZodObject;
  readonly responses: Readonly<Record<number, EndpointResponse>>;
}

/** Keeps the literal types of an endpoint while checking its shape. */
export function defineEndpoint<const E extends Endpoint>(endpoint: E): E {
  return endpoint;
}

type StatusOf<E extends Endpoint> = keyof E['responses'] & number;

type SuccessStatusOf<E extends Endpoint> = {
  [S in StatusOf<E>]: `${S}` extends `2${string}` ? S : never;
}[StatusOf<E>];

type ErrorStatusOf<E extends Endpoint> = Exclude<StatusOf<E>, SuccessStatusOf<E>>;

type BodyOf<E extends Endpoint, S extends StatusOf<E>> = E['responses'][S] extends {
  schema: infer Schema extends z.ZodType;
}
  ? z.output<Schema>
  : never;

/** The body of any 2xx answer the endpoint documents. */
export type SuccessBody<E extends Endpoint> = BodyOf<E, SuccessStatusOf<E>>;

/** A documented error answer: its status narrows the type of its body. */
export type ErrorResponse<E extends Endpoint> = {
  [S in ErrorStatusOf<E>]: { status: S; body: BodyOf<E, S> };
}[ErrorStatusOf<E>];

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status <= 299;
}

function describeEndpoint(endpoint: Endpoint): string {
  return `${endpoint.method.toUpperCase()} ${endpoint.path}`;
}

/** Checks a 2xx body against the endpoint's success schemas; throws if it breaks all of them. */
export function successBodyOf<E extends Endpoint>(endpoint: E, body: unknown): SuccessBody<E> {
  for (const [status, response] of Object.entries(endpoint.responses)) {
    if (!isSuccessStatus(Number(status))) {
      continue;
    }
    const result = response.schema.safeParse(body);
    if (result.success) {
      return result.data as SuccessBody<E>;
    }
  }
  throw new Error(`${describeEndpoint(endpoint)} answered a body that breaks its contract`);
}

/** The documented error answer for this status and body, or undefined if the contract lacks it. */
export function errorResponseOf<E extends Endpoint>(
  endpoint: E,
  status: number,
  body: unknown,
): ErrorResponse<E> | undefined {
  const documented: EndpointResponse | undefined = endpoint.responses[status];
  if (isSuccessStatus(status) || !documented) {
    return undefined;
  }
  const result = documented.schema.safeParse(body);
  return result.success ? ({ status, body: result.data } as ErrorResponse<E>) : undefined;
}

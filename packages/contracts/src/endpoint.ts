import type { z } from 'zod';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface EndpointResponse {
  readonly description: string;
  readonly schema: z.ZodType;
}

/** One HTTP endpoint of the API: the single source for validation, types and the OpenAPI document. */
export interface Endpoint {
  readonly method: HttpMethod;
  readonly path: `/api/${string}`;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly responses: Readonly<Record<number, EndpointResponse>>;
}

/** Keeps the literal types of an endpoint while checking its shape. */
export function defineEndpoint<const E extends Endpoint>(endpoint: E): E {
  return endpoint;
}

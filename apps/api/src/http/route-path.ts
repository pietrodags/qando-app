import type { Endpoint } from '@qando/contracts';

/** The Express route of a contract path: `/api/events/{id}` becomes `/api/events/:id`. */
export function routePath(endpoint: Endpoint): string {
  return endpoint.path.replace(/\{(\w+)\}/g, ':$1');
}

import { defineEndpoint, healthOkSchema } from '@qando/contracts';
import { describe, expect, it } from 'vitest';
import { routePath } from './route-path.js';

const endpointAt = (path: `/api/${string}`) =>
  defineEndpoint({
    method: 'get',
    path,
    summary: 'Test',
    tags: [],
    responses: { 200: { description: 'Ok', schema: healthOkSchema } },
  });

describe('routePath', () => {
  it('turns the contract placeholders into Express parameters', () => {
    expect(routePath(endpointAt('/api/events/{id}/emails/{type}/retry'))).toBe(
      '/api/events/:id/emails/:type/retry',
    );
  });

  it('keeps a path without parameters', () => {
    expect(routePath(endpointAt('/api/health'))).toBe('/api/health');
  });
});

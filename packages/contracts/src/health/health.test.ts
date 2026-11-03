import { describe, expect, it } from 'vitest';
import { healthEndpoint, healthResponseSchema } from './health.js';

describe('health contract', () => {
  it('accepts the healthy and the unavailable answers', () => {
    expect(healthResponseSchema.parse({ status: 'ok', database: 'up' })).toEqual({
      status: 'ok',
      database: 'up',
    });
    expect(healthResponseSchema.parse({ status: 'unavailable', database: 'down' })).toEqual({
      status: 'unavailable',
      database: 'down',
    });
  });

  it('rejects an answer that mixes both states', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok', database: 'down' }).success).toBe(false);
  });

  it('is served by GET /api/health with 200 and 503 answers', () => {
    expect(healthEndpoint.method).toBe('get');
    expect(healthEndpoint.path).toBe('/api/health');
    expect(Object.keys(healthEndpoint.responses)).toEqual(['200', '503']);
  });
});

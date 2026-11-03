import { describe, expect, it } from 'vitest';
import * as contracts from './index.js';

describe('package entry point', () => {
  it('exposes the endpoints and the health contract', () => {
    expect(contracts.endpoints).toContain(contracts.healthEndpoint);
    expect(contracts.healthResponseSchema).toBeDefined();
  });

  it('does not pull the OpenAPI generator into the browser bundle', () => {
    expect(Object.keys(contracts)).not.toContain('createOpenApiDocument');
  });
});

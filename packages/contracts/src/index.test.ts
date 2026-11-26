import { describe, expect, it } from 'vitest';
import * as contracts from './index.js';

describe('package entry point', () => {
  it('exposes the endpoints and the health contract', () => {
    expect(contracts.endpoints).toContain(contracts.healthEndpoint);
    expect(contracts.healthResponseSchema).toBeDefined();
  });

  it('exposes the list of the signed-in account’s events among the endpoints', () => {
    expect(contracts.endpoints).toContain(contracts.myEventsEndpoint);
    expect(contracts.myEventsSchema).toBeDefined();
  });

  it('exposes the name a new event of the account starts with among the endpoints', () => {
    expect(contracts.endpoints).toContain(contracts.organizerNameEndpoint);
    expect(contracts.organizerNameSchema).toBeDefined();
  });

  it('exposes the account’s deletion among the endpoints', () => {
    expect(contracts.endpoints).toContain(contracts.sendDeletionCodeEndpoint);
    expect(contracts.endpoints).toContain(contracts.deleteAccountEndpoint);
    expect(contracts.accountDeletionRefusedSchema).toBeDefined();
  });

  it('does not pull the OpenAPI generator into the browser bundle', () => {
    expect(Object.keys(contracts)).not.toContain('createOpenApiDocument');
  });
});

import { endpoints } from '@qando/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { testDependencies } from './test/test-dependencies.js';

// The OpenAPI document lists the contract's endpoints: the API must serve every one of them.
describe('API contract', () => {
  it.each(
    endpoints.map((endpoint) => [`${endpoint.method.toUpperCase()} ${endpoint.path}`, endpoint]),
  )('serves %s with the documented answers', async (_name, endpoint) => {
    // Built in the test, not while the file loads: code run outside a test is checked by
    // mutation testing only by running every test of the API.
    const app = createApp(testDependencies());
    const appWithDatabaseDown = createApp(testDependencies({ databaseUp: false }));
    for (const target of [app, appWithDatabaseDown]) {
      const response = await request(target)[endpoint.method](endpoint.path);

      const documented = endpoint.responses[response.status];
      expect(documented, `status ${response.status} is not in the contract`).toBeDefined();
      expect(documented?.schema.safeParse(response.body).error).toBeUndefined();
    }
  });
});

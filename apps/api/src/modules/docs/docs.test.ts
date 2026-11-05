import { createOpenApiDocument } from '@qando/contracts/openapi';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { testDependencies } from '../../test/test-dependencies.js';

const app = createApp(testDependencies());

describe('API documentation', () => {
  it('serves the OpenAPI document generated from the contracts', async () => {
    const response = await request(app).get('/api/openapi.json');

    expect(response.status).toBe(200);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual(JSON.parse(JSON.stringify(createOpenApiDocument())));
  });

  it('shows Swagger UI at /api/docs', async () => {
    const response = await request(app).get('/api/docs/');

    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
    expect(response.text).toContain('swagger-ui');
  });

  it('points Swagger UI at the served document', async () => {
    const response = await request(app).get('/api/docs/swagger-ui-init.js');

    expect(response.status).toBe(200);
    expect(response.text).toContain('"/api/health"');
  });
});

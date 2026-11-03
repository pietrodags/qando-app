import { describe, expect, it } from 'vitest';
import { endpoints } from './endpoints.js';
import { createOpenApiDocument } from './openapi.js';

describe('createOpenApiDocument', () => {
  const document = createOpenApiDocument();

  it('is an OpenAPI 3.1 document for the qando API', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.info.title).toBe('qando API');
  });

  it('documents every endpoint of the contract, and nothing else', () => {
    const documented = Object.entries(document.paths ?? {}).flatMap(([path, item]) =>
      Object.keys(item).map((method) => `${method} ${path}`),
    );

    expect(documented.sort()).toEqual(endpoints.map((e) => `${e.method} ${e.path}`).sort());
  });

  it('describes the health answers from their Zod schemas', () => {
    const responses = document.paths?.['/api/health']?.get?.responses ?? {};

    expect(Object.keys(responses)).toEqual(['200', '503']);
    expect(document.components?.schemas?.HealthOk).toMatchObject({
      type: 'object',
      properties: {
        status: { type: 'string', const: 'ok' },
        database: { type: 'string', const: 'up' },
      },
      required: ['status', 'database'],
    });
    expect(document.components?.schemas?.HealthUnavailable).toMatchObject({
      properties: {
        status: { type: 'string', const: 'unavailable' },
        database: { type: 'string', const: 'down' },
      },
    });
  });
});

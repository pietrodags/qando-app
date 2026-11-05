import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineEndpoint } from '@qando/contracts';
import { readRequest } from './read-request.js';

const endpoint = defineEndpoint({
  method: 'post',
  path: '/api/things/{id}',
  summary: 'Test',
  tags: [],
  params: z.object({ id: z.string().min(2) }),
  headers: z.object({ 'x-key': z.string().length(3) }),
  body: z.strictObject({ name: z.string(), tags: z.array(z.string()) }),
  responses: {},
});

const requestWith = (parts: { params?: unknown; headers?: unknown; body?: unknown }) =>
  ({ params: { id: 'ab' }, headers: { 'x-key': 'abc' }, body: {}, ...parts }) as Request;

describe('readRequest', () => {
  it('answers the parsed path, headers and body', () => {
    const read = readRequest(
      endpoint,
      requestWith({
        headers: { 'x-key': 'abc', host: 'qando.app' },
        body: { name: 'Luis', tags: ['a'] },
      }),
    );

    expect(read).toEqual({
      ok: true,
      params: { id: 'ab' },
      headers: { 'x-key': 'abc' },
      body: { name: 'Luis', tags: ['a'] },
    });
  });

  it('names every part that breaks its schema, where it travels, and never its value', () => {
    const read = readRequest(
      endpoint,
      requestWith({
        params: { id: 'a' },
        headers: { 'x-key': 'secret-token' },
        body: { name: 'Luis', tags: ['a', 7], extra: true },
      }),
    );

    expect(read).toEqual({
      ok: false,
      problems: [
        { code: 'INVALID_FIELD', in: 'path', path: ['id'] },
        { code: 'INVALID_FIELD', in: 'header', path: ['x-key'] },
        { code: 'INVALID_FIELD', in: 'body', path: ['tags', 1] },
        { code: 'INVALID_FIELD', in: 'body', path: [] },
      ],
    });
    expect(JSON.stringify(read)).not.toContain('secret-token');
  });

  it('names a missing body as the whole body', () => {
    expect(readRequest(endpoint, requestWith({ body: undefined }))).toEqual({
      ok: false,
      problems: [{ code: 'INVALID_FIELD', in: 'body', path: [] }],
    });
  });

  it('names each broken part once', () => {
    const read = readRequest(endpoint, requestWith({ body: { name: 7, tags: [] } }));

    expect(read).toEqual({
      ok: false,
      problems: [{ code: 'INVALID_FIELD', in: 'body', path: ['name'] }],
    });
  });

  it('reads no body for an endpoint without one, whatever the request carries', () => {
    const bodiless = defineEndpoint({
      method: 'get',
      path: '/api/things/{id}',
      summary: 'Test',
      tags: [],
      params: endpoint.params,
      headers: endpoint.headers,
      responses: {},
    });

    const read = readRequest(bodiless, requestWith({ body: { anything: true } }));

    expect(read).toEqual({
      ok: true,
      params: { id: 'ab' },
      headers: { 'x-key': 'abc' },
      body: undefined,
    });
  });
});

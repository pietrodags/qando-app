import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  defineEndpoint,
  errorResponseOf,
  isSuccessStatus,
  successBodyOf,
  urlOf,
  type ErrorResponse,
  type ParamsOf,
  type SuccessBody,
} from './endpoint.js';

const itemEndpoint = defineEndpoint({
  method: 'get',
  path: '/api/item',
  summary: 'Reads the item',
  tags: ['test'],
  responses: {
    200: { description: 'Found', schema: z.object({ name: z.string() }) },
    404: { description: 'Missing', schema: z.object({ code: z.literal('NOT_FOUND') }) },
    503: { description: 'Down', schema: z.object({ code: z.literal('DOWN') }) },
  },
});

describe('endpoint types', () => {
  it('types the success body from the 2xx schemas only', () => {
    expectTypeOf<SuccessBody<typeof itemEndpoint>>().toEqualTypeOf<{ name: string }>();
  });

  it('types each documented error status with its own body', () => {
    expectTypeOf<ErrorResponse<typeof itemEndpoint>>().toEqualTypeOf<
      { status: 404; body: { code: 'NOT_FOUND' } } | { status: 503; body: { code: 'DOWN' } }
    >();
  });
});

describe('isSuccessStatus', () => {
  it.each([200, 201, 204, 299])('treats %i as success', (status) => {
    expect(isSuccessStatus(status)).toBe(true);
  });

  it.each([199, 300, 404, 503])('treats %i as failure', (status) => {
    expect(isSuccessStatus(status)).toBe(false);
  });
});

describe('successBodyOf', () => {
  it('returns the body when it matches a success schema', () => {
    expect(successBodyOf(itemEndpoint, { name: 'Cena' })).toEqual({ name: 'Cena' });
  });

  it('drops fields the contract does not document', () => {
    expect(successBodyOf(itemEndpoint, { name: 'Cena', extra: true })).toEqual({ name: 'Cena' });
  });

  it('rejects a body that only matches an error schema', () => {
    expect(() => successBodyOf(itemEndpoint, { code: 'NOT_FOUND' })).toThrow(
      'GET /api/item answered a body that breaks its contract',
    );
  });
});

describe('errorResponseOf', () => {
  it('returns the status and body of a documented error', () => {
    expect(errorResponseOf(itemEndpoint, 404, { code: 'NOT_FOUND' })).toEqual({
      status: 404,
      body: { code: 'NOT_FOUND' },
    });
  });

  it('is undefined for a status the contract does not document', () => {
    expect(errorResponseOf(itemEndpoint, 500, { code: 'NOT_FOUND' })).toBeUndefined();
  });

  it('is undefined for a success status', () => {
    expect(errorResponseOf(itemEndpoint, 200, { name: 'Cena' })).toBeUndefined();
  });

  it('is undefined when the body breaks the schema of its status', () => {
    expect(errorResponseOf(itemEndpoint, 404, { code: 'DOWN' })).toBeUndefined();
  });
});

const memberEndpoint = defineEndpoint({
  method: 'get',
  path: '/api/teams/{team}/members/{id}',
  summary: 'Reads a member',
  tags: ['test'],
  params: z.object({ team: z.string(), id: z.string() }),
  responses: { 200: { description: 'Found', schema: z.object({}) } },
});

describe('urlOf', () => {
  it('types the parameters from the endpoint, and none when it has none', () => {
    expectTypeOf<ParamsOf<typeof memberEndpoint>>().toEqualTypeOf<{ team: string; id: string }>();
    expectTypeOf<ParamsOf<typeof itemEndpoint>>().toEqualTypeOf<Record<string, never>>();
  });

  it('is the path itself when the endpoint has no parameters', () => {
    expect(urlOf(itemEndpoint, {})).toBe('/api/item');
  });

  it('fills every placeholder with its parameter', () => {
    expect(urlOf(memberEndpoint, { team: 'red', id: '42' })).toBe('/api/teams/red/members/42');
  });

  it('encodes each parameter so it stays one path segment', () => {
    expect(urlOf(memberEndpoint, { team: 'a/b', id: '?x=1 y' })).toBe(
      '/api/teams/a%2Fb/members/%3Fx%3D1%20y',
    );
  });
});

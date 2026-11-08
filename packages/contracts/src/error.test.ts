import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  errorBodySchema,
  internalErrorSchema,
  rateLimitedResponse,
  rateLimitedSchema,
  unauthenticatedSchema,
  validationFailedSchema,
} from './error.js';
import { endpoints } from './endpoints.js';

describe('errorBodySchema', () => {
  const notFound = errorBodySchema('NOT_FOUND', {});

  it('accepts the shared error body with its own code', () => {
    const body = { error: { code: 'NOT_FOUND', message: 'No event has this link', details: [] } };
    expect(notFound.parse(body)).toEqual(body);
  });

  it('rejects another code', () => {
    const body = { error: { code: 'FORBIDDEN', message: 'No', details: [] } };
    expect(notFound.safeParse(body).success).toBe(false);
  });

  it('requires a message and the list of details', () => {
    expect(notFound.safeParse({ error: { code: 'NOT_FOUND', details: [] } }).success).toBe(false);
    expect(notFound.safeParse({ error: { code: 'NOT_FOUND', message: 'No' } }).success).toBe(false);
  });

  it('adds the fields an error carries besides the shared ones', () => {
    const cancelled = errorBodySchema('EVENT_CANCELLED', { title: z.string() });
    const body = {
      error: { code: 'EVENT_CANCELLED', message: 'Cancelled', details: [], title: 'Cena' },
    };

    expect(cancelled.parse(body)).toEqual(body);
    expect(cancelled.safeParse({ error: { ...body.error, title: undefined } }).success).toBe(false);
  });

  it('narrows the details to the problems an error lists', () => {
    const rejected = errorBodySchema('VALIDATION_FAILED', {
      details: z.array(z.object({ code: z.literal('NAME_TOO_SHORT') })),
    });
    const body = (details: unknown[]) => ({
      error: { code: 'VALIDATION_FAILED', message: 'Rejected', details },
    });

    expect(rejected.parse(body([{ code: 'NAME_TOO_SHORT' }]))).toEqual(
      body([{ code: 'NAME_TOO_SHORT' }]),
    );
    expect(rejected.safeParse(body(['anything'])).success).toBe(false);
  });

  it('answers an unexpected failure without saying what failed', () => {
    const body = { error: { code: 'INTERNAL_ERROR', message: 'The request failed', details: [] } };
    expect(internalErrorSchema.parse(body)).toEqual(body);
  });

  it('answers a request without a credential', () => {
    const body = { error: { code: 'UNAUTHENTICATED', message: 'No credential', details: [] } };
    expect(unauthenticatedSchema.parse(body)).toEqual(body);
  });

  it('answers a malformed request', () => {
    const body = { error: { code: 'VALIDATION_FAILED', message: 'Malformed', details: [] } };
    expect(validationFailedSchema.parse(body)).toEqual(body);
  });

  it('names each part of the request that breaks the contract, never its value', () => {
    const body = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Malformed',
        details: [{ code: 'INVALID_FIELD', in: 'body', path: ['votes', 0] }],
      },
    };
    expect(validationFailedSchema.parse(body)).toEqual(body);
    const withValue = { ...body.error.details[0], value: 'Luis' };
    expect(
      validationFailedSchema.parse({ error: { ...body.error, details: [withValue] } }),
    ).toEqual(body);
    expect(
      validationFailedSchema.safeParse({ error: { ...body.error, details: ['broken'] } }).success,
    ).toBe(false);
  });
});

describe('rateLimitedSchema', () => {
  it('is the answer to too many requests from one address', () => {
    const body = { error: { code: 'RATE_LIMITED', message: 'Too many requests', details: [] } };

    expect(rateLimitedSchema.parse(body)).toEqual(body);
    expect(rateLimitedSchema.meta()).toMatchObject({ id: 'RateLimited' });
  });

  it('is documented by every endpoint opened with a capability link', () => {
    const capabilityEndpoints = endpoints.filter(
      (endpoint) =>
        endpoint.path.startsWith('/api/public/') ||
        endpoint.path.startsWith('/api/results/') ||
        endpoint.path.startsWith('/api/events/{id}'),
    );

    expect(capabilityEndpoints.length).toBeGreaterThan(0);
    for (const endpoint of capabilityEndpoints) {
      expect(endpoint.responses[429], endpoint.path).toBe(rateLimitedResponse);
    }
  });
});

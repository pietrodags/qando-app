import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorBodySchema, internalErrorSchema } from './error.js';

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

  it('answers an unexpected failure without saying what failed', () => {
    const body = { error: { code: 'INTERNAL_ERROR', message: 'The request failed', details: [] } };
    expect(internalErrorSchema.parse(body)).toEqual(body);
  });
});

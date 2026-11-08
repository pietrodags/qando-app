import { describe, expect, it } from 'vitest';
import {
  alreadyConfirmedSchema,
  confirmationRejectedSchema,
  confirmOptionBodySchema,
  confirmOptionEndpoint,
} from './confirm-option.js';
import { managedEventSchema } from './managed-event.js';

const july10 = '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11';

describe('confirm option contract', () => {
  it('takes the ID of the option to confirm', () => {
    expect(confirmOptionBodySchema.parse({ optionId: july10 })).toEqual({ optionId: july10 });
  });

  it.each([
    ['no option', {}],
    ['an option ID that is no UUID', { optionId: '10' }],
    ['a field that is not part of the contract', { optionId: july10, note: 'final' }],
  ])('rejects a body with %s', (_name, body) => {
    expect(confirmOptionBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects an option that is not of the event, naming it', () => {
    const body = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Not an option of this event',
        details: [{ code: 'OPTION_UNKNOWN', optionId: july10 }],
      },
    };
    expect(confirmationRejectedSchema.parse(body)).toEqual(body);
  });

  it('rejects a broken body with the part that breaks it', () => {
    const body = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request breaks the contract',
        details: [{ code: 'INVALID_FIELD', in: 'body', path: ['optionId'] }],
      },
    };
    expect(confirmationRejectedSchema.parse(body)).toEqual(body);
  });

  it('refuses a second confirmation with ALREADY_CONFIRMED', () => {
    const body = { error: { code: 'ALREADY_CONFIRMED', message: 'Confirmed', details: [] } };
    expect(alreadyConfirmedSchema.parse(body)).toEqual(body);
  });

  it('is served by POST /api/events/{id}/confirmation and answers the managed event', () => {
    expect(confirmOptionEndpoint.method).toBe('post');
    expect(confirmOptionEndpoint.path).toBe('/api/events/{id}/confirmation');
    expect(confirmOptionEndpoint.body).toBe(confirmOptionBodySchema);
    expect(confirmOptionEndpoint.responses[200].schema).toBe(managedEventSchema);
    expect(Object.keys(confirmOptionEndpoint.responses)).toEqual([
      '200',
      '400',
      '401',
      '403',
      '409',
      '410',
      '429',
      '500',
    ]);
    expect(confirmOptionEndpoint.params.safeParse({ id: '' }).success).toBe(false);
    expect(
      confirmOptionEndpoint.headers.parse({ 'x-management-token': 'a'.repeat(22), cookie: 'a=1' }),
    ).toEqual({ 'x-management-token': 'a'.repeat(22) });
  });
});

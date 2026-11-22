import { describe, expect, it } from 'vitest';
import { validationFailedSchema } from '../error.js';
import { optionsChangedSchema } from '../public-events/public-event.js';
import {
  alreadyConfirmedSchema,
  confirmationConflictSchema,
  confirmOptionBodySchema,
  confirmOptionEndpoint,
} from './confirm-option.js';
import { managedEventSchema } from './managed-event.js';

const july10 = '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11';

describe('confirm option contract', () => {
  it('takes the ID of the option to confirm', () => {
    expect(confirmOptionBodySchema.parse({ optionId: july10 })).toEqual({ optionId: july10 });
  });

  it('reads the ID in lower case, as it is stored', () => {
    expect(confirmOptionBodySchema.parse({ optionId: july10.toUpperCase() })).toEqual({
      optionId: july10,
    });
  });

  it.each([
    ['no option', {}],
    ['an option ID that is no UUID', { optionId: '10' }],
    ['a field that is not part of the contract', { optionId: july10, note: 'final' }],
  ])('rejects a body with %s', (_name, body) => {
    expect(confirmOptionBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects only a broken body, with the part that breaks it', () => {
    expect(confirmOptionEndpoint.responses[400].schema).toBe(validationFailedSchema);
  });

  it('refuses a second confirmation with ALREADY_CONFIRMED', () => {
    const body = { error: { code: 'ALREADY_CONFIRMED', message: 'Confirmed', details: [] } };
    expect(alreadyConfirmedSchema.parse(body)).toEqual(body);
  });

  it('refuses an option that is not the event’s now with OPTIONS_CHANGED, as a conflict', () => {
    const conflict = (code: string) => ({ error: { code, message: 'No', details: [] } });
    expect(confirmationConflictSchema.safeParse(conflict('ALREADY_CONFIRMED')).success).toBe(true);
    expect(confirmationConflictSchema.safeParse(conflict('OPTIONS_CHANGED')).success).toBe(true);
    expect(confirmationConflictSchema.safeParse(conflict('VOTING_CLOSED')).success).toBe(false);
    expect(optionsChangedSchema.safeParse(conflict('OPTIONS_CHANGED')).success).toBe(true);
    expect(confirmOptionEndpoint.responses[409].schema).toBe(confirmationConflictSchema);
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

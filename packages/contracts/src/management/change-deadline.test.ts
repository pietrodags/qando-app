import { describe, expect, it } from 'vitest';
import { eventCancelledSchema } from '../public-events/public-event.js';
import {
  changeDeadlineBodySchema,
  changeDeadlineEndpoint,
  closeVotingEndpoint,
  deadlineRejectedSchema,
} from './change-deadline.js';
import { alreadyConfirmedSchema } from './confirm-option.js';
import { managedEventSchema } from './managed-event.js';

describe('change deadline contract', () => {
  it('takes the new deadline as a calendar date, nothing else', () => {
    expect(changeDeadlineBodySchema.parse({ deadline: '2026-07-03' })).toEqual({
      deadline: '2026-07-03',
    });
    expect(changeDeadlineBodySchema.safeParse({ deadline: '2026-07-32' }).success).toBe(false);
    expect(changeDeadlineBodySchema.safeParse({ deadline: '3 July' }).success).toBe(false);
    expect(changeDeadlineBodySchema.safeParse({}).success).toBe(false);
    expect(
      changeDeadlineBodySchema.safeParse({ deadline: '2026-07-03', timeZone: 'Europe/Madrid' })
        .success,
    ).toBe(false);
  });

  it('refuses a deadline before today or beyond the twelve months, or a broken request', () => {
    const refused = (code: string) => ({
      error: { code: 'VALIDATION_FAILED', message: 'No', details: [{ code }] },
    });
    expect(deadlineRejectedSchema.safeParse(refused('DEADLINE_PAST')).success).toBe(true);
    expect(deadlineRejectedSchema.safeParse(refused('DEADLINE_TOO_FAR')).success).toBe(true);
    expect(deadlineRejectedSchema.safeParse(refused('NOTE_TOO_LONG')).success).toBe(false);
    expect(
      deadlineRejectedSchema.safeParse({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'No',
          details: [{ code: 'INVALID_FIELD', in: 'body', path: ['deadline'] }],
        },
      }).success,
    ).toBe(true);
  });

  it('is served by PATCH /api/events/{id}/deadline, answering the event', () => {
    expect(changeDeadlineEndpoint.method).toBe('patch');
    expect(changeDeadlineEndpoint.path).toBe('/api/events/{id}/deadline');
    expect(changeDeadlineEndpoint.body).toBe(changeDeadlineBodySchema);
    expect(changeDeadlineEndpoint.responses[200].schema).toBe(managedEventSchema);
    expect(changeDeadlineEndpoint.responses[400].schema).toBe(deadlineRejectedSchema);
    expect(changeDeadlineEndpoint.responses[409].schema).toBe(alreadyConfirmedSchema);
    expect(changeDeadlineEndpoint.responses[410].schema).toBe(eventCancelledSchema);
    expect(Object.keys(changeDeadlineEndpoint.responses)).toEqual([
      '200',
      '400',
      '401',
      '403',
      '409',
      '410',
      '429',
      '500',
    ]);
  });
});

describe('close voting contract', () => {
  it('is served by POST /api/events/{id}/close with no body, answering the event', () => {
    expect(closeVotingEndpoint.method).toBe('post');
    expect(closeVotingEndpoint.path).toBe('/api/events/{id}/close');
    expect('body' in closeVotingEndpoint).toBe(false);
    expect(closeVotingEndpoint.responses[200].schema).toBe(managedEventSchema);
    expect(closeVotingEndpoint.responses[409].schema).toBe(alreadyConfirmedSchema);
    expect(closeVotingEndpoint.responses[410].schema).toBe(eventCancelledSchema);
    expect(Object.keys(closeVotingEndpoint.responses)).toEqual([
      '200',
      '400',
      '401',
      '403',
      '409',
      '410',
      '429',
      '500',
    ]);
  });

  it('takes the event of the link and reads only the management token among the headers', () => {
    for (const endpoint of [changeDeadlineEndpoint, closeVotingEndpoint]) {
      expect(endpoint.params.parse({ id: 'k3Jd9' })).toEqual({ id: 'k3Jd9' });
      expect(
        endpoint.headers.parse({ 'x-management-token': 'a'.repeat(22), cookie: 'a=1' }),
      ).toEqual({ 'x-management-token': 'a'.repeat(22) });
    }
  });
});

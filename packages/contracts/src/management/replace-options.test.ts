import { describe, expect, it } from 'vitest';
import { eventCancelledSchema, optionsChangedSchema } from '../public-events/public-event.js';
import { managedEventSchema } from './managed-event.js';
import {
  optionsConflictSchema,
  optionsRejectedSchema,
  replaceOptionsBodySchema,
  replaceOptionsEndpoint,
  votesExistSchema,
} from './replace-options.js';

const july6 = '6a1e0c9b-1f4e-4b8e-9a51-0c1d2e3f4a06';
const july10 = '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c10';
const july11 = { dates: { kind: 'single', date: '2026-07-11' }, time: null } as const;

describe('replace options contract', () => {
  it('takes the new options and the IDs of the options they replace', () => {
    const body = { options: [july11], replacesOptionIds: [july6, july10] };
    expect(replaceOptionsBodySchema.parse(body)).toEqual(body);
  });

  it('reads the IDs it started from in lower case, as they are stored', () => {
    const body = { options: [july11], replacesOptionIds: [july6.toUpperCase(), july10] };
    expect(replaceOptionsBodySchema.parse(body).replacesOptionIds).toEqual([july6, july10]);
  });

  it.each([
    ['no options', { replacesOptionIds: [july6] }],
    ['no options replaced', { options: [july11] }],
    ['a replaced ID that is no UUID', { options: [july11], replacesOptionIds: ['6'] }],
    ['an option with an ID', { options: [{ ...july11, id: july6 }], replacesOptionIds: [july6] }],
    ['a title', { options: [july11], replacesOptionIds: [july6], title: 'Cena' }],
  ])('rejects a body with %s', (_case, body) => {
    expect(replaceOptionsBodySchema.safeParse(body).success).toBe(false);
  });

  it('refuses options that break a rule of the list or of one option, or a broken request', () => {
    const rejected = (detail: object) => ({
      error: { code: 'VALIDATION_FAILED', message: 'No', details: [detail] },
    });
    for (const detail of [
      { code: 'NO_OPTIONS' },
      { code: 'TOO_MANY_OPTIONS' },
      { code: 'DATE_PAST', index: 0 },
      { code: 'DUPLICATE', index: 2 },
      { code: 'INVALID_FIELD', in: 'body', path: ['options', 0, 'dates'] },
    ]) {
      expect(optionsRejectedSchema.safeParse(rejected(detail)).success, detail.code).toBe(true);
    }
    for (const detail of [
      { code: 'DATE_PAST' },
      { code: 'DEADLINE_PAST' },
      { code: 'TITLE_MISSING' },
      { code: 'MANAGEMENT_TOKEN_TAKEN' },
    ]) {
      expect(optionsRejectedSchema.safeParse(rejected(detail)).success, detail.code).toBe(false);
    }
  });

  it('answers a confirmed or closed event, one with votes or with other options as conflicts', () => {
    const conflict = (code: string) => ({ error: { code, message: 'No', details: [] } });
    expect(votesExistSchema.parse(conflict('VOTES_EXIST'))).toEqual(conflict('VOTES_EXIST'));
    for (const code of ['ALREADY_CONFIRMED', 'VOTING_CLOSED', 'VOTES_EXIST', 'OPTIONS_CHANGED']) {
      expect(optionsConflictSchema.safeParse(conflict(code)).success, code).toBe(true);
    }
    expect(optionsConflictSchema.safeParse(conflict('EMAIL_NOT_FAILED')).success).toBe(false);
    expect(optionsChangedSchema.safeParse(conflict('VOTES_EXIST')).success).toBe(false);
  });

  it('is served by PUT /api/events/{id}/options, answering the event', () => {
    expect(replaceOptionsEndpoint.method).toBe('put');
    expect(replaceOptionsEndpoint.path).toBe('/api/events/{id}/options');
    expect(replaceOptionsEndpoint.body).toBe(replaceOptionsBodySchema);
    expect(replaceOptionsEndpoint.responses[200].schema).toBe(managedEventSchema);
    expect(replaceOptionsEndpoint.responses[400].schema).toBe(optionsRejectedSchema);
    expect(replaceOptionsEndpoint.responses[409].schema).toBe(optionsConflictSchema);
    expect(replaceOptionsEndpoint.responses[410].schema).toBe(eventCancelledSchema);
    expect(Object.keys(replaceOptionsEndpoint.responses)).toEqual([
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

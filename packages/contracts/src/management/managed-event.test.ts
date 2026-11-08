import { describe, expect, it } from 'vitest';
import {
  managedEventEndpoint,
  managedEventSchema,
  managementForbiddenSchema,
  managementHeadersSchema,
  type ManagedEvent,
} from './managed-event.js';

const july10 = {
  id: '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11',
  dates: { kind: 'single', date: '2026-07-10' },
  time: null,
} as const;

const cena: ManagedEvent = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  state: 'open',
  options: [july10],
  confirmedOption: null,
  voters: 2,
  recommendedOptionIds: [july10.id],
  participationId: 'k3Jd9aB2cD4eF6gH8iJ0kL',
  resultsId: 'Qw7p2aB2cD4eF6gH8iJ0kL',
};

describe('managed event contract', () => {
  it('accepts what the management page shows of an event', () => {
    expect(managedEventSchema.parse(cena)).toEqual(cena);
  });

  it('accepts a confirmed event with no recommended option', () => {
    const confirmed = {
      ...cena,
      state: 'confirmed',
      confirmedOption: july10,
      recommendedOptionIds: [],
    };
    expect(managedEventSchema.parse(confirmed)).toEqual(confirmed);
  });

  it.each([
    ['an unknown state', { ...cena, state: 'cancelled' }],
    ['a negative vote count', { ...cena, voters: -1 }],
    ['a vote count that is not whole', { ...cena, voters: 1.5 }],
    ['a recommended option that is no option ID', { ...cena, recommendedOptionIds: ['10'] }],
  ])('rejects %s', (_name, event) => {
    expect(managedEventSchema.safeParse(event).success).toBe(false);
  });

  it('drops fields that are not part of the contract', () => {
    const leaked = { ...cena, organizerEmail: 'ana@example.com', managementTokenHash: 'a1' };
    expect(managedEventSchema.parse(leaked)).toEqual(cena);
  });

  it('reads the management token, which may be missing, from its header', () => {
    const token = 'Zx81aB2cD4eF6gH8iJ0kLm';
    expect(managementHeadersSchema.parse({ 'x-management-token': token, cookie: 'a=1' })).toEqual({
      'x-management-token': token,
    });
    expect(managementHeadersSchema.parse({})).toEqual({});
  });

  it.each([
    ['too short', 'a'.repeat(21)],
    ['too long', 'a'.repeat(65)],
    ['not base64url', `${'a'.repeat(21)}+`],
  ])('rejects a management token %s', (_name, token) => {
    expect(managementHeadersSchema.safeParse({ 'x-management-token': token }).success).toBe(false);
  });

  it('accepts management tokens of 22 to 64 base64url characters', () => {
    for (const token of ['a'.repeat(22), 'A0_-'.repeat(16)]) {
      expect(managementHeadersSchema.safeParse({ 'x-management-token': token }).success).toBe(true);
    }
  });

  it('refuses a credential that does not manage the event with FORBIDDEN', () => {
    const body = { error: { code: 'FORBIDDEN', message: 'Not this event', details: [] } };
    expect(managementForbiddenSchema.parse(body)).toEqual(body);
  });

  it('is served by GET /api/events/{id} with 200, 400, 401, 403, 410, 429 and 500', () => {
    expect(managedEventEndpoint.method).toBe('get');
    expect(managedEventEndpoint.path).toBe('/api/events/{id}');
    expect(Object.keys(managedEventEndpoint.responses)).toEqual([
      '200',
      '400',
      '401',
      '403',
      '410',
      '429',
      '500',
    ]);
    expect(managedEventEndpoint.params.parse({ id: 'k3Jd9' })).toEqual({ id: 'k3Jd9' });
    expect(managedEventEndpoint.params.safeParse({ id: '' }).success).toBe(false);
  });
});

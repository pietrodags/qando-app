import { describe, expect, it } from 'vitest';
import {
  eventCancelledSchema,
  optionSchema,
  publicEventEndpoint,
  publicEventSchema,
  type PublicEvent,
} from './public-event.js';

const july10 = {
  id: '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11',
  dates: { kind: 'single', date: '2026-07-10' },
  time: null,
} as const;

const cena: PublicEvent = {
  title: 'Cena de verano',
  organizerName: 'Ana',
  note: null,
  deadline: '2026-07-01',
  timeZone: 'Europe/Madrid',
  anonymous: false,
  state: 'open',
  options: [july10],
  confirmedOption: null,
};

describe('option contract', () => {
  it.each([
    ['a whole day', { dates: { kind: 'single', date: '2026-07-10' }, time: null }],
    [
      'a range of days',
      { dates: { kind: 'range', start: '2026-07-10', end: '2026-07-12' }, time: null },
    ],
    [
      'a day at a time',
      { dates: { kind: 'single', date: '2026-07-10' }, time: { kind: 'single', at: '21:00' } },
    ],
    [
      'a day between two times',
      {
        dates: { kind: 'single', date: '2026-07-10' },
        time: { kind: 'range', start: '09:00', end: '13:30' },
      },
    ],
  ])('accepts %s', (_name, option) => {
    expect(optionSchema.safeParse({ id: july10.id, ...option }).success).toBe(true);
  });

  it.each([
    ['an impossible date', { ...july10, dates: { kind: 'single', date: '2026-09-31' } }],
    [
      'a date with a time inside',
      { ...july10, dates: { kind: 'single', date: '2026-07-10T10:00' } },
    ],
    ['a time with seconds', { ...july10, time: { kind: 'single', at: '21:00:00' } }],
    ['an hour past 23', { ...july10, time: { kind: 'single', at: '24:00' } }],
    ['minutes past 59', { ...july10, time: { kind: 'single', at: '21:60' } }],
    ['an unknown kind of dates', { ...july10, dates: { kind: 'week', date: '2026-07-10' } }],
    ['an id that is not a UUID', { ...july10, id: 'jul-10' }],
  ])('rejects %s', (_name, option) => {
    expect(optionSchema.safeParse(option).success).toBe(false);
  });
});

describe('public event contract', () => {
  it('accepts an open event with no confirmed option', () => {
    expect(publicEventSchema.parse(cena)).toEqual(cena);
  });

  it('accepts a confirmed event with its confirmed option', () => {
    const confirmed = { ...cena, state: 'confirmed', confirmedOption: july10 };
    expect(publicEventSchema.parse(confirmed)).toEqual(confirmed);
  });

  it('rejects a state that is not open, closed or confirmed', () => {
    expect(publicEventSchema.safeParse({ ...cena, state: 'cancelled' }).success).toBe(false);
  });

  it('drops private fields that are not part of the contract', () => {
    const leaked = { ...cena, organizerEmail: 'ana@example.com', managementTokenHash: 'x' };
    expect(publicEventSchema.parse(leaked)).toEqual(cena);
  });

  it('carries the title of a cancelled event in its error', () => {
    const body = {
      error: {
        code: 'EVENT_CANCELLED',
        message: 'Cancelled',
        details: [],
        title: 'Cena de verano',
      },
    };
    expect(eventCancelledSchema.parse(body)).toEqual(body);
  });

  it('is served by GET /api/public/events/{id} with 200, 400, 404, 410 and 500 answers', () => {
    expect(publicEventEndpoint.method).toBe('get');
    expect(publicEventEndpoint.path).toBe('/api/public/events/{id}');
    expect(Object.keys(publicEventEndpoint.responses)).toEqual(['200', '400', '404', '410', '500']);
    expect(publicEventEndpoint.params.parse({ id: 'k3P9x' })).toEqual({ id: 'k3P9x' });
  });
});

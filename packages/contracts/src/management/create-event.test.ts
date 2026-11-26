import { describe, expect, it } from 'vitest';
import { crossSiteSessionSchema } from '../auth/sign-out.js';
import { unauthenticatedSchema } from '../error.js';
import {
  createEventBodySchema,
  createEventEndpoint,
  createEventHeadersSchema,
  eventCreatedSchema,
  eventRejectedSchema,
} from './create-event.js';

const cena = {
  title: 'Cena de verano',
  organizerName: 'Ana',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  anonymous: false,
  options: [
    { dates: { kind: 'single', date: '2026-07-06' }, time: null },
    { dates: { kind: 'range', start: '2026-07-10', end: '2026-07-12' }, time: null },
    { dates: { kind: 'single', date: '2026-07-14' }, time: { kind: 'single', at: '20:00' } },
    {
      dates: { kind: 'single', date: '2026-07-15' },
      time: { kind: 'range', start: '20:00', end: '22:30' },
    },
  ],
};

describe('create event contract', () => {
  it('takes the event as the wizard sends it, with or without a note', () => {
    expect(createEventBodySchema.parse(cena)).toEqual(cena);
    expect(createEventBodySchema.parse({ ...cena, note: 'Trae postre.' })).toEqual({
      ...cena,
      note: 'Trae postre.',
    });
  });

  it.each([
    ['no title', { ...cena, title: undefined }],
    ['no organizer name', { ...cena, organizerName: undefined }],
    ['a time zone the runtime does not know', { ...cena, timeZone: 'Europe/Atlantis' }],
    ['a time zone written as an offset', { ...cena, timeZone: '-02:00' }],
    ['a deadline that is no calendar date', { ...cena, deadline: '1 July' }],
    ['no anonymous switch', { ...cena, anonymous: undefined }],
    ['a note that is no text', { ...cena, note: 5 }],
    ['no options', { ...cena, options: undefined }],
    ['an option with an ID', { ...cena, options: [{ ...cena.options[0], id: 'x' }] }],
    ['an option without its time', { ...cena, options: [{ dates: cena.options[0]?.dates }] }],
    [
      'a time that is no clock time',
      { ...cena, options: [{ ...cena.options[0], time: { kind: 'single', at: '8pm' } }] },
    ],
    ['the email the session already says', { ...cena, organizerEmail: 'ana@example.com' }],
    ['a sign-in code', { ...cena, verification: { email: 'ana@example.com', code: '123456' } }],
  ])('rejects a body with %s', (_name, body) => {
    expect(createEventBodySchema.safeParse(body).success).toBe(false);
  });

  it('takes the management token the page created in its header, and no other header', () => {
    const token = 'A0_-'.repeat(6);
    expect(createEventHeadersSchema.parse({ 'x-management-token': token, cookie: 'a=1' })).toEqual({
      'x-management-token': token,
    });
    for (const headers of [{}, { 'x-management-token': 'a'.repeat(21) }]) {
      expect(createEventHeadersSchema.safeParse(headers).success).toBe(false);
    }
  });

  it('answers the new event’s participation and results IDs, never its management token', () => {
    const created = {
      participationId: 'uHuaiU4BzZfa7oUR2OC3QQ',
      resultsId: 'Re0YVYWmRfkSlDvhAzL-Yw',
    };
    expect(eventCreatedSchema.parse({ ...created, managementToken: 'a'.repeat(22) })).toEqual(
      created,
    );
  });

  it('refuses a management token that holds an event of another account, saying nothing else', () => {
    const body = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The event was rejected',
        details: [{ code: 'MANAGEMENT_TOKEN_TAKEN' }],
      },
    };
    expect(eventRejectedSchema.parse(body)).toEqual(body);
  });

  it('rejects an event with every rule it breaks, an option’s by its place in the list', () => {
    const body = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The event was rejected',
        details: [
          { code: 'INVALID_FIELD', in: 'body', path: ['options', 0, 'time'] },
          { code: 'NAME_MISSING' },
          { code: 'NAME_TOO_SHORT' },
          { code: 'NAME_TOO_LONG' },
          { code: 'TITLE_MISSING' },
          { code: 'TITLE_TOO_LONG' },
          { code: 'NO_OPTIONS' },
          { code: 'TOO_MANY_OPTIONS' },
          { code: 'DATE_PAST', index: 0 },
          { code: 'DATE_TOO_FAR', index: 1 },
          { code: 'DATE_RANGE_DEGENERATE', index: 2 },
          { code: 'TIME_ON_DATE_RANGE', index: 3 },
          { code: 'TIME_OFF_QUARTER', index: 4 },
          { code: 'TIME_RANGE_DEGENERATE', index: 5 },
          { code: 'TIME_RANGE_WITHIN_ONE_HOUR', index: 6 },
          { code: 'WHOLE_DAY_WITH_TIMES', index: 7 },
          { code: 'DUPLICATE', index: 8 },
          { code: 'DEADLINE_PAST' },
          { code: 'DEADLINE_TOO_FAR' },
          { code: 'NOTE_TOO_LONG' },
        ],
      },
    };
    expect(eventRejectedSchema.parse(body)).toEqual(body);
    const unplaced = { code: 'DUPLICATE' };
    expect(
      eventRejectedSchema.safeParse({ error: { ...body.error, details: [unplaced] } }).success,
    ).toBe(false);
  });

  it('is served by POST /api/events, to a session with the token in its header', () => {
    expect(createEventEndpoint.method).toBe('post');
    expect(createEventEndpoint.path).toBe('/api/events');
    expect(createEventEndpoint.headers).toBe(createEventHeadersSchema);
    expect(createEventEndpoint.body).toBe(createEventBodySchema);
    expect(createEventEndpoint.responses[201].schema).toBe(eventCreatedSchema);
    expect(createEventEndpoint.responses[400].schema).toBe(eventRejectedSchema);
    expect(createEventEndpoint.responses[401].schema).toBe(unauthenticatedSchema);
    expect(createEventEndpoint.responses[403].schema).toBe(crossSiteSessionSchema);
    expect(Object.keys(createEventEndpoint.responses)).toEqual(['201', '400', '401', '403', '500']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  dateInterpretationBodySchema,
  dateInterpretationEndpoint,
  dateInterpretationSchema,
} from './date-interpretation.js';

const body = { text: 'los viernes de julio', timeZone: 'Europe/Madrid' };

describe('date interpretation request', () => {
  it('takes a phrase, the browser’s time zone and, when it has one, its region', () => {
    expect(dateInterpretationBodySchema.parse(body)).toEqual(body);
    expect(dateInterpretationBodySchema.parse({ ...body, region: 'US' })).toEqual({
      ...body,
      region: 'US',
    });
  });

  it('trims the phrase before counting its 1 to 120 characters', () => {
    const longest = 'a'.repeat(120);

    expect(dateInterpretationBodySchema.parse({ ...body, text: `  ${longest}\n` }).text).toBe(
      longest,
    );
    expect(dateInterpretationBodySchema.parse({ ...body, text: ' a ' }).text).toBe('a');
    expect(dateInterpretationBodySchema.safeParse({ ...body, text: `${longest}a` }).success).toBe(
      false,
    );
    expect(dateInterpretationBodySchema.safeParse({ ...body, text: '' }).success).toBe(false);
    expect(dateInterpretationBodySchema.safeParse({ ...body, text: ' \n\t ' }).success).toBe(false);
  });

  it.each(['Europe/Madrid', 'America/Argentina/Buenos_Aires', 'Asia/Kolkata', 'UTC'])(
    'takes the time zone %s',
    (timeZone) => {
      expect(dateInterpretationBodySchema.safeParse({ ...body, timeZone }).success).toBe(true);
    },
  );

  it.each(['', 'Madrid', 'Mars/Olympus_Mons', 'Europe/Madrid ', 'Etc/Unknown'])(
    'refuses "%s", which names no time zone',
    (timeZone) => {
      expect(dateInterpretationBodySchema.safeParse({ ...body, timeZone }).success).toBe(false);
    },
  );

  it.each(['ES', 'US', '419', 'es', 'Spain', ''])(
    'takes the region "%s": one the reader does not know is read as none, never refused',
    (region) => {
      expect(dateInterpretationBodySchema.safeParse({ ...body, region }).success).toBe(true);
    },
  );

  it('refuses a region that is no text', () => {
    expect(dateInterpretationBodySchema.safeParse({ ...body, region: 34 }).success).toBe(false);
    expect(dateInterpretationBodySchema.safeParse({ ...body, region: null }).success).toBe(false);
  });

  it('refuses a body without the phrase or the time zone, or with anything else', () => {
    expect(dateInterpretationBodySchema.safeParse({ text: body.text }).success).toBe(false);
    expect(dateInterpretationBodySchema.safeParse({ timeZone: body.timeZone }).success).toBe(false);
    expect(dateInterpretationBodySchema.safeParse({ ...body, today: '2026-06-15' }).success).toBe(
      false,
    );
  });
});

describe('date interpretation answer', () => {
  const answer = {
    options: [
      { dates: { kind: 'single', date: '2026-06-19' }, time: null },
      {
        dates: { kind: 'range', start: '2026-08-03', end: '2026-08-07' },
        time: null,
      },
      { dates: { kind: 'single', date: '2026-06-20' }, time: { kind: 'single', at: '21:00' } },
      {
        dates: { kind: 'single', date: '2026-06-26' },
        time: { kind: 'range', start: '22:00', end: '03:00', nextDay: true },
      },
      {
        dates: { kind: 'single', date: '2026-06-27' },
        time: { kind: 'range', start: '10:00', end: '12:00' },
      },
      { dates: { kind: 'single', date: '2026-07-03' }, time: { kind: 'question', question: 0 } },
    ],
    questions: [
      {
        fragment: 'a las 8',
        dates: ['2026-07-03'],
        morning: { kind: 'single', at: '08:00' },
        afternoon: { kind: 'single', at: '20:00' },
      },
      {
        fragment: 'de 8 a 9',
        dates: ['2026-07-04', '2026-07-05'],
        morning: { kind: 'range', start: '08:00', end: '09:00' },
        afternoon: { kind: 'range', start: '20:00', end: '21:00' },
      },
    ],
    notices: [
      { kind: 'timeUnclear', fragment: 'por la tarde', dates: ['2026-06-19'] },
      { kind: 'tooLate', fragment: 'de 22 a 8', dates: [] },
      {
        kind: 'dayNotWritten',
        fragment: 'a medianoche',
        dates: ['2026-06-20'],
        written: 'weekday',
      },
      { kind: 'dayNotWritten', fragment: 'a medianoche', dates: ['2026-06-21'], written: 'date' },
      { kind: 'unclear', fragment: 'con todos' },
      { kind: 'mismatch', fragment: 'el 31 de junio' },
      { kind: 'mismatch' },
      { kind: 'past', fragment: 'ayer' },
      { kind: 'horizon', fragment: 'en 2030' },
      { kind: 'tooMany' },
    ],
  };

  it('carries the options, the questions and the notices of a phrase', () => {
    expect(dateInterpretationSchema.parse(answer)).toEqual(answer);
  });

  it('carries nothing for a phrase that says nothing', () => {
    const nothing = { options: [], questions: [], notices: [] };

    expect(dateInterpretationSchema.parse(nothing)).toEqual(nothing);
  });

  const single = { kind: 'single', date: '2026-06-19' };
  it.each([
    ['a day that is no date', { dates: { kind: 'single', date: '19/06/2026' }, time: null }],
    ['a range without its end', { dates: { kind: 'range', start: '2026-06-19' }, time: null }],
    ['no time, not even null', { dates: single }],
    ['a time that is no clock time', { dates: single, time: { kind: 'single', at: '24:00' } }],
    ['a time written without minutes', { dates: single, time: { kind: 'single', at: '21' } }],
    [
      'a range that says it does not end the next day',
      { dates: single, time: { kind: 'range', start: '22:00', end: '03:00', nextDay: false } },
    ],
    ['a question that is no place', { dates: single, time: { kind: 'question', question: -1 } }],
    ['a question between two places', { dates: single, time: { kind: 'question', question: 0.5 } }],
  ])('refuses an option with %s', (_, option) => {
    expect(dateInterpretationSchema.safeParse({ ...answer, options: [option] }).success).toBe(
      false,
    );
  });

  it.each([
    ['a kind the contract does not list', { kind: 'unknown', fragment: 'x' }],
    ['a time not understood of no fragment', { kind: 'timeUnclear', dates: [] }],
    ['a time not understood without its dates', { kind: 'timeUnclear', fragment: 'x' }],
    [
      'a day not written that does not say how it was',
      { kind: 'dayNotWritten', fragment: 'x', dates: [] },
    ],
    [
      'a day not written in an unknown way',
      { kind: 'dayNotWritten', fragment: 'x', dates: [], written: 'month' },
    ],
    ['a date that is none', { kind: 'tooLate', fragment: 'x', dates: ['mañana'] }],
  ])('refuses a notice with %s', (_, notice) => {
    expect(dateInterpretationSchema.safeParse({ ...answer, notices: [notice] }).success).toBe(
      false,
    );
  });

  it('refuses a question without its words or one of its two readings, or of a date that is none', () => {
    const fragment = 'a las 8';
    const dates = ['2026-07-03'];
    const morning = { kind: 'single', at: '08:00' };
    const afternoon = { kind: 'single', at: '20:00' };

    for (const broken of [
      { dates, morning, afternoon },
      { fragment, dates, morning },
      { fragment, dates, afternoon },
      { fragment, dates: ['x'], morning, afternoon },
    ]) {
      expect(dateInterpretationSchema.safeParse({ ...answer, questions: [broken] }).success).toBe(
        false,
      );
    }
  });
});

describe('date interpretation endpoint', () => {
  it('is served by POST /api/date-interpretations with 200, 400, 403, 429 and 500 answers', () => {
    expect(dateInterpretationEndpoint.method).toBe('post');
    expect(dateInterpretationEndpoint.path).toBe('/api/date-interpretations');
    expect(dateInterpretationEndpoint.body).toBe(dateInterpretationBodySchema);
    expect(Object.keys(dateInterpretationEndpoint.responses)).toEqual([
      '200',
      '400',
      '403',
      '429',
      '500',
    ]);
    expect(dateInterpretationEndpoint.responses[200].schema).toBe(dateInterpretationSchema);
  });
});

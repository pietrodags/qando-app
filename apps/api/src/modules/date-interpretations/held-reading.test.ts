import type { DatesRead } from '@qando/date-reader';
import { describe, expect, it } from 'vitest';
import { heldReading } from './held-reading.js';

type Option = DatesRead['options'][number];
type Question = DatesRead['questions'][number];
type TimeRead = Question['morning'];

const at = (time: string) => ({ kind: 'single', at: time }) as const;
const range = (start: string, end: string, nextDay?: true): TimeRead => ({
  kind: 'range',
  start,
  end,
  ...(nextDay && { nextDay }),
});
const day = (date: string, time: Option['time'] = null): Option => ({
  dates: { kind: 'single', date },
  time,
});
const asked = (question: number) => ({ kind: 'question', question }) as const;

/** A reading of these options and questions, without notices. */
const reading = (options: Option[], questions: Question[] = []): DatesRead => ({
  options,
  questions,
  notices: [],
});

const nothingLeftOut = { timesLeftOut: [], questionsNotAsked: [] };

describe('heldReading', () => {
  it('keeps every time an event can hold, and a range of days as it is', () => {
    const days = { kind: 'range', start: '2026-08-03', end: '2026-08-07' } as const;
    const notices: DatesRead['notices'] = [{ kind: 'past', fragment: 'ayer' }];

    expect(
      heldReading({
        options: [
          day('2026-06-19', at('21:00')),
          day('2026-06-19', range('20:30', '21:00')),
          day('2026-06-20'),
          { dates: days, time: null },
        ],
        questions: [],
        notices,
      }),
    ).toEqual({
      options: [
        day('2026-06-19', at('21:00')),
        day('2026-06-19', range('20:30', '21:00')),
        day('2026-06-20'),
        { dates: days, time: null },
      ],
      questions: [],
      notices,
      ...nothingLeftOut,
    });
  });

  it('leaves a range within a single clock hour out of its day, marked as a whole day', () => {
    expect(heldReading(reading([day('2026-06-26', range('20:00', '20:30'))]))).toEqual({
      options: [day('2026-06-26')],
      questions: [],
      notices: [],
      timesLeftOut: [{ time: range('20:00', '20:30'), dates: ['2026-06-26'] }],
      questionsNotAsked: [],
    });
  });

  it('leaves a range that ends on the next day out of its day', () => {
    const late = range('22:00', '03:00', true);

    expect(heldReading(reading([day('2026-06-19', late)]))).toMatchObject({
      options: [day('2026-06-19')],
      timesLeftOut: [{ time: late, dates: ['2026-06-19'] }],
    });
  });

  it('tells a range left out once with every day it was said of, and each range left out of a day', () => {
    expect(
      heldReading(
        reading([
          day('2026-06-19', range('20:00', '20:30')),
          day('2026-06-19', range('21:00', '21:30')),
          day('2026-06-20', range('20:00', '20:30')),
          day('2026-06-20', range('20:00', '20:30')),
        ]),
      ),
    ).toMatchObject({
      options: [day('2026-06-19'), day('2026-06-20')],
      timesLeftOut: [
        { time: range('20:00', '20:30'), dates: ['2026-06-19', '2026-06-20'] },
        { time: range('21:00', '21:30'), dates: ['2026-06-19'] },
      ],
    });
  });

  it('tells apart a range that ends on its day and the same one ending on the next', () => {
    expect(
      heldReading(
        reading([
          day('2026-06-19', range('23:00', '23:30')),
          day('2026-06-20', range('23:00', '23:30', true)),
        ]),
      ).timesLeftOut,
    ).toEqual([
      { time: range('23:00', '23:30'), dates: ['2026-06-19'] },
      { time: range('23:00', '23:30', true), dates: ['2026-06-20'] },
    ]);
  });

  it('marks no whole day for a day another option gives a time, before or after it', () => {
    expect(
      heldReading(
        reading([
          day('2026-06-26', range('20:00', '20:30')),
          day('2026-06-26', at('18:00')),
          day('2026-06-27', at('18:00')),
          day('2026-06-27', range('20:00', '20:30')),
        ]),
      ).options,
    ).toEqual([day('2026-06-26', at('18:00')), day('2026-06-27', at('18:00'))]);
  });

  it('asks no question neither of whose readings an event can hold, and numbers again the questions still asked', () => {
    const notAsked = {
      fragment: 'de 9 a 9:30',
      dates: ['2026-06-22'],
      morning: range('09:00', '09:30'),
      afternoon: range('21:00', '21:30'),
    };
    const stillAsked = {
      fragment: 'a las 8',
      dates: ['2026-06-16'],
      morning: at('08:00'),
      afternoon: at('20:00'),
    };

    expect(
      heldReading(
        reading([day('2026-06-22', asked(0)), day('2026-06-16', asked(1))], [notAsked, stillAsked]),
      ),
    ).toEqual({
      options: [day('2026-06-22'), day('2026-06-16', asked(0))],
      questions: [stillAsked],
      notices: [],
      timesLeftOut: [],
      questionsNotAsked: [notAsked],
    });
  });

  it('marks a day once when a question not asked leaves it without the time another range left out of it', () => {
    const notAsked = {
      fragment: 'de 9 a 9:30',
      dates: ['2026-06-19'],
      morning: range('09:00', '09:30'),
      afternoon: range('21:00', '21:30'),
    };

    expect(
      heldReading(
        reading(
          [day('2026-06-19', range('21:00', '21:30')), day('2026-06-19', asked(0))],
          [notAsked],
        ),
      ),
    ).toMatchObject({
      options: [day('2026-06-19')],
      timesLeftOut: [{ time: range('21:00', '21:30'), dates: ['2026-06-19'] }],
      questionsNotAsked: [notAsked],
    });
  });

  it.each([
    // "el sábado de 8 a 20:30": the afternoon's reading is within one clock hour.
    ['afternoon', 'de 8 a 20:30', range('08:00', '20:30'), range('20:00', '20:30')],
    // "el lunes de 08:00 a 8:30": the morning's is.
    ['morning', 'de 08:00 a 8:30', range('08:00', '08:30'), range('08:00', '20:30')],
  ] as const)(
    'still asks a question only one of whose readings an event can hold, saying the %s one it cannot',
    (leftOut, fragment, morning, afternoon) => {
      const question = { fragment, dates: ['2026-06-20'], morning, afternoon };
      const other = {
        fragment: 'a las 8',
        dates: ['2026-06-21'],
        morning: at('08:00'),
        afternoon: at('20:00'),
      };

      expect(
        heldReading(
          reading([day('2026-06-20', asked(0)), day('2026-06-21', asked(1))], [question, other]),
        ),
      ).toEqual({
        options: [day('2026-06-20', asked(0)), day('2026-06-21', asked(1))],
        questions: [{ ...question, leftOut }, other],
        notices: [],
        ...nothingLeftOut,
      });
    },
  );
});

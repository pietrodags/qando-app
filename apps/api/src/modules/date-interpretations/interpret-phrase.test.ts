import { dateInterpretationSchema } from '@qando/contracts';
import { describe, expect, it } from 'vitest';
import type { EditPhrase } from '../../phrase-editor/phrase-editor.js';
import { phraseInterpreter } from './interpret-phrase.js';

/** Monday 15 June 2026, at 10:00 in Madrid. */
const mondayMorning = new Date('2026-06-15T08:00:00Z');

/** An editor that records what it is asked and answers every phrase with the same one. */
function editorAnswering(edited: string) {
  const asked: string[] = [];
  const editPhrase: EditPhrase = (phrase) => {
    asked.push(phrase);
    return Promise.resolve(edited);
  };
  return { asked, editPhrase };
}

describe('phraseInterpreter', () => {
  it('reads the phrase as the editor writes it when the caller asks for the copy edit', async () => {
    const { asked, editPhrase } = editorAnswering('el sábado a las 21:00');
    const interpret = phraseInterpreter(editPhrase, () => mondayMorning);

    const reading = await interpret({ text: 'sab 21h', timeZone: 'Europe/Madrid', copyEdit: true });

    expect(asked).toEqual(['sab 21h']);
    expect(reading).toEqual({
      options: [
        { dates: { kind: 'single', date: '2026-06-20' }, time: { kind: 'single', at: '21:00' } },
      ],
      questions: [],
      notices: [],
      timesLeftOut: [],
      questionsNotAsked: [],
    });
  });

  it('reads the phrase as given, asking no editor, when the caller leaves the copy edit out', async () => {
    const { asked, editPhrase } = editorAnswering('el sábado a las 21:00');
    const interpret = phraseInterpreter(editPhrase, () => mondayMorning);

    const reading = await interpret({
      text: 'el viernes a las 8',
      timeZone: 'Europe/Madrid',
      copyEdit: false,
    });

    expect(asked).toEqual([]);
    expect(reading).toEqual({
      options: [
        { dates: { kind: 'single', date: '2026-06-19' }, time: { kind: 'question', question: 0 } },
      ],
      questions: [
        {
          fragment: 'a las 8',
          dates: ['2026-06-19'],
          morning: { kind: 'single', at: '08:00' },
          afternoon: { kind: 'single', at: '20:00' },
        },
      ],
      notices: [],
      timesLeftOut: [],
      questionsNotAsked: [],
    });
  });

  it('answers what an event can hold of the reading', async () => {
    const interpret = phraseInterpreter(
      (phrase) => Promise.resolve(phrase),
      () => mondayMorning,
    );

    const reading = await interpret({
      text: 'el lunes de 9 a 9:30 y el viernes de 20:00 a 20:30',
      timeZone: 'Europe/Madrid',
      copyEdit: false,
    });

    expect(reading).toEqual({
      options: [
        { dates: { kind: 'single', date: '2026-06-22' }, time: null },
        { dates: { kind: 'single', date: '2026-06-19' }, time: null },
      ],
      questions: [],
      notices: [],
      timesLeftOut: [
        { time: { kind: 'range', start: '20:00', end: '20:30' }, dates: ['2026-06-19'] },
      ],
      questionsNotAsked: [
        {
          fragment: 'de 9 a 9:30',
          dates: ['2026-06-22'],
          morning: { kind: 'range', start: '09:00', end: '09:30' },
          afternoon: { kind: 'range', start: '21:00', end: '21:30' },
        },
      ],
    });
  });

  it('still asks about a time only one of whose readings an event can hold, saying which it cannot', async () => {
    const interpret = phraseInterpreter(
      (phrase) => Promise.resolve(phrase),
      () => mondayMorning,
    );

    const reading = await interpret({
      text: 'el sábado de 8 a 20:30 y el lunes de 08:00 a 8:30',
      timeZone: 'Europe/Madrid',
      copyEdit: false,
    });

    expect(reading).toEqual({
      options: [
        { dates: { kind: 'single', date: '2026-06-20' }, time: { kind: 'question', question: 0 } },
        { dates: { kind: 'single', date: '2026-06-22' }, time: { kind: 'question', question: 1 } },
      ],
      questions: [
        {
          fragment: 'de 8 a 20:30',
          dates: ['2026-06-20'],
          morning: { kind: 'range', start: '08:00', end: '20:30' },
          afternoon: { kind: 'range', start: '20:00', end: '20:30' },
          leftOut: 'afternoon',
        },
        {
          fragment: 'de 08:00 a 8:30',
          dates: ['2026-06-22'],
          morning: { kind: 'range', start: '08:00', end: '08:30' },
          afternoon: { kind: 'range', start: '08:00', end: '20:30' },
          leftOut: 'morning',
        },
      ],
      notices: [],
      timesLeftOut: [],
      questionsNotAsked: [],
    });
  });

  it('asks nothing of a time whose readings both end after midnight, which the answer can carry', async () => {
    const interpret = phraseInterpreter(
      (phrase) => Promise.resolve(phrase),
      () => mondayMorning,
    );

    const reading = await interpret({
      text: 'el viernes de las doce menos cuarto a medianoche',
      timeZone: 'Europe/Madrid',
      copyEdit: false,
    });

    expect(reading).toEqual({
      options: [{ dates: { kind: 'single', date: '2026-06-19' }, time: null }],
      questions: [],
      notices: [],
      timesLeftOut: [],
      questionsNotAsked: [
        {
          fragment: 'de las doce menos cuarto a medianoche',
          dates: ['2026-06-19'],
          morning: { kind: 'range', start: '11:45', end: '00:00', nextDay: true },
          afternoon: { kind: 'range', start: '23:45', end: '00:00', nextDay: true },
        },
      ],
    });
    expect(dateInterpretationSchema.parse(reading)).toEqual(reading);
  });

  it('takes today, the time now and the order of a date in figures from the caller’s time zone and region', async () => {
    // 00:30 of Tuesday in Madrid, 18:30 of Monday in New York.
    const interpret = phraseInterpreter(
      (phrase) => Promise.resolve(phrase),
      () => new Date('2026-06-15T22:30:00Z'),
    );

    const inMadrid = await interpret({
      text: 'mañana y el 7/8',
      timeZone: 'Europe/Madrid',
      copyEdit: false,
    });
    const inNewYork = await interpret({
      text: 'mañana y el 7/8',
      timeZone: 'America/New_York',
      region: 'US',
      copyEdit: false,
    });

    expect(inMadrid.options.map((option) => option.dates)).toEqual([
      { kind: 'single', date: '2026-06-17' },
      { kind: 'single', date: '2026-08-07' },
    ]);
    expect(inNewYork.options.map((option) => option.dates)).toEqual([
      { kind: 'single', date: '2026-06-16' },
      { kind: 'single', date: '2026-07-08' },
    ]);
  });
});

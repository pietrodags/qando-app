import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { callTool, resultOf, revisions, type Revision } from '../../test/assistant.js';
import { testDependencies } from '../../test/test-dependencies.js';

/** Monday 15 June 2026, at 10:00 in Madrid. */
const mondayMorning = new Date('2026-06-15T08:00:00Z');

const clarify = 'Antes de crear el evento, aclara las preguntas y los avisos con el organizador.';

/**
 * The API with the connector open to Ana's assistant, on a clock stopped at `now`; `edited`
 * collects every phrase the text editor is asked to copy-edit.
 */
function connector({ now = mondayMorning, edited = [] as string[] } = {}) {
  return createApp({
    ...testDependencies({ now }),
    editPhrase: (phrase) => {
      edited.push(phrase);
      return Promise.resolve(phrase);
    },
    connectorAccess: (serve) => (calling) => serve(calling, 'ana'),
  });
}

type App = ReturnType<typeof connector>;

interface Answer {
  content: { type: string; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

/** What "Leer fechas de una frase" answers for what the call gives it. */
async function reading(
  args: Record<string, unknown>,
  { app = connector(), revision = '2026-07-28' }: { app?: App; revision?: Revision } = {},
): Promise<Answer> {
  const response = await callTool(app, revision, 'read_date_phrase', {}, args);
  expect(response.status).toBe(200);
  return resultOf(response) as Answer;
}

/** The words of the answer for a phrase read in Madrid. */
async function words(phrase: string, app = connector()): Promise<string> {
  const answer = await reading({ phrase, timeZone: 'Europe/Madrid' }, { app });
  expect(answer.isError).toBeUndefined();
  return answer.content.map(({ text }) => text).join('\n');
}

describe('"Leer fechas de una frase" (read_date_phrase)', () => {
  describe('what it reads', () => {
    it.each(revisions)(
      'answers an assistant of the %s revision the options of the phrase, in words and as the same data, without asking the text editor',
      async (revision) => {
        const edited: string[] = [];
        const answer = await reading(
          { phrase: 'el viernes o el sábado a las 9 de la noche', timeZone: 'Europe/Madrid' },
          { app: connector({ edited }), revision },
        );

        expect(answer.content).toEqual([
          {
            type: 'text',
            text: [
              'Hemos leído 2 opciones:',
              '- viernes 19 de junio, 21:00',
              '- sábado 20 de junio, 21:00',
            ].join('\n'),
          },
        ]);
        expect(answer.structuredContent).toEqual({
          options: [
            {
              dates: { kind: 'single', date: '2026-06-19' },
              time: { kind: 'single', at: '21:00' },
            },
            {
              dates: { kind: 'single', date: '2026-06-20' },
              time: { kind: 'single', at: '21:00' },
            },
          ],
          questions: [],
          notices: [],
          timesLeftOut: [],
          questionsNotAsked: [],
        });
        expect(edited).toEqual([]);
      },
    );

    it('reads today and the time now in the time zone the assistant gives', async () => {
      // 01:30 of Tuesday in Madrid, 19:30 of Monday in New York.
      const app = connector({ now: new Date('2026-06-15T23:30:00Z') });

      const madrid = await reading({ phrase: 'mañana', timeZone: 'Europe/Madrid' }, { app });
      const newYork = await reading({ phrase: 'mañana', timeZone: 'America/New_York' }, { app });

      expect(madrid.content[0]?.text).toBe(
        'Hemos leído 1 opción:\n- miércoles 17 de junio, todo el día',
      );
      expect(newYork.content[0]?.text).toBe(
        'Hemos leído 1 opción:\n- martes 16 de junio, todo el día',
      );
    });

    it('reads the phrase without the spaces around it', async () => {
      expect(await words('  el viernes a las 21:00  ')).toBe(
        'Hemos leído 1 opción:\n- viernes 19 de junio, 21:00',
      );
    });

    it.each([
      ['el viernes de 20:00 a 22:00', '- viernes 19 de junio, de 20:00 a 22:00'],
      ['del 1 al 5 de julio', '- del miércoles 1 al domingo 5 de julio'],
      ['del 30 de junio al 2 de julio', '- del martes 30 de junio al jueves 2 de julio'],
    ])('says the option of "%s" as "%s"', async (phrase, option) => {
      expect(await words(phrase)).toBe(`Hemos leído 1 opción:\n${option}`);
    });
  });

  describe('the questions', () => {
    it('gives a time said without its half of the day as both readings of a numbered question, and asks to clarify it first', async () => {
      const answer = await reading({ phrase: 'el sábado a las 8', timeZone: 'Europe/Madrid' });

      expect(answer.content[0]?.text).toBe(
        [
          'Hemos leído 1 opción:',
          '- sábado 20 de junio, 8:00 o 20:00 (pregunta 1)',
          'Preguntas:',
          '1. «a las 8» del sábado 20 de junio: ¿mañana (8:00) o tarde (20:00)?',
          clarify,
        ].join('\n'),
      );
      expect(answer.structuredContent).toEqual({
        options: [
          {
            dates: { kind: 'single', date: '2026-06-20' },
            time: { kind: 'question', question: 0 },
          },
        ],
        questions: [
          {
            fragment: 'a las 8',
            dates: ['2026-06-20'],
            morning: { kind: 'single', at: '08:00' },
            afternoon: { kind: 'single', at: '20:00' },
          },
        ],
        notices: [],
        timesLeftOut: [],
        questionsNotAsked: [],
      });
    });

    it('names every day a question is asked of', async () => {
      expect(await words('el viernes a las 8 y el sábado a las 8')).toBe(
        [
          'Hemos leído 2 opciones:',
          '- viernes 19 de junio, 8:00 o 20:00 (pregunta 1)',
          '- sábado 20 de junio, 8:00 o 20:00 (pregunta 1)',
          'Preguntas:',
          '1. «a las 8» del viernes 19 de junio y del sábado 20 de junio: ¿mañana (8:00) o tarde (20:00)?',
          clarify,
        ].join('\n'),
      );
    });

    it('numbers each question and gives a time range in both readings as it was read', async () => {
      expect(await words('el sábado de 5 a 7 y el domingo a las 8')).toBe(
        [
          'Hemos leído 2 opciones:',
          '- sábado 20 de junio, de 5:00 a 7:00 o de 17:00 a 19:00 (pregunta 1)',
          '- domingo 21 de junio, 8:00 o 20:00 (pregunta 2)',
          'Preguntas:',
          '1. «de 5 a 7» del sábado 20 de junio: ¿mañana (de 5:00 a 7:00) o tarde (de 17:00 a 19:00)?',
          '2. «a las 8» del domingo 21 de junio: ¿mañana (8:00) o tarde (20:00)?',
          clarify,
        ].join('\n'),
      );
    });
  });

  describe('the notices', () => {
    it('says what was not read, quoting the words of the phrase, and asks to clarify it first', async () => {
      const answer = await reading({
        phrase: 'el viernes por la tarde, el sábado a medianoche y el 31 de junio',
        timeZone: 'Europe/Madrid',
      });

      expect(answer.content[0]?.text).toBe(
        [
          'Hemos leído 2 opciones:',
          '- viernes 19 de junio, todo el día',
          '- domingo 21 de junio, 0:00',
          'Avisos:',
          '- Hemos leído el viernes 19 de junio, pero no hemos entendido la hora («por la tarde»).',
          '- «a medianoche» es las 0:00 del día siguiente: hemos leído el domingo 21 de junio.',
          '- Hay algo que no encaja en tu petición («el 31 de junio»). Revísala e inténtalo de nuevo.',
          clarify,
        ].join('\n'),
      );
      expect(answer.structuredContent).toMatchObject({
        notices: [
          { kind: 'timeUnclear', dates: ['2026-06-19'], fragment: 'por la tarde' },
          {
            kind: 'dayNotWritten',
            dates: ['2026-06-21'],
            written: 'weekday',
            fragment: 'a medianoche',
          },
          { kind: 'mismatch', fragment: 'el 31 de junio' },
        ],
      });
    });

    it.each([
      ['el 10 de junio', '- La fecha ya pasó («el 10 de junio»). Revísala e inténtalo de nuevo.'],
      ['el 20 de julio de 2027', '- Solo puedes proponer fechas de los próximos 12 meses.'],
      [
        'hoy a las 9 de la mañana',
        '- Esa hora ya pasó («a las 9 de la mañana»). Revísala e inténtalo de nuevo.',
      ],
      [
        'todos los días de julio y agosto',
        '- Son demasiadas fechas (máximo 60). Acota tu petición.',
      ],
      [
        'todos los días de los próximos tres meses',
        '- No hemos entendido bien tu petición. Prueba a ser más específico.',
      ],
      ['blabla', '- Hay algo que no encaja en tu petición. Revísala e inténtalo de nuevo.'],
      [
        'el «31 de junio»',
        '- Hay algo que no encaja en tu petición («el “31 de junio»). Revísala e inténtalo de nuevo.',
      ],
    ])('reads nothing of "%s" and says "%s"', async (phrase, notice) => {
      expect(await words(phrase)).toBe(
        ['No hemos leído ninguna fecha.', 'Avisos:', notice, clarify].join('\n'),
      );
    });

    it('says a time not understood of no day as a request not understood', async () => {
      expect(await words('el viernes a las 18:00 y por la tarde')).toBe(
        [
          'Hemos leído 1 opción:',
          '- viernes 19 de junio, 18:00',
          'Avisos:',
          '- No hemos entendido bien tu petición («por la tarde»). Prueba a ser más específico.',
          clarify,
        ].join('\n'),
      );
    });

    it('says that a time range ending after 6:00 of the next day was not read', async () => {
      expect(await words('el viernes de 22 a 8')).toBe(
        [
          'Hemos leído 1 opción:',
          '- viernes 19 de junio, todo el día',
          'Avisos:',
          '- Hemos leído el viernes 19 de junio, pero no el horario («de 22 a 8»): un horario tiene que terminar el mismo día en que empieza.',
          clarify,
        ].join('\n'),
      );
    });

    it('names every day midnight was read as', async () => {
      expect(await words('el viernes y el sábado a medianoche')).toBe(
        [
          'Hemos leído 2 opciones:',
          '- sábado 20 de junio, 0:00',
          '- domingo 21 de junio, 0:00',
          'Avisos:',
          '- «a medianoche» es las 0:00 del día siguiente: hemos leído el sábado 20 de junio y el domingo 21 de junio.',
          clarify,
        ].join('\n'),
      );
    });
  });

  describe('a time range an event cannot hold', () => {
    it('leaves one within a single clock hour out of its day, read as a whole day, and says why and what to use instead', async () => {
      const answer = await reading({
        phrase: 'el viernes 26 de 20:00 a 20:30',
        timeZone: 'Europe/Madrid',
      });

      expect(answer.content[0]?.text).toBe(
        [
          'Hemos leído 1 opción:',
          '- viernes 26 de junio, todo el día',
          'Avisos:',
          '- Hemos leído el viernes 26 de junio, pero no el horario de 20:00 a 20:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa 20:00–21:00 o solo las 20:00.',
          clarify,
        ].join('\n'),
      );
      expect(answer.structuredContent).toEqual({
        options: [{ dates: { kind: 'single', date: '2026-06-26' }, time: null }],
        questions: [],
        notices: [],
        timesLeftOut: [
          { time: { kind: 'range', start: '20:00', end: '20:30' }, dates: ['2026-06-26'] },
        ],
        questionsNotAsked: [],
      });
    });

    it('leaves one that ends on the next day out of its day, and says why and what to use instead', async () => {
      const answer = await reading({
        phrase: 'el viernes de 22:00 a 3:00',
        timeZone: 'Europe/Madrid',
      });

      expect(answer.content[0]?.text).toBe(
        [
          'Hemos leído 1 opción:',
          '- viernes 19 de junio, todo el día',
          'Avisos:',
          '- Hemos leído el viernes 19 de junio, pero no el horario de 22:00 a 3:00 del día siguiente: un horario tiene que terminar el mismo día en que empieza. Usa solo las 22:00 o un horario que termine antes de medianoche.',
          clarify,
        ].join('\n'),
      );
      expect(answer.structuredContent).toMatchObject({
        options: [{ dates: { kind: 'single', date: '2026-06-19' }, time: null }],
        timesLeftOut: [
          {
            time: { kind: 'range', start: '22:00', end: '03:00', nextDay: true },
            dates: ['2026-06-19'],
          },
        ],
      });
    });

    it.each([
      [
        'el viernes de 23:00 a 23:30',
        'de 23:00 a 23:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa solo las 23:00.',
      ],
      [
        'el viernes de 23:30 a 1:00',
        'de 23:30 a 1:00 del día siguiente: un horario tiene que terminar el mismo día en que empieza. Usa solo las 23:30.',
      ],
      [
        'el viernes de 01:00 a 01:30',
        'de 1:00 a 1:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa 1:00–2:00 o solo la 1:00.',
      ],
      [
        'el viernes de 21:15 a 21:45',
        'de 21:15 a 21:45: un horario tiene que terminar en una hora posterior a la que empieza. Usa 21:15–22:00 o solo las 21:15.',
      ],
    ])('says of "%s" that the range %s', async (phrase, range) => {
      expect(await words(phrase)).toBe(
        [
          'Hemos leído 1 opción:',
          '- viernes 19 de junio, todo el día',
          'Avisos:',
          `- Hemos leído el viernes 19 de junio, pero no el horario ${range}`,
          clarify,
        ].join('\n'),
      );
    });

    it('asks no question neither of whose readings an event can hold, and leaves both out of its day', async () => {
      const answer = await reading({ phrase: 'el lunes de 9 a 9:30', timeZone: 'Europe/Madrid' });

      expect(answer.content[0]?.text).toBe(
        [
          'Hemos leído 1 opción:',
          '- lunes 22 de junio, todo el día',
          'Avisos:',
          '- Hemos leído el lunes 22 de junio, pero no el horario de 9:00 a 9:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa 9:00–10:00 o solo las 9:00.',
          '- Hemos leído el lunes 22 de junio, pero no el horario de 21:00 a 21:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa 21:00–22:00 o solo las 21:00.',
          clarify,
        ].join('\n'),
      );
      expect(answer.structuredContent).toEqual({
        options: [{ dates: { kind: 'single', date: '2026-06-22' }, time: null }],
        questions: [],
        notices: [],
        timesLeftOut: [],
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

    it('names a day once when a question not asked leaves out a range already left out of it', async () => {
      const answer = await reading({
        phrase: 'el viernes de 21:00 a 21:30 o de 9 a 9:30',
        timeZone: 'Europe/Madrid',
      });

      expect(answer.content[0]?.text).toBe(
        [
          'Hemos leído 1 opción:',
          '- viernes 19 de junio, todo el día',
          'Avisos:',
          '- Hemos leído el viernes 19 de junio, pero no el horario de 21:00 a 21:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa 21:00–22:00 o solo las 21:00.',
          '- Hemos leído el viernes 19 de junio, pero no el horario de 9:00 a 9:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa 9:00–10:00 o solo las 9:00.',
          clarify,
        ].join('\n'),
      );
      expect(answer.structuredContent).toMatchObject({
        timesLeftOut: [
          { time: { kind: 'range', start: '21:00', end: '21:30' }, dates: ['2026-06-19'] },
        ],
        questionsNotAsked: [{ fragment: 'de 9 a 9:30', dates: ['2026-06-19'] }],
      });
    });

    it('numbers again the questions still asked', async () => {
      const answer = await reading({
        phrase: 'el lunes de 9 a 9:30 y el martes a las 8',
        timeZone: 'Europe/Madrid',
      });

      expect(answer.content[0]?.text).toBe(
        [
          'Hemos leído 2 opciones:',
          '- lunes 22 de junio, todo el día',
          '- martes 16 de junio, 8:00 o 20:00 (pregunta 1)',
          'Preguntas:',
          '1. «a las 8» del martes 16 de junio: ¿mañana (8:00) o tarde (20:00)?',
          'Avisos:',
          '- Hemos leído el lunes 22 de junio, pero no el horario de 9:00 a 9:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa 9:00–10:00 o solo las 9:00.',
          '- Hemos leído el lunes 22 de junio, pero no el horario de 21:00 a 21:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa 21:00–22:00 o solo las 21:00.',
          clarify,
        ].join('\n'),
      );
      expect(answer.structuredContent).toMatchObject({
        options: [
          { dates: { kind: 'single', date: '2026-06-22' }, time: null },
          {
            dates: { kind: 'single', date: '2026-06-16' },
            time: { kind: 'question', question: 0 },
          },
        ],
        questions: [{ fragment: 'a las 8', dates: ['2026-06-16'] }],
      });
    });

    it('keeps a range that ends in a later hour', async () => {
      expect(await words('el viernes de 20:30 a 21:00')).toBe(
        'Hemos leído 1 opción:\n- viernes 19 de junio, de 20:30 a 21:00',
      );
    });

    it('offers no whole day for a day another option gives a time', async () => {
      const answer = await reading({
        phrase: 'el viernes 26 a las 18:00 y de 20:00 a 20:30',
        timeZone: 'Europe/Madrid',
      });

      expect(answer.content[0]?.text).toBe(
        [
          'Hemos leído 1 opción:',
          '- viernes 26 de junio, 18:00',
          'Avisos:',
          '- Hemos leído el viernes 26 de junio, pero no el horario de 20:00 a 20:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa 20:00–21:00 o solo las 20:00.',
          clarify,
        ].join('\n'),
      );
      expect(answer.structuredContent).toMatchObject({
        options: [
          { dates: { kind: 'single', date: '2026-06-26' }, time: { kind: 'single', at: '18:00' } },
        ],
      });
    });

    it('offers a day once when two of its ranges are left out, and says each', async () => {
      expect(await words('el viernes de 20:00 a 20:30 y de 21:00 a 21:30')).toBe(
        [
          'Hemos leído 1 opción:',
          '- viernes 19 de junio, todo el día',
          'Avisos:',
          '- Hemos leído el viernes 19 de junio, pero no el horario de 20:00 a 20:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa 20:00–21:00 o solo las 20:00.',
          '- Hemos leído el viernes 19 de junio, pero no el horario de 21:00 a 21:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa 21:00–22:00 o solo las 21:00.',
          clarify,
        ].join('\n'),
      );
    });

    it('says a range left out of several days once, with every day', async () => {
      const answer = await reading({
        phrase: 'el viernes y el sábado de 20:00 a 20:30',
        timeZone: 'Europe/Madrid',
      });

      expect(answer.content[0]?.text).toBe(
        [
          'Hemos leído 2 opciones:',
          '- viernes 19 de junio, todo el día',
          '- sábado 20 de junio, todo el día',
          'Avisos:',
          '- Hemos leído el viernes 19 de junio y el sábado 20 de junio, pero no el horario de 20:00 a 20:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa 20:00–21:00 o solo las 20:00.',
          clarify,
        ].join('\n'),
      );
      expect(answer.structuredContent).toMatchObject({
        timesLeftOut: [
          {
            time: { kind: 'range', start: '20:00', end: '20:30' },
            dates: ['2026-06-19', '2026-06-20'],
          },
        ],
      });
    });
  });

  describe('what it is given', () => {
    it.each([
      [
        'a phrase of more than 120 characters',
        { phrase: 'a'.repeat(121), timeZone: 'Europe/Madrid' },
      ],
      ['a phrase of spaces alone', { phrase: '   ', timeZone: 'Europe/Madrid' }],
      ['no time zone', { phrase: 'el viernes' }],
      ['a time zone the runtime does not know', { phrase: 'el viernes', timeZone: 'Mars/Olympus' }],
      ['an offset in place of a time zone', { phrase: 'el viernes', timeZone: '+02:00' }],
    ])('reads nothing of a call with %s, and says what does not fit', async (_case, args) => {
      const answer = await reading(args);

      expect(answer.isError).toBe(true);
      expect(answer.structuredContent).toBeUndefined();
      expect(answer.content[0]?.text).toContain('Input validation error');
    });

    it('reads a phrase of 120 characters, and refuses one of 121', async () => {
      // The spaces inside the phrase count; those around it are not read.
      const read = `el${' '.repeat(111)}viernes`;
      const longer = `el${' '.repeat(112)}viernes`;
      expect([read.length, longer.length]).toEqual([120, 121]);

      expect(await words(read)).toBe('Hemos leído 1 opción:\n- viernes 19 de junio, todo el día');
      expect((await reading({ phrase: longer, timeZone: 'Europe/Madrid' })).isError).toBe(true);
    });
  });
});

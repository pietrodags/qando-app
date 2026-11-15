import { dateInterpretationEndpoint, successBodyOf } from '@qando/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import {
  CopyEditRefused,
  phraseEditor,
  type CopyEdit,
  type EditPhrase,
  type PhraseEditLogEntry,
} from '../../phrase-editor/phrase-editor.js';
import {
  testDependencies,
  testSessionCookie,
  testTrustedOrigin,
} from '../../test/test-dependencies.js';

/** Monday 15 June 2026, at 10:00 in Madrid. */
const mondayMorning = new Date('2026-06-15T08:00:00Z');

/** The app at a moment; phrases are read as written unless the test brings an editor. */
function appAt(now: Date = mondayMorning, editPhrase?: EditPhrase) {
  return createApp({ ...testDependencies({ now }), ...(editPhrase && { editPhrase }) });
}

/** An editor that records the phrases it is asked to edit and answers each as written. */
function recordingEditor() {
  const asked: string[] = [];
  const editPhrase: EditPhrase = (phrase) => {
    asked.push(phrase);
    return Promise.resolve(phrase);
  };
  return { asked, editPhrase };
}

const madrid = (text: string) => ({ text, timeZone: 'Europe/Madrid' });

const interpret = (app: ReturnType<typeof appAt>, body: unknown, ip = '1.1.1.1') =>
  request(app)
    .post('/api/date-interpretations')
    .set('Origin', testTrustedOrigin)
    .set('X-Forwarded-For', ip)
    .send(body as object);

/** The error a refused request answered. */
const errorOf = (response: request.Response) =>
  (response.body as { error: { code: string; details: unknown[] } }).error;

const day = (date: string) => ({ kind: 'single', date });
const at = (time: string) => ({ kind: 'single', at: time });

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/date-interpretations', () => {
  it('answers the options a phrase says, never cached', async () => {
    const response = await interpret(appAt(), madrid('el viernes a las 21:00 y el sábado'));

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      options: [
        { dates: day('2026-06-19'), time: at('21:00') },
        { dates: day('2026-06-20'), time: null },
      ],
      questions: [],
      notices: [],
    });
  });

  it('asks about a bare hour instead of guessing its half of the day', async () => {
    const response = await interpret(appAt(), madrid('el viernes a las 8'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      options: [{ dates: day('2026-06-19'), time: { kind: 'question', question: 0 } }],
      questions: [
        {
          fragment: 'a las 8',
          dates: ['2026-06-19'],
          morning: at('08:00'),
          afternoon: at('20:00'),
        },
      ],
      notices: [],
    });
  });

  it('answers what it understood with a notice for each fragment it did not', async () => {
    const response = await interpret(appAt(), madrid('el 31 de junio y el sábado por la tarde'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      options: [{ dates: day('2026-06-20'), time: null }],
      questions: [],
      notices: [
        { kind: 'mismatch', fragment: 'el 31 de junio' },
        { kind: 'timeUnclear', fragment: 'por la tarde', dates: ['2026-06-20'] },
      ],
    });
  });

  it('answers a phrase that says no date with its notice alone, not with an error', async () => {
    const response = await interpret(appAt(), madrid('asdf'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ options: [], questions: [], notices: [{ kind: 'mismatch' }] });
  });

  it.each([
    'el viernes a las 21:00 y el sábado',
    'el viernes a las 8',
    'el 31 de junio y el sábado por la tarde',
    'el viernes de 22 a 3',
    'del 3 al 7 de agosto',
    'el sábado a medianoche',
    'ayer',
    'todos los días del año',
    'asdf',
  ])('answers "%s" as the contract describes', async (text) => {
    const response = await interpret(appAt(), madrid(text));

    expect(successBodyOf(dateInterpretationEndpoint, response.body)).toEqual(response.body);
  });

  describe('today and the time now', () => {
    it('takes today in the request’s time zone', async () => {
      // 00:30 of Tuesday in Madrid, 18:30 of Monday in New York.
      const app = appAt(new Date('2026-06-15T22:30:00Z'));

      const inMadrid = await interpret(app, madrid('mañana'));
      const inNewYork = await interpret(app, { text: 'mañana', timeZone: 'America/New_York' });

      expect(inMadrid.body).toMatchObject({ options: [{ dates: day('2026-06-17') }] });
      expect(inNewYork.body).toMatchObject({ options: [{ dates: day('2026-06-16') }] });
    });

    it('takes the time now in the request’s time zone: a time of today already past is not marked', async () => {
      // 17:30 in Madrid, 16:30 in London.
      const app = appAt(new Date('2026-06-15T15:30:00Z'));

      const inMadrid = await interpret(app, madrid('hoy a las 17:00'));
      const inLondon = await interpret(app, { text: 'hoy a las 17:00', timeZone: 'Europe/London' });

      expect(inMadrid.body).toEqual({
        options: [],
        questions: [],
        notices: [{ kind: 'past', fragment: 'a las 17:00' }],
      });
      expect(inLondon.body).toEqual({
        options: [{ dates: day('2026-06-15'), time: at('17:00') }],
        questions: [],
        notices: [],
      });
    });

    it('takes the minutes of a time zone that is not whole hours from UTC', async () => {
      // 17:15 in Kolkata.
      const app = appAt(new Date('2026-06-15T11:45:00Z'));
      const kolkata = (text: string) => ({ text, timeZone: 'Asia/Kolkata' });

      const before = await interpret(app, kolkata('hoy a las 17:00'));
      const after = await interpret(app, kolkata('hoy a las 17:30'));

      expect(before.body).toMatchObject({ options: [], notices: [{ kind: 'past' }] });
      expect(after.body).toMatchObject({
        options: [{ dates: day('2026-06-15'), time: at('17:30') }],
      });
    });

    it('starts the day at 00:00: after midnight the times of the new day are still to come', async () => {
      // 00:30 of Tuesday in Madrid.
      const response = await interpret(
        appAt(new Date('2026-06-15T22:30:00Z')),
        madrid('hoy a las 17:00'),
      );

      expect(response.body).toMatchObject({
        options: [{ dates: day('2026-06-16'), time: at('17:00') }],
        notices: [],
      });
    });
  });

  it('orders a date in figures as the request’s region does', async () => {
    const app = appAt();

    const unitedStates = await interpret(app, { ...madrid('7/8'), region: 'US' });
    const spain = await interpret(app, { ...madrid('7/8'), region: 'ES' });
    const noRegion = await interpret(app, madrid('7/8'));

    expect(unitedStates.body).toMatchObject({ options: [{ dates: day('2026-07-08') }] });
    expect(spain.body).toMatchObject({ options: [{ dates: day('2026-08-07') }] });
    expect(noRegion.body).toMatchObject({ options: [{ dates: day('2026-08-07') }] });
  });

  describe('the editor', () => {
    it('is given the phrase trimmed, and what it writes is the phrase read', async () => {
      const asked: string[] = [];
      const editPhrase: EditPhrase = (phrase) => {
        asked.push(phrase);
        return Promise.resolve('el sábado a las 21:00');
      };

      const response = await interpret(appAt(mondayMorning, editPhrase), madrid('  sab 21h \n'));

      expect(asked).toEqual(['sab 21h']);
      expect(response.body).toEqual({
        options: [{ dates: day('2026-06-20'), time: at('21:00') }],
        questions: [],
        notices: [],
      });
    });

    it('reads the phrase as written when the model fails, logging no word of it', async () => {
      const logged: PhraseEditLogEntry[] = [];
      const refuses: CopyEdit = () => Promise.reject(new CopyEditRefused(503));
      const app = appAt(
        mondayMorning,
        phraseEditor(refuses, (entry) => logged.push(entry)),
      );

      const response = await interpret(app, madrid('el viernes a las 21:00'));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        options: [{ dates: day('2026-06-19'), time: at('21:00') }],
      });
      expect(logged).toEqual([
        { level: 'warn', message: 'Phrase not edited', reason: 'failed', status: 503 },
      ]);
    });

    it('reads the phrase as written when the model has not answered in 3 seconds', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const logged: PhraseEditLogEntry[] = [];
      let asked: () => void = () => undefined;
      const reached = new Promise<void>((resolve) => {
        asked = resolve;
      });
      const neverAnswers: CopyEdit = () => {
        asked();
        return new Promise(() => undefined);
      };
      const app = appAt(
        mondayMorning,
        phraseEditor(neverAnswers, (entry) => logged.push(entry)),
      );

      const answered = interpret(app, madrid('el viernes a las 21:00')).then(
        (response) => response,
      );
      await reached;
      await vi.advanceTimersByTimeAsync(2_999);
      expect(logged).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      const response = await answered;

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        options: [{ dates: day('2026-06-19'), time: at('21:00') }],
      });
      expect(logged).toEqual([{ level: 'warn', message: 'Phrase not edited', reason: 'timedOut' }]);
    });
  });

  describe('a request that breaks the contract', () => {
    it.each([
      ['no phrase', { timeZone: 'Europe/Madrid' }, ['text']],
      ['an empty phrase', madrid(''), ['text']],
      ['a phrase of spaces alone', madrid('  \n '), ['text']],
      ['a phrase of 121 characters', madrid('a'.repeat(121)), ['text']],
      ['a phrase that is no text', { text: 7, timeZone: 'Europe/Madrid' }, ['text']],
      ['no time zone', { text: 'mañana' }, ['timeZone']],
      [
        'a time zone that does not exist',
        { text: 'mañana', timeZone: 'Europe/Atlantis' },
        ['timeZone'],
      ],
      ['a region that is none', { ...madrid('mañana'), region: 'Spain' }, ['region']],
      ['a field the contract does not have', { ...madrid('mañana'), today: '2020-01-01' }, []],
    ])('is refused with 400 and where it breaks: %s', async (_, body, path) => {
      const { asked, editPhrase } = recordingEditor();

      const response = await interpret(appAt(mondayMorning, editPhrase), body);

      expect(response.status).toBe(400);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(errorOf(response)).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [{ code: 'INVALID_FIELD', in: 'body', path }],
      });
      expect(asked).toEqual([]);
    });

    it('is refused without quoting the phrase', async () => {
      const text = `el viernes ${'y el sábado '.repeat(10)}`;

      const response = await interpret(appAt(), madrid(text));

      expect(response.status).toBe(400);
      expect(response.text).not.toContain('viernes');
    });

    it('reads a phrase of 120 characters between spaces', async () => {
      const text = `  el viernes${' '.repeat(99)}a las 21:00 \n`;

      const response = await interpret(appAt(), madrid(text));

      expect(text.trim()).toHaveLength(120);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        options: [{ dates: day('2026-06-19'), time: at('21:00') }],
      });
    });

    it('is refused when its body is not JSON', async () => {
      const response = await request(appAt())
        .post('/api/date-interpretations')
        .set('Origin', testTrustedOrigin)
        .set('Content-Type', 'application/json')
        .send('{"text": ');

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe('VALIDATION_FAILED');
    });

    it('is refused unread when its body is far larger than a phrase, whatever it says', async () => {
      const { asked, editPhrase } = recordingEditor();
      // Trimmed it would be a phrase the contract takes.
      const text = `mañana${' '.repeat(4_000)}`;

      const response = await interpret(appAt(mondayMorning, editPhrase), madrid(text));

      expect(response.status).toBe(400);
      expect(errorOf(response)).toMatchObject({ code: 'VALIDATION_FAILED', details: [] });
      expect(asked).toEqual([]);
    });
  });

  describe('only for qando’s pages', () => {
    it.each([
      ['a page of another site', { Origin: 'https://evil.example' }],
      ['no page at all', {}],
      [
        'a page of another site in a signed-in browser',
        { Origin: 'https://evil.example', Cookie: `${testSessionCookie}=account-1` },
      ],
    ])('refuses a phrase sent from %s with 403, reading nothing', async (_, headers) => {
      const { asked, editPhrase } = recordingEditor();

      const response = await request(appAt(mondayMorning, editPhrase))
        .post('/api/date-interpretations')
        .set(headers)
        .send(madrid('mañana'));

      expect(response.status).toBe(403);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(errorOf(response).code).toBe('FORBIDDEN');
      expect(asked).toEqual([]);
    });

    it('reads a phrase from qando’s pages with or without a session', async () => {
      const response = await interpret(appAt(), madrid('mañana')).set(
        'Cookie',
        `${testSessionCookie}=account-1`,
      );

      expect(response.status).toBe(200);
    });
  });

  describe('20 phrases an hour from one address', () => {
    it('refuses the 21st with 429 before the editor is asked, until the hour has passed', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const { asked, editPhrase } = recordingEditor();
      const app = appAt(mondayMorning, editPhrase);
      for (let sent = 0; sent < 20; sent += 1) {
        expect((await interpret(app, madrid('mañana'))).status).toBe(200);
      }

      const refused = await interpret(app, madrid('mañana'));
      vi.advanceTimersByTime(60 * 60_000 - 1);
      const stillRefused = await interpret(app, madrid('mañana'));
      vi.advanceTimersByTime(1);
      const later = await interpret(app, madrid('mañana'));

      expect(refused.status).toBe(429);
      expect(refused.headers['retry-after']).toBe(String(60 * 60));
      expect(refused.headers['cache-control']).toBe('no-store');
      expect(errorOf(refused).code).toBe('RATE_LIMITED');
      expect(stillRefused.status).toBe(429);
      expect(later.status).toBe(200);
      expect(asked).toHaveLength(21);
    });

    it('counts each address apart', async () => {
      const app = appAt();
      for (let sent = 0; sent < 20; sent += 1) {
        await interpret(app, madrid('mañana'), '1.1.1.1');
      }

      const same = await interpret(app, madrid('mañana'), '1.1.1.1');
      const other = await interpret(app, madrid('mañana'), '2.2.2.2');

      expect(same.status).toBe(429);
      expect(other.status).toBe(200);
    });

    it('counts the requests that break the contract too', async () => {
      const app = appAt();
      for (let sent = 0; sent < 20; sent += 1) {
        expect((await interpret(app, madrid(''))).status).toBe(400);
      }

      const refused = await interpret(app, madrid('mañana'));

      expect(refused.status).toBe(429);
    });
  });
});

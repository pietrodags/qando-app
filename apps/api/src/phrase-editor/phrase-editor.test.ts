import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CopyEditRefused,
  phraseEditor,
  type CopyEdit,
  type PhraseEditLogEntry,
} from './phrase-editor.js';

/** An editor with the model replaced: `copyEdit` stands in for it, `logged` is what was logged. */
function editorWith(copyEdit: CopyEdit | undefined) {
  const logged: PhraseEditLogEntry[] = [];
  return { edit: phraseEditor(copyEdit, (entry) => logged.push(entry)), logged };
}

/** A model that answers each phrase with the edit listed for it. */
const answering =
  (answers: Record<string, string>): CopyEdit =>
  (phrase) =>
    Promise.resolve(answers[phrase] ?? phrase);

describe('phraseEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers the phrase as the model wrote it when the edit keeps what the phrase says', async () => {
    const { edit, logged } = editorWith(
      answering({ 'el vienres 26 de junio alas 9': 'el viernes 26 de junio a las 9' }),
    );

    expect(await edit('el vienres 26 de junio alas 9')).toBe('el viernes 26 de junio a las 9');
    expect(logged).toEqual([]);
  });

  it('accepts an edit that keeps only the correction of a phrase that corrects itself', async () => {
    const { edit } = editorWith(
      answering({
        'el sábado a las 10, no, a las 11': 'el sábado a las 11',
        'el viernes, no, el sábado': 'el sábado',
      }),
    );

    expect(await edit('el sábado a las 10, no, a las 11')).toBe('el sábado a las 11');
    expect(await edit('el viernes, no, el sábado')).toBe('el sábado');
  });

  it('answers the phrase as written when the edit fails the check, and says so in the log', async () => {
    const { edit, logged } = editorWith(
      answering({ 'Saturday at 10, no, at 11': 'Saturday at 12' }),
    );

    expect(await edit('Saturday at 10, no, at 11')).toBe('Saturday at 10, no, at 11');
    expect(logged).toEqual([{ level: 'warn', message: 'Phrase not edited', reason: 'discarded' }]);
  });

  it('gives the model the phrase as written', async () => {
    const asked: string[] = [];
    const { edit } = editorWith((phrase) => {
      asked.push(phrase);
      return Promise.resolve(phrase);
    });

    await edit('  el vienres ');

    expect(asked).toEqual(['  el vienres ']);
  });

  it('answers the phrase as written when the model fails, without its error in the log', async () => {
    const { edit, logged } = editorWith((phrase) =>
      Promise.reject(new Error(`Could not edit "${phrase}"`)),
    );

    expect(await edit('el vienres a las 9')).toBe('el vienres a las 9');
    expect(logged).toEqual([{ level: 'warn', message: 'Phrase not edited', reason: 'failed' }]);
  });

  it('answers the phrase as written when the model throws before answering', async () => {
    const { edit, logged } = editorWith(() => {
      throw new TypeError('No model');
    });

    expect(await edit('el vienres a las 9')).toBe('el vienres a las 9');
    expect(logged).toEqual([{ level: 'warn', message: 'Phrase not edited', reason: 'failed' }]);
  });

  it("logs the status the model's service refused the request with", async () => {
    const { edit, logged } = editorWith(() => Promise.reject(new CopyEditRefused(429)));

    expect(await edit('el vienres a las 9')).toBe('el vienres a las 9');
    expect(logged).toEqual([
      { level: 'warn', message: 'Phrase not edited', reason: 'failed', status: 429 },
    ]);
  });

  it('waits 3 seconds for the model and then answers the phrase as written', async () => {
    let waiting: AbortSignal | undefined;
    const { edit, logged } = editorWith((_, signal) => {
      waiting = signal;
      return new Promise(() => undefined);
    });
    let answer: string | undefined;
    void edit('el vienres a las 9').then((phrase) => {
      answer = phrase;
    });

    await vi.advanceTimersByTimeAsync(2_999);
    expect(answer).toBeUndefined();
    expect(waiting?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(answer).toBe('el vienres a las 9');
    expect(waiting?.aborted).toBe(true);
    expect(logged).toEqual([{ level: 'warn', message: 'Phrase not edited', reason: 'timedOut' }]);
  });

  it('tells a model that stops when told to from one that failed by itself', async () => {
    const { edit, logged } = editorWith(
      (_, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('Stopped'));
          });
        }),
    );
    const answer = edit('el vienres a las 9');

    await vi.advanceTimersByTimeAsync(3_000);

    expect(await answer).toBe('el vienres a las 9');
    expect(logged).toEqual([{ level: 'warn', message: 'Phrase not edited', reason: 'timedOut' }]);
  });

  it('stops waiting once the model answers', async () => {
    let waiting: AbortSignal | undefined;
    const { edit, logged } = editorWith((phrase, signal) => {
      waiting = signal;
      return Promise.resolve(phrase);
    });

    await edit('el viernes a las 9');
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(waiting?.aborted).toBe(false);
    expect(logged).toEqual([]);
  });

  it('answers the phrase as written, asking nobody, when there is no model', async () => {
    const { edit, logged } = editorWith(undefined);

    expect(await edit('el vienres a las 9')).toBe('el vienres a las 9');
    expect(vi.getTimerCount()).toBe(0);
    expect(logged).toEqual([]);
  });
});

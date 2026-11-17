// The text editor of a date phrase: before the rules reader reads a phrase, a language model
// copy-edits it into a well-written one in the same language. The model never reads dates and is
// never trusted: its answer is checked in code against the phrase as written, it has a time
// limit, and whatever goes wrong the phrase is read as written.
import { keepsWhen } from '@qando/date-reader';

/**
 * Port: asks a language model to copy-edit a phrase. Resolves with the phrase as the model wrote
 * it; rejects when the model cannot be reached, refuses or answers nothing that can be read, with
 * an error that may quote the phrase. `signal` aborts when the answer is no longer waited for.
 */
export type CopyEdit = (phrase: string, signal: AbortSignal) => Promise<string>;

/** The failure of a `CopyEdit` whose service answered the request with an HTTP error status. */
export class CopyEditRefused extends Error {
  constructor(readonly status: number) {
    super(`The model's service answered ${String(status)}`);
  }
}

/**
 * The phrase the rules reader reads for a phrase as written: the edited one, or the same phrase.
 * It always resolves.
 */
export type EditPhrase = (phrase: string) => Promise<string>;

/**
 * What the API logs when a phrase is read as written: the model took too long (`timedOut`),
 * failed (`failed`, with the HTTP status of a refusal) or wrote an edit that fails the check
 * (`discarded`). Never the phrase, the edit or the error, which may quote them.
 */
export interface PhraseEditLogEntry {
  readonly level: 'warn';
  readonly message: 'Phrase not edited';
  readonly reason: 'timedOut' | 'failed' | 'discarded';
  readonly status?: number;
}

/** How long the model is waited for; it usually answers in under a second. */
const limitMs = 3_000;

/**
 * The editor of the phrases the API reads. It asks the model for a copy edit and answers it only
 * when it comes within the time limit and still says when as the phrase does (`keepsWhen`);
 * otherwise, and with no model (`undefined`: no key is set), it answers the phrase as written.
 */
export function phraseEditor(
  copyEdit: CopyEdit | undefined,
  log: (entry: PhraseEditLogEntry) => void,
): EditPhrase {
  const notEdited = (entry: Pick<PhraseEditLogEntry, 'reason' | 'status'>) => {
    log({ level: 'warn', message: 'Phrase not edited', ...entry });
  };
  return async (phrase) => {
    if (!copyEdit) return phrase;
    const limit = new AbortController();
    const timer = setTimeout(() => {
      limit.abort();
    }, limitMs);
    const timedOut = new Promise<never>((_, reject) => {
      limit.signal.addEventListener('abort', reject);
    });
    try {
      const edited = await Promise.race([copyEdit(phrase, limit.signal), timedOut]);
      if (keepsWhen(phrase, edited)) return edited;
      notEdited({ reason: 'discarded' });
    } catch (error) {
      if (limit.signal.aborted) notEdited({ reason: 'timedOut' });
      else if (error instanceof CopyEditRefused)
        notEdited({ reason: 'failed', status: error.status });
      else notEdited({ reason: 'failed' });
    } finally {
      clearTimeout(timer);
    }
    return phrase;
  };
}

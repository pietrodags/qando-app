import { HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { type DateInterpretation, dateInterpretationEndpoint } from '@qando/contracts';
import { ApiClient } from '../../core/api/api-client';

/** How long the reading of a phrase is waited for. */
const TIME_LIMIT_MS = 10_000;

/**
 * What came of asking for a phrase to be read: its reading; `limited` when the API takes no more
 * phrases from this address for now; `failed` for anything else that left the phrase unread.
 */
export type PhraseRead =
  | { readonly kind: 'read'; readonly reading: DateInterpretation }
  | { readonly kind: 'limited' }
  | { readonly kind: 'failed' };

/**
 * Reads the dates and times of a phrase in plain language. The API reads it, with a time zone, in
 * which today is taken (the event's, or else the browser's), and the region of the browser's
 * language, which orders a date written in figures. Every phrase gets an answer, within ten seconds: a phrase left unread
 * says why, and nothing is thrown.
 */
@Service()
export class PhraseReader {
  private readonly api = inject(ApiClient);

  async read(text: string, timeZone?: string): Promise<PhraseRead> {
    try {
      const reading = await this.api.send(dateInterpretationEndpoint, {
        params: {},
        body: {
          text,
          timeZone: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          region: new Intl.Locale(navigator.language).region,
        },
        within: TIME_LIMIT_MS,
      });
      return { kind: 'read', reading };
    } catch (error) {
      const limited = error instanceof HttpErrorResponse && error.status === 429;
      return { kind: limited ? 'limited' : 'failed' };
    }
  }
}

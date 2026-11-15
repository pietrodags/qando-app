import {
  dateInterpretationEndpoint,
  type DateInterpretation,
  type ValidationFailedBody,
} from '@qando/contracts';
import { readDates } from '@qando/date-reader';
import express, { Router, type Response } from 'express';
import { noStore } from '../../http/no-store.js';
import { requestLimit } from '../../http/rate-limit.js';
import { contractBroken, readRequest } from '../../http/read-request.js';
import { routePath } from '../../http/route-path.js';
import { ownPagesOnly, type Sessions } from '../../http/session.js';
import type { EditPhrase } from '../../phrase-editor/phrase-editor.js';

/** Phrases one address may send in an hour: the wizard has no event yet to count by (owner, 2026-11-01). */
const phrasesPerHour = 20;
const hourMs = 60 * 60_000;

/** A phrase of 120 characters, a time zone and a region are below this, so nothing larger is read. */
const bodyLimit = '2kb';

/**
 * Serves `POST /api/date-interpretations`: the dates and times a phrase in plain language says,
 * for the wizard to mark. The phrase is copy-edited (`editPhrase`, which answers it as written
 * when the model is slow, fails or changes what it says) and then read by the rules reader, with
 * today and the time now taken in the request's time zone. Every phrase gets an answer: what is
 * not understood comes as notices, never as an error. Only qando's own pages are answered (`403`
 * otherwise), 20 times an hour per address, counted before anything is read, so a refusal never
 * reaches the model. The phrase is neither stored nor logged; every answer is `no-store`.
 */
export function dateInterpretationsRouter(
  editPhrase: EditPhrase,
  sessions: Sessions,
  now: () => Date,
): Router {
  const router = Router();
  router.post(
    routePath(dateInterpretationEndpoint),
    noStore,
    ownPagesOnly(sessions),
    requestLimit({ limit: phrasesPerHour, windowMs: hourMs }),
    express.json({ limit: bodyLimit }),
    async (request, response: Response<DateInterpretation | ValidationFailedBody>) => {
      const read = readRequest(dateInterpretationEndpoint, request);
      if (!read.ok) {
        response.status(400).json(contractBroken(read.problems));
        return;
      }
      const { text, timeZone, region } = read.body;
      const phrase = await editPhrase(text);
      response
        .status(200)
        .json(readDates(phrase, { ...wallClock(now(), timeZone), ...(region && { region }) }));
    },
  );
  return router;
}

/** The day (`YYYY-MM-DD`) and the clock time (`HH:MM`, from 00:00) of an instant in a time zone. */
function wallClock(instant: Date, timeZone: string): { today: string; now: string } {
  return {
    // Canada writes its dates as ISO 8601 does.
    today: new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant),
    now: new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(instant),
  };
}

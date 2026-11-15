import {
  dateInterpretationEndpoint,
  type DateInterpretation,
  type ValidationFailedBody,
} from '@qando/contracts';
import express, { Router, type Response } from 'express';
import { noStore } from '../../http/no-store.js';
import { rollingHourLimit } from '../../http/rate-limit.js';
import { contractBroken, readRequest } from '../../http/read-request.js';
import { routePath } from '../../http/route-path.js';
import { ownPagesOnly, type Sessions } from '../../http/session.js';
import type { InterpretPhrase } from './interpret-phrase.js';

/** Phrases one address may send in any hour: the wizard has no event yet to count by (owner, 2026-11-01). */
const phrasesPerHour = 20;

/** A phrase of 120 characters, a time zone and a region are below this, so nothing larger is read. */
const bodyLimit = '2kb';

/**
 * Serves `POST /api/date-interpretations`: the dates and times a phrase in plain language says,
 * for the wizard to mark, copy-edited before it is read (`interpret`). Only qando's own pages are
 * answered (`403` otherwise), 20 times in any hour per address, counted before anything is read, so
 * a refusal never reaches the language model. The phrase is neither stored nor logged; every
 * answer is `no-store`.
 */
export function dateInterpretationsRouter(interpret: InterpretPhrase, sessions: Sessions): Router {
  const router = Router();
  router.post(
    routePath(dateInterpretationEndpoint),
    noStore,
    ownPagesOnly(sessions),
    rollingHourLimit(phrasesPerHour),
    express.json({ limit: bodyLimit }),
    async (request, response: Response<DateInterpretation | ValidationFailedBody>) => {
      const read = readRequest(dateInterpretationEndpoint, request);
      if (!read.ok) {
        response.status(400).json(contractBroken(read.problems));
        return;
      }
      // The wizard's phrases are typed and dictated as people speak: they are copy-edited first.
      response.status(200).json(await interpret({ ...read.body, copyEdit: true }));
    },
  );
  return router;
}

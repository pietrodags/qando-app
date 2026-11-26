import {
  deleteAccountEndpoint,
  sendDeletionCodeEndpoint,
  type AccountDeleted,
  type AccountDeletionRefusedBody,
  type CodeNotDeliveredBody,
  type DeletionCodeSent,
  type RateLimitedBody,
} from '@qando/contracts';
import express, { Router, type Response } from 'express';
import { noStore } from '../../http/no-store.js';
import { answerRateLimited, requestLimit } from '../../http/rate-limit.js';
import { contractBroken, readRequest } from '../../http/read-request.js';
import { routePath } from '../../http/route-path.js';
import { quota } from '../../http/quota.js';
import { signedInAccountId, signedInOnly, type Sessions } from '../../http/session.js';
import { codeRefusalBody, type CodeDelivery, type CodeRefusal } from './sign-in.js';

/** What trying a deletion code did. */
export type DeletionOutcome =
  | {
      readonly status: 'deleted';
      /** How many of its events went with it. */
      readonly events: number;
    }
  | CodeRefusal;

/** Port to deleting an account on its owner's request, confirmed by a code sent to its email. */
export interface AccountDeletion {
  /**
   * Delivers a 6-digit code to the account's email. It is the email's one code, the one signing
   * in takes too: once delivered it replaces the last one, with its tries and expiry. A delivery
   * that failed is logged and answered, never thrown.
   */
  sendCode(accountId: string): Promise<CodeDelivery>;
  /**
   * Checks the code; the right one deletes, in one transaction, the account with its sessions,
   * its events with everything under them and what is left of the events it cancelled, and uses
   * the code up. An account already gone is deleted too, with no events.
   */
  delete(accountId: string, code: string): Promise<DeletionOutcome>;
}

/** As for signing in: a new code after 30 seconds, at most 5 an hour (owner, 2026-10-26). */
const resendAfterSeconds = 30;
const codesPerHour = 5;
const sendsPerAddressPerHour = 20;
const triesPerAddress = 30;
const triesWindowMs = 15 * 60_000;
const hourMs = 60 * 60_000;
/** A code is far below this, so nothing larger is read. */
const bodyLimit = '1kb';

/**
 * Serves `POST /api/me/deletion-code` and `POST /api/me/deletion`, only to a session (`401`)
 * sent from qando's own pages (`403`). Codes are limited per account (`quota`, on the clock
 * given) and per address, tries per address besides the 5 each code allows. Every answer is
 * `no-store`.
 */
export function accountDeletionRouter(
  deletion: AccountDeletion,
  sessions: Sessions,
  now: () => Date,
): Router {
  const router = Router();
  const perAccount = quota(
    { gapMs: resendAfterSeconds * 1000, limit: codesPerHour, per: 'hour' },
    now,
  );

  router.post(
    routePath(sendDeletionCodeEndpoint),
    noStore,
    requestLimit({ limit: sendsPerAddressPerHour, windowMs: hourMs }),
    ...signedInOnly(sessions),
    async (
      request,
      response: Response<DeletionCodeSent | CodeNotDeliveredBody | RateLimitedBody>,
    ) => {
      const accountId = signedInAccountId(request);
      const quota = perAccount.take(accountId);
      if (!quota.granted) {
        answerRateLimited(response, quota.retryAfterSeconds);
        return;
      }
      if ((await deletion.sendCode(accountId)) === 'not-delivered') {
        // A code that never arrived does not count, so asking again works at once.
        quota.release();
        response.status(502).json({
          error: {
            code: 'CODE_NOT_DELIVERED',
            message: 'The code email could not be delivered',
            details: [],
          },
        });
        return;
      }
      response.status(200).json({ sent: true, resendAfterSeconds });
    },
  );

  router.post(
    routePath(deleteAccountEndpoint),
    noStore,
    requestLimit({ limit: triesPerAddress, windowMs: triesWindowMs }),
    ...signedInOnly(sessions),
    express.json({ limit: bodyLimit }),
    async (request, response: Response<AccountDeleted | AccountDeletionRefusedBody>) => {
      const read = readRequest(deleteAccountEndpoint, request);
      if (!read.ok) {
        response.status(400).json(contractBroken(read.problems));
        return;
      }
      const outcome = await deletion.delete(signedInAccountId(request), read.body.code);
      if (outcome.status !== 'deleted') {
        response.status(400).json(codeRefusalBody(outcome));
        return;
      }
      // The sessions went with the account: a cookie left behind opens nothing, so a failure to
      // clear it does not undo the answer.
      const cleared = await sessions.end(request.headers).catch(() => []);
      response.append('Set-Cookie', [...cleared]);
      response.status(200).json({ deleted: true, events: outcome.events });
    },
  );
  return router;
}

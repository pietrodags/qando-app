import {
  sendSignInCodeEndpoint,
  signInEndpoint,
  type CodeNotDeliveredBody,
  type RateLimitedBody,
  type SignedIn,
  type SignInCodeSent,
  type SignInRefusedBody,
  type ValidationFailedBody,
} from '@qando/contracts';
import express, { Router, type RequestHandler, type Response } from 'express';
import { answerRateLimited, requestLimit } from '../../http/rate-limit.js';
import { contractBroken, readRequest } from '../../http/read-request.js';
import { routePath } from '../../http/route-path.js';
import { ownPagesOnly, type Sessions } from '../../http/session.js';
import { sendQuota } from './send-quota.js';

/** Whether the email server took the code email. */
export type CodeDelivery = 'sent' | 'not-delivered';

/** What trying a code did. */
export type SignInOutcome =
  | { readonly status: 'signed-in'; readonly cookies: readonly string[] }
  | { readonly status: 'wrong-code'; readonly attemptsLeft: number }
  /** No valid code: it expired, was used, or was never sent. */
  | { readonly status: 'expired' }
  /** Void after 5 wrong tries, even if this one is right. */
  | { readonly status: 'too-many-attempts' };

/** Port to signing in by email code (Better Auth's codes, delivered by our email, in `auth.ts`). */
export interface SignInCodes {
  /**
   * Creates a 6-digit code for the email (trimmed, lower case), replacing its last one, and
   * delivers it. A delivery that failed is logged and answered, never thrown.
   */
  send(email: string): Promise<CodeDelivery>;
  /** Checks the code; the right one opens a session, creating the account if there is none. */
  signIn(email: string, code: string): Promise<SignInOutcome>;
}

/** A new code for the same email after 30 seconds, at most 5 an hour (owner, 2026-10-26). */
const resendAfterSeconds = 30;
const codesPerHour = 5;
/** From one address, whatever the email: an office sharing an address still fits. */
const sendsPerAddressPerHour = 20;
/** Tries from one address: five codes' worth of wrong tries and more, never enough to guess. */
const triesPerAddress = 30;
const triesWindowMs = 15 * 60_000;
const hourMs = 60 * 60_000;

/** An email and a code are far below this, so nothing larger is read. */
const bodyLimit = '1kb';

/**
 * Serves `POST /api/auth/sign-in-code` and `POST /api/auth/sign-in`, only to qando's own pages
 * (`403` otherwise). Sending is limited per email by the codes themselves (`sendQuota`: one
 * delivered after the browser left counts; one the email server refused does not, so it can be
 * retried at once) and per
 * address; trying codes per address, besides the
 * 5 tries each code allows. Every answer is `no-store`.
 */
export function signInRouter(codes: SignInCodes, sessions: Sessions): Router {
  const router = Router();
  const fromOwnPages = ownPagesOnly(sessions);
  const perEmail = sendQuota({ gapMs: resendAfterSeconds * 1000, perHour: codesPerHour });

  router.post(
    routePath(sendSignInCodeEndpoint),
    noStore,
    fromOwnPages,
    requestLimit({ limit: sendsPerAddressPerHour, windowMs: hourMs }),
    express.json({ limit: bodyLimit }),
    (request, response: Response<ValidationFailedBody>, next) => {
      const read = readRequest(sendSignInCodeEndpoint, request);
      if (!read.ok) {
        response.status(400).json(contractBroken(read.problems));
        return;
      }
      response.locals.email = read.body.email;
      next();
    },
    async (
      _request,
      response: Response<SignInCodeSent | CodeNotDeliveredBody | RateLimitedBody>,
    ) => {
      const email = String(response.locals.email);
      const quota = perEmail.take(email);
      if (!quota.granted) {
        answerRateLimited(response, quota.retryAfterSeconds);
        return;
      }
      const delivery = await codes.send(email);
      if (delivery === 'not-delivered') {
        // A code that never arrived does not count, so "Reenviar código" works at once.
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
    routePath(signInEndpoint),
    noStore,
    fromOwnPages,
    requestLimit({ limit: triesPerAddress, windowMs: triesWindowMs }),
    express.json({ limit: bodyLimit }),
    async (request, response: Response<SignedIn | SignInRefusedBody>) => {
      const read = readRequest(signInEndpoint, request);
      if (!read.ok) {
        response.status(400).json(contractBroken(read.problems));
        return;
      }
      const outcome = await codes.signIn(read.body.email, read.body.code);
      if (outcome.status === 'signed-in') {
        response.append('Set-Cookie', [...outcome.cookies]);
        response.status(200).json({ signedIn: true });
        return;
      }
      response.status(400).json(refusal(outcome));
    },
  );
  return router;
}

const noStore: RequestHandler = (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
};

function refusal(outcome: Exclude<SignInOutcome, { status: 'signed-in' }>): SignInRefusedBody {
  switch (outcome.status) {
    case 'wrong-code':
      return {
        error: {
          code: 'WRONG_CODE',
          message: 'The code is not the last one sent to this email',
          details: [],
          attemptsLeft: outcome.attemptsLeft,
        },
      };
    case 'expired':
      return {
        error: { code: 'CODE_EXPIRED', message: 'The email has no valid code', details: [] },
      };
    case 'too-many-attempts':
      return {
        error: {
          code: 'TOO_MANY_ATTEMPTS',
          message: 'The code is void after 5 wrong tries',
          details: [],
        },
      };
  }
}

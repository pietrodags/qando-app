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
import { organizerNameProblem } from '@qando/domain';
import express, { Router, type Response } from 'express';
import { noStore } from '../../http/no-store.js';
import { answerRateLimited, requestLimit } from '../../http/rate-limit.js';
import { contractBroken, readRequest } from '../../http/read-request.js';
import { routePath } from '../../http/route-path.js';
import { sendQuota } from '../../http/send-quota.js';
import { ownPagesOnly, type Sessions } from '../../http/session.js';

/** Whether the email server took the code email. */
export type CodeDelivery = 'sent' | 'not-delivered';

/** Why a code was not taken. */
export type CodeRefusal =
  | { readonly status: 'wrong-code'; readonly attemptsLeft: number }
  /** No valid code: it expired, was used, or was never sent. */
  | { readonly status: 'expired' }
  /** Void after 5 wrong tries, even if this one is right. */
  | { readonly status: 'too-many-attempts' };

/** What trying a code did. */
export type SignInOutcome =
  | {
      readonly status: 'signed-in';
      readonly cookies: readonly string[];
      /** Where the browser goes on, when the sign-in carried a request to connect. */
      readonly continueTo?: string;
    }
  | CodeRefusal;

/** Port to signing in by email code (Better Auth's codes, delivered by our email, in `auth.ts`). */
export interface SignInCodes {
  /**
   * Creates a 6-digit code for the email (trimmed, lower case) and delivers it. Only once
   * delivered does it replace the email's last one, which until then, and after a delivery that
   * failed, is still accepted with its own tries and expiry. A delivery that failed is logged
   * and answered, never thrown.
   */
  send(email: string): Promise<CodeDelivery>;
  /**
   * Checks the code; the right one opens a session, creating the account if there is none, with
   * the name given (trimmed and checked), if any; an account that exists keeps its name.
   *
   * `connectionRequest` is the request to connect an application that opened the sign-in page,
   * as the authorization server signed it (the query of the page's address). Signed in with
   * one, the outcome says where the browser goes on, a path of qando's: the authorization
   * server's address with what the application asked, which takes the request again now that
   * there is a session; or the consent page without a request, which says to start again from
   * the application, when the request is older than 10 minutes or was not signed by the
   * authorization server.
   */
  signIn(
    email: string,
    code: string,
    name?: string,
    connectionRequest?: string,
  ): Promise<SignInOutcome>;
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

/** An email is far below this, so nothing larger is read. */
const bodyLimit = '1kb';
/**
 * An email, a code, a new account's name and a request to connect. Of a name, 30 characters as
 * people see them can take many bytes each (a family emoji with skin tones is 43), so the
 * name's rule decides, not the size. A request to connect came in an address, 16 KB at most,
 * and signing it added some hundreds of bytes: every one that reached its sign-in page fits.
 */
const signInBodyLimit = '32kb';

/**
 * Serves `POST /api/auth/sign-in-code` and `POST /api/auth/sign-in`, only to qando's own pages
 * (`403` otherwise). Sending is limited per email by the codes themselves (`sendQuota`, on the
 * clock given: one delivered after the browser left counts; one the email server refused does
 * not, so it can be retried at once) and per address; trying codes per address, besides the
 * 5 tries each code allows. A sign-in that carries the request to connect an application its
 * page was opened with is answered where the browser goes on (`SignInCodes.signIn`). Every
 * answer is `no-store`.
 */
export function signInRouter(codes: SignInCodes, sessions: Sessions, now: () => Date): Router {
  const router = Router();
  const fromOwnPages = ownPagesOnly(sessions);
  const perEmail = sendQuota({ gapMs: resendAfterSeconds * 1000, perHour: codesPerHour }, now);

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
    express.json({ limit: signInBodyLimit }),
    async (request, response: Response<SignedIn | SignInRefusedBody>) => {
      const read = readRequest(signInEndpoint, request);
      if (!read.ok) {
        response.status(400).json(contractBroken(read.problems));
        return;
      }
      const { email, code, name, connectionRequest } = read.body;
      // A new account's name follows the organizer's rules, the wizard's first step's.
      if (name !== undefined && organizerNameProblem(name)) {
        response
          .status(400)
          .json(contractBroken([{ code: 'INVALID_FIELD', in: 'body', path: ['name'] }]));
        return;
      }
      const outcome = await codes.signIn(email, code, name, connectionRequest);
      if (outcome.status === 'signed-in') {
        const { cookies, continueTo } = outcome;
        response.append('Set-Cookie', [...cookies]);
        response
          .status(200)
          .json({ signedIn: true, ...(continueTo !== undefined && { continueTo }) });
        return;
      }
      response.status(400).json(codeRefusalBody(outcome));
    },
  );
  return router;
}

/** The answer to a code not taken, the same for signing in and for deleting an account. */
export function codeRefusalBody(outcome: CodeRefusal): SignInRefusedBody {
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

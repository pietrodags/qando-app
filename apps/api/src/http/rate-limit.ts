import type { RateLimitedBody } from '@qando/contracts';
import type { RequestHandler, Response } from 'express';
import { rateLimit, type AugmentedRequest } from 'express-rate-limit';

/** Requests one address may send to the capability endpoints in a window (owner, 2026-11-05). */
const capabilityLimit = 60;
const minute = 60_000;

/** How many requests one client address may send in a window. */
export interface RequestLimit {
  readonly limit: number;
  readonly windowMs: number;
}

/**
 * Refuses the requests past the limit from one client address with `429 RATE_LIMITED` and
 * `Retry-After`, before they reach the route, so a refusal costs no database work. IPv6
 * addresses are counted per /56 network, so one client cannot rotate them. Each window starts
 * with the first request it counts. The count lives in memory: the API runs as one instance.
 */
export function requestLimit({ limit, windowMs }: RequestLimit): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: false,
    legacyHeaders: false,
    handler: (request, response: Response<RateLimitedBody>) => {
      answerRateLimited(response, secondsUntil((request as AugmentedRequest).rateLimit?.resetTime));
    },
  });
}

/** Answers `429 RATE_LIMITED`, never cached, telling how many seconds to wait. */
export function answerRateLimited(
  response: Response<RateLimitedBody>,
  retryAfterSeconds: number,
): void {
  response.set('Retry-After', String(retryAfterSeconds));
  response.set('Cache-Control', 'no-store');
  response.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests', details: [] },
  });
}

/**
 * Limits each client address to 60 requests a minute, counted together over every route it is
 * mounted on: whoever guesses capability links or tokens gets nothing from changing the event
 * or the endpoint.
 */
export function capabilityRateLimit(): RequestHandler {
  return requestLimit({ limit: capabilityLimit, windowMs: minute });
}

/**
 * Whole seconds until the window ends, at least one: an answer of 0 would invite a retry now.
 * The memory store always knows when the window ends; without it the answer is one second.
 */
function secondsUntil(resetTime: Date | undefined): number {
  const left = (resetTime?.getTime() ?? 0) - Date.now();
  return Math.max(1, Math.ceil(left / 1000));
}

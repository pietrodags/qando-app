import type { RateLimitedBody } from '@qando/contracts';
import type { RequestHandler, Response } from 'express';
import { rateLimit, type AugmentedRequest } from 'express-rate-limit';

/** Requests one address may send in a window (owner, 2026-11-05). */
const limit = 60;
const windowMs = 60_000;

/**
 * Limits each client address to 60 requests a minute, counted together over every route it is
 * mounted on: whoever guesses capability links or tokens gets nothing from changing the event
 * or the endpoint. A refusal answers `429 RATE_LIMITED` with `Retry-After` before the request
 * reaches any route, so it costs no database work. The count lives in memory: the API runs as
 * one instance. IPv6 addresses are counted per /56 network, so one client cannot rotate them.
 */
export function capabilityRateLimit(): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: false,
    legacyHeaders: false,
    handler: (request, response: Response<RateLimitedBody>) => {
      response.set(
        'Retry-After',
        String(secondsUntil((request as AugmentedRequest).rateLimit?.resetTime)),
      );
      response.set('Cache-Control', 'no-store');
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests', details: [] },
      });
    },
  });
}

/**
 * Whole seconds until the window ends, at least one: an answer of 0 would invite a retry now.
 * The memory store always knows when the window ends; without it the answer is one second.
 */
function secondsUntil(resetTime: Date | undefined): number {
  const left = (resetTime?.getTime() ?? 0) - Date.now();
  return Math.max(1, Math.ceil(left / 1000));
}

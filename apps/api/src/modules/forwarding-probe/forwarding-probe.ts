import { Router } from 'express';

/** The headers a proxy may use to pass on the client's address. */
const forwardingHeaders = [
  'x-forwarded-for',
  'x-real-ip',
  'true-client-ip',
  'cf-connecting-ip',
  'forwarded',
] as const;

/**
 * Temporary: answers the caller how its address reaches the API through the hosting's proxies,
 * to choose how the rate limiter reads it. Only the caller's own values travel back, nothing is
 * stored or logged; the values of other headers are left out. Removed with the rate limiter.
 */
export function forwardingProbeRouter(): Router {
  const router = Router();
  router.get('/', (request, response) => {
    const forwarding = Object.fromEntries(
      forwardingHeaders
        .filter((name) => request.headers[name] !== undefined)
        .map((name) => [name, request.headers[name]]),
    );
    response.set('Cache-Control', 'no-store');
    response.status(200).json({
      forwarding,
      headerNames: Object.keys(request.headers),
      socketAddress: request.socket.remoteAddress ?? '',
    });
  });
  return router;
}

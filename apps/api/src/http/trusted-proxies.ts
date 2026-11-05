/**
 * The proxies between a client and the API, as measured in production (2026-11-05): the
 * hosting's private network in front of the process, its CDN (Cloudflare) in front of every
 * public URL, and the hosting's rewrite proxy that forwards the web's `/api/*` to the API (Render,
 * 74.220.48.0/20). Each appends the address it received the request from to `X-Forwarded-For`,
 * so the client is the first address from the right that is none of these: through the web it
 * is the fifth, straight to the API's own URL the second, and whatever a client writes further
 * left is ignored. The CDN's `CF-Connecting-IP` is not used: through the rewrite it names the
 * rewrite proxy, which would put every visitor in one count.
 *
 * Cloudflare publishes its ranges at https://www.cloudflare.com/ips/; if the hosting's proxies
 * change, a client may be read as one of them, and then everyone shares one count.
 */
export const trustedProxies: readonly string[] = [
  'loopback',
  'uniquelocal',
  // Render's rewrite proxy.
  '74.220.48.0/20',
  // Cloudflare, IPv4.
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  // Cloudflare, IPv6.
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

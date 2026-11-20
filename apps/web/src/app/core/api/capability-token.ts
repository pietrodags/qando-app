/** 128 bits: no one can guess a link built from them. */
const TOKEN_BYTES = 16;

/**
 * A new capability token, made by the page before its first send: 128 random bits from the
 * browser, in base64url without padding. Sending again with the same token is how the API knows
 * a send is repeated (a lost answer), so it stores nothing twice.
 */
export function newCapabilityToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

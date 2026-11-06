import { createHash, randomBytes } from 'node:crypto';

/**
 * What is stored of a capability token (a vote's edit link, an event's management link): its
 * SHA-256 in hex. The token itself is never stored, so a copy of the database opens nothing.
 * Tokens carry at least 128 random bits, so a fast hash without salt is enough.
 */
export function hashCapabilityToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A new capability token: 128 random bits in base64url (22 characters, safe in a link). */
export function newCapabilityToken(): string {
  return randomBytes(16).toString('base64url');
}

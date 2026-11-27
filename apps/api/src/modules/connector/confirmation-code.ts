import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import type { DecisionFacts } from '../management/read-managed-event.js';

/** What a code is given for: who asked to confirm which date, and what the organizer was told. */
export interface Confirming {
  readonly accountId: string;
  /** The connected application that asked. */
  readonly applicationId: string;
  /** The identifier of the event's voting link. */
  readonly eventId: string;
  readonly optionId: string;
  /** What the notes of the first answer were said from. */
  readonly facts: DecisionFacts;
}

/** The codes of the connector's confirmations, which stand for the organizer's yes. */
export interface ConfirmationCodes {
  /** A code for confirming that, given at `at`. */
  give(confirming: Confirming, at: Date): string;
  /**
   * Whether `code` was given for exactly that within the 10 minutes before `at`: whatever its
   * case, with or without its hyphen and the spaces around it.
   */
  holds(code: string, confirming: Confirming, at: Date): boolean;
}

/** How long a code holds, in seconds. */
const lifetime = 600;

/** Crockford's letters and digits: no I, L, O nor U, which are taken for others. */
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** How many bytes of the signature a code keeps: 40 bits, 8 letters of 5 bits. */
const kept = 5;

/**
 * Codes stored nowhere: a code is the signature, under a key derived from `secret`, of what it
 * was given for and the second it was given in, so a second call holds it against the event as
 * it is then. It holds for the same account, application, event, option and facts during the
 * 10 minutes after; a code nobody gave, or given for anything else, is told apart but for one
 * chance in about a trillion. The code is not a secret from the assistant, which reads it: it
 * makes the second call wait for a first one, the one whose answer the organizer is shown.
 */
export function confirmationCodes(secret: string): ConfirmationCodes {
  const key = Buffer.from(hkdfSync('sha256', secret, '', 'qando confirmation codes', 32));
  const signature = (confirming: Confirming, second: number) =>
    createHmac('sha256', key).update(signed(confirming, second)).digest().subarray(0, kept);
  const secondOf = (at: Date) => Math.floor(at.getTime() / 1000);
  return {
    give: (confirming, at) => written(signature(confirming, secondOf(at))),
    holds: (code, confirming, at) => {
      const given = read(code);
      if (given === undefined) return false;
      const now = secondOf(at);
      for (let second = now; second > now - lifetime; second -= 1) {
        if (timingSafeEqual(given, signature(confirming, second))) return true;
      }
      return false;
    },
  };
}

/** What is signed: every part apart from the others, so none can pass for another. */
function signed(
  { accountId, applicationId, eventId, optionId, facts }: Confirming,
  second: number,
): string {
  const { state, voters, recommendedOptionIds } = facts;
  return JSON.stringify([
    second,
    accountId,
    applicationId,
    eventId,
    optionId,
    state,
    voters,
    recommendedOptionIds,
  ]);
}

/** The bytes as a code is written: 8 letters, in two groups of four. */
function written(bytes: Buffer): string {
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
  let letters = '';
  for (let shift = 35n; shift >= 0n; shift -= 5n)
    letters += alphabet.charAt(Number((bits >> shift) & 31n));
  return `${letters.slice(0, 4)}-${letters.slice(4)}`;
}

/** The bytes of a code as it was written back, or undefined if no code is written so. */
function read(code: string): Buffer | undefined {
  const letters = code
    .trim()
    .toUpperCase()
    .replace(/^(.{4})-(.{4})$/, '$1$2');
  if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(letters)) return undefined;
  let bits = 0n;
  for (const letter of letters) bits = (bits << 5n) | BigInt(alphabet.indexOf(letter));
  const bytes = Buffer.alloc(kept);
  for (let index = kept - 1; index >= 0; index -= 1) {
    bytes[index] = Number(bits & 255n);
    bits >>= 8n;
  }
  return bytes;
}

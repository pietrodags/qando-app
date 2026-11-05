import { describe, expect, it } from 'vitest';
import { hashCapabilityToken } from './capability-token.js';

describe('hashCapabilityToken', () => {
  it('is the SHA-256 of the token in hex', () => {
    expect(hashCapabilityToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('differs for tokens that differ in one character', () => {
    expect(hashCapabilityToken('kQ7vZ2xT9bLm4Np0Rs8wYA')).not.toBe(
      hashCapabilityToken('kQ7vZ2xT9bLm4Np0Rs8wYB'),
    );
  });
});

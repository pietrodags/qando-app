import { describe, expect, it } from 'vitest';
import { successBodyOf } from '../endpoint.js';
import { sessionEndpoint, signedInAccountSchema } from './session.js';

describe('session contract', () => {
  it('answers the name and the email of the account signed in', () => {
    const account = { name: 'Ana', email: 'ana@example.com' };

    expect(successBodyOf(sessionEndpoint, account)).toEqual(account);
  });

  it('answers an account that has no name yet', () => {
    expect(signedInAccountSchema.parse({ name: '', email: 'ana@example.com' }).name).toBe('');
  });

  it('answers null to a browser without a session', () => {
    expect(successBodyOf(sessionEndpoint, null)).toBeNull();
  });

  it('refuses an account without its email', () => {
    expect(signedInAccountSchema.safeParse({ name: 'Ana' }).success).toBe(false);
  });

  it('is served by GET /api/auth/session with 200 and 500 answers', () => {
    expect(sessionEndpoint.method).toBe('get');
    expect(sessionEndpoint.path).toBe('/api/auth/session');
    expect(Object.keys(sessionEndpoint.responses)).toEqual(['200', '500']);
  });
});

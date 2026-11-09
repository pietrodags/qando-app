import { describe, expect, it } from 'vitest';
import { crossSiteSessionSchema, signedOutSchema, signOutEndpoint } from './sign-out.js';

describe('sign-out contract', () => {
  it('answers that the browser is signed out', () => {
    expect(signedOutSchema.parse({ signedOut: true })).toEqual({ signedOut: true });
    expect(signedOutSchema.safeParse({ signedOut: false }).success).toBe(false);
  });

  it('refuses the session from another site with FORBIDDEN', () => {
    const refusal = {
      error: {
        code: 'FORBIDDEN',
        message: 'The session cannot be used from this origin',
        details: [],
      },
    };

    expect(crossSiteSessionSchema.parse(refusal)).toEqual(refusal);
  });

  it('is served by POST /api/auth/sign-out with 200, 403 and 500 answers', () => {
    expect(signOutEndpoint.method).toBe('post');
    expect(signOutEndpoint.path).toBe('/api/auth/sign-out');
    expect(Object.keys(signOutEndpoint.responses)).toEqual(['200', '403', '500']);
  });
});

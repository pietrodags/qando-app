import { describe, expect, it } from 'vitest';
import {
  codeNotDeliveredSchema,
  sendSignInCodeEndpoint,
  signInBodySchema,
  signInCodeBodySchema,
  signInCodeSentSchema,
  signInEndpoint,
  signInRefusedSchema,
  signedInSchema,
} from './sign-in.js';

const errorBody = (code: string, extra: object = {}) => ({
  error: { code, message: 'Some message', details: [], ...extra },
});

describe('sign-in code contract', () => {
  it('takes an email, trimmed and in lower case', () => {
    expect(signInCodeBodySchema.parse({ email: '  Ana@Example.COM ' })).toEqual({
      email: 'ana@example.com',
    });
  });

  it.each([
    ['no email', {}],
    ['not an email', { email: 'ana' }],
    ['an email longer than 254 characters', { email: `${'a'.repeat(245)}@example.com` }],
    ['another field', { email: 'ana@example.com', name: 'Ana' }],
  ])('refuses %s', (_, body) => {
    expect(signInCodeBodySchema.safeParse(body).success).toBe(false);
  });

  it('answers when a new code may be asked for', () => {
    const sent = { sent: true, resendAfterSeconds: 30 };

    expect(signInCodeSentSchema.parse(sent)).toEqual(sent);
  });

  it('answers a code that could not be delivered with CODE_NOT_DELIVERED', () => {
    expect(codeNotDeliveredSchema.safeParse(errorBody('CODE_NOT_DELIVERED')).success).toBe(true);
  });

  it('is served by POST /api/auth/sign-in-code', () => {
    expect(sendSignInCodeEndpoint.method).toBe('post');
    expect(sendSignInCodeEndpoint.path).toBe('/api/auth/sign-in-code');
    expect(Object.keys(sendSignInCodeEndpoint.responses)).toEqual([
      '200',
      '400',
      '403',
      '429',
      '500',
      '502',
    ]);
    expect(sendSignInCodeEndpoint.responses[429].headers.shape).toHaveProperty('Retry-After');
  });
});

describe('sign-in contract', () => {
  it('takes the email and its 6-digit code', () => {
    expect(signInBodySchema.parse({ email: ' Ana@Example.com', code: '012345' })).toEqual({
      email: 'ana@example.com',
      code: '012345',
    });
  });

  it('takes the name of a new account, trimmed', () => {
    expect(
      signInBodySchema.parse({ email: 'ana@example.com', code: '012345', name: '  Ana ' }),
    ).toEqual({ email: 'ana@example.com', code: '012345', name: 'Ana' });
  });

  it('refuses a name that is not text', () => {
    expect(
      signInBodySchema.safeParse({ email: 'ana@example.com', code: '012345', name: 7 }).success,
    ).toBe(false);
  });

  it('takes the request to connect the sign-in page was opened with, as it is', () => {
    const connectionRequest =
      'response_type=code&client_id=https%3A%2F%2Fclaude.ai%2Fapp&scope=events%3Aread+offline_access&exp=1780000000&sig=a%2Bb%3D';

    expect(
      signInBodySchema.parse({ email: 'ana@example.com', code: '012345', connectionRequest }),
    ).toEqual({ email: 'ana@example.com', code: '012345', connectionRequest });
  });

  it.each([
    ['empty', ''],
    ['not text', 7],
  ])('refuses a request to connect that is %s', (_, connectionRequest) => {
    expect(
      signInBodySchema.safeParse({ email: 'ana@example.com', code: '012345', connectionRequest })
        .success,
    ).toBe(false);
  });

  it.each([
    ['a code of 5 digits', '01234'],
    ['a code of 7 digits', '0123456'],
    ['a code with letters', '01234a'],
    ['a code with spaces', '012 345'],
  ])('refuses %s', (_, code) => {
    expect(signInBodySchema.safeParse({ email: 'ana@example.com', code }).success).toBe(false);
  });

  it('answers that the browser is signed in', () => {
    expect(signedInSchema.parse({ signedIn: true })).toEqual({ signedIn: true });
  });

  it.each(['/api/auth/oauth2/authorize?response_type=code&client_id=a', '/connect'])(
    'answers where the browser goes on with a request to connect: %s',
    (continueTo) => {
      expect(signedInSchema.parse({ signedIn: true, continueTo })).toEqual({
        signedIn: true,
        continueTo,
      });
    },
  );

  it.each([
    ['an address of another site', 'https://other.example/connect'],
    ['an address without its scheme', '//other.example/connect'],
    ['a path a browser reads as another site', '/\\other.example/connect'],
    ['a relative path', 'connect'],
    ['nothing', ''],
  ])('refuses to go on at %s', (_, continueTo) => {
    expect(signedInSchema.safeParse({ signedIn: true, continueTo }).success).toBe(false);
  });

  it('tells a wrong code with the attempts left', () => {
    const wrong = errorBody('WRONG_CODE', { attemptsLeft: 4 });

    expect(signInRefusedSchema.parse(wrong)).toEqual(wrong);
    expect(
      signInRefusedSchema.safeParse(errorBody('WRONG_CODE', { attemptsLeft: 0 })).success,
    ).toBe(false);
    expect(signInRefusedSchema.safeParse(errorBody('WRONG_CODE')).success).toBe(false);
  });

  it.each(['CODE_EXPIRED', 'TOO_MANY_ATTEMPTS', 'VALIDATION_FAILED'])(
    'refuses a sign-in with %s',
    (code) => {
      expect(signInRefusedSchema.safeParse(errorBody(code)).success).toBe(true);
    },
  );

  it('is served by POST /api/auth/sign-in', () => {
    expect(signInEndpoint.method).toBe('post');
    expect(signInEndpoint.path).toBe('/api/auth/sign-in');
    expect(Object.keys(signInEndpoint.responses)).toEqual(['200', '400', '403', '429', '500']);
  });
});

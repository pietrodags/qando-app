import { describe, expect, it } from 'vitest';
import {
  accountDeletedSchema,
  accountDeletionBodySchema,
  accountDeletionRefusedSchema,
  deleteAccountEndpoint,
  deletionCodeSentSchema,
  sendDeletionCodeEndpoint,
} from './account-deletion.js';

describe('account deletion contract', () => {
  it('says the code was sent and when a new one may be asked for', () => {
    const sent = { sent: true, resendAfterSeconds: 30 };

    expect(deletionCodeSentSchema.parse(sent)).toEqual(sent);
    expect(deletionCodeSentSchema.safeParse({ sent: true, resendAfterSeconds: 0 }).success).toBe(
      false,
    );
  });

  it('takes the 6 digits of the code and nothing else', () => {
    expect(accountDeletionBodySchema.parse({ code: '482913' })).toEqual({ code: '482913' });
    expect(accountDeletionBodySchema.safeParse({ code: '48291' }).success).toBe(false);
    expect(accountDeletionBodySchema.safeParse({ code: '4829134' }).success).toBe(false);
    expect(accountDeletionBodySchema.safeParse({ code: '48291a' }).success).toBe(false);
    expect(
      accountDeletionBodySchema.safeParse({ code: '482913', email: 'ana@example.com' }).success,
    ).toBe(false);
  });

  it('answers that the account is deleted', () => {
    expect(accountDeletedSchema.parse({ deleted: true })).toEqual({ deleted: true });
    expect(accountDeletedSchema.safeParse({ deleted: false }).success).toBe(false);
  });

  it('refuses a wrong, expired or void code as signing in does', () => {
    const wrong = {
      error: { code: 'WRONG_CODE', message: 'Wrong', details: [], attemptsLeft: 4 },
    };
    const expired = { error: { code: 'CODE_EXPIRED', message: 'Expired', details: [] } };
    const void_ = { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Void', details: [] } };

    expect(accountDeletionRefusedSchema.parse(wrong)).toEqual(wrong);
    expect(accountDeletionRefusedSchema.parse(expired)).toEqual(expired);
    expect(accountDeletionRefusedSchema.parse(void_)).toEqual(void_);
  });

  it('sends the code by POST /api/me/deletion-code, without a body', () => {
    expect(sendDeletionCodeEndpoint.method).toBe('post');
    expect(sendDeletionCodeEndpoint.path).toBe('/api/me/deletion-code');
    expect('body' in sendDeletionCodeEndpoint).toBe(false);
    expect(Object.keys(sendDeletionCodeEndpoint.responses)).toEqual([
      '200',
      '401',
      '403',
      '429',
      '500',
      '502',
    ]);
  });

  it('deletes the account by POST /api/me/deletion, with the code', () => {
    expect(deleteAccountEndpoint.method).toBe('post');
    expect(deleteAccountEndpoint.path).toBe('/api/me/deletion');
    expect(deleteAccountEndpoint.body).toBe(accountDeletionBodySchema);
    expect(Object.keys(deleteAccountEndpoint.responses)).toEqual([
      '200',
      '400',
      '401',
      '403',
      '429',
      '500',
    ]);
  });
});

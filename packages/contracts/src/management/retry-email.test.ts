import { describe, expect, it } from 'vitest';
import { emailStateSchema } from './managed-event.js';
import { emailNotFailedSchema, retryEmailEndpoint } from './retry-email.js';

describe('retry email contract', () => {
  it('takes the email to retry in the path: the summary or "voting closed"', () => {
    for (const type of ['summary', 'voting-closed']) {
      expect(retryEmailEndpoint.params.parse({ id: 'k3Jd9', type })).toEqual({ id: 'k3Jd9', type });
    }
  });

  it.each([
    ['an unknown email', { id: 'k3Jd9', type: 'reminder' }],
    ['the type as stored', { id: 'k3Jd9', type: 'voting_closed' }],
    ['no event', { id: '', type: 'summary' }],
  ])('rejects a path with %s', (_name, params) => {
    expect(retryEmailEndpoint.params.safeParse(params).success).toBe(false);
  });

  it('refuses an email that has not failed with EMAIL_NOT_FAILED', () => {
    const body = { error: { code: 'EMAIL_NOT_FAILED', message: 'Sent', details: [] } };
    expect(emailNotFailedSchema.parse(body)).toEqual(body);
  });

  it('is served by POST /api/events/{id}/emails/{type}/retry with no body, answering the email', () => {
    expect(retryEmailEndpoint.method).toBe('post');
    expect(retryEmailEndpoint.path).toBe('/api/events/{id}/emails/{type}/retry');
    expect('body' in retryEmailEndpoint).toBe(false);
    expect(retryEmailEndpoint.responses[200].schema).toBe(emailStateSchema);
    expect(retryEmailEndpoint.responses[409].schema).toBe(emailNotFailedSchema);
    expect(Object.keys(retryEmailEndpoint.responses)).toEqual([
      '200',
      '400',
      '401',
      '403',
      '409',
      '410',
      '429',
      '500',
    ]);
    expect(
      retryEmailEndpoint.headers.parse({ 'x-management-token': 'a'.repeat(22), cookie: 'a=1' }),
    ).toEqual({ 'x-management-token': 'a'.repeat(22) });
  });
});

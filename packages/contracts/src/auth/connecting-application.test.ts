import { describe, expect, it } from 'vitest';
import {
  connectingApplicationBodySchema,
  connectingApplicationEndpoint,
  connectingApplicationSchema,
  connectionRequestExpiredSchema,
} from './connecting-application.js';

describe('connecting application contract', () => {
  it('takes the request to connect, whole, and nothing else', () => {
    const body = { connectionRequest: 'response_type=code&client_id=a&exp=1&sig=b' };

    expect(connectingApplicationBodySchema.parse(body)).toEqual(body);
    expect(connectingApplicationBodySchema.safeParse({ connectionRequest: '' }).success).toBe(
      false,
    );
    expect(connectingApplicationBodySchema.safeParse({}).success).toBe(false);
    expect(connectingApplicationBodySchema.safeParse({ ...body, accept: true }).success).toBe(
      false,
    );
  });

  it('answers the application’s name and the host of its address, never anything else of it', () => {
    const application = { name: 'Claude', host: 'claude.ai' };

    expect(
      connectingApplicationSchema.parse({ ...application, logo: 'https://claude.ai/logo.png' }),
    ).toEqual(application);
    expect(connectingApplicationSchema.safeParse({ ...application, name: '' }).success).toBe(false);
    expect(connectingApplicationSchema.safeParse({ ...application, host: '' }).success).toBe(false);
  });

  it('refuses a request that expired or was not signed with CONNECTION_REQUEST_EXPIRED', () => {
    const refusal = {
      error: {
        code: 'CONNECTION_REQUEST_EXPIRED',
        message: 'The request to connect expired',
        details: [],
      },
    };

    expect(connectionRequestExpiredSchema.parse(refusal)).toEqual(refusal);
  });

  it('is served by POST /api/auth/connecting-application with its seven answers', () => {
    expect(connectingApplicationEndpoint.method).toBe('post');
    expect(connectingApplicationEndpoint.path).toBe('/api/auth/connecting-application');
    expect(connectingApplicationEndpoint.body).toBe(connectingApplicationBodySchema);
    expect(Object.keys(connectingApplicationEndpoint.responses)).toEqual([
      '200',
      '400',
      '401',
      '403',
      '410',
      '429',
      '500',
    ]);
  });
});

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { testDependencies } from '../../test/test-dependencies.js';

describe('GET /api/debug/forwarding', () => {
  it('answers the caller its own forwarding headers and the names of all the others', async () => {
    const app = createApp(testDependencies());

    const response = await request(app)
      .get('/api/debug/forwarding')
      .set('X-Forwarded-For', '203.0.113.7, 198.51.100.2')
      .set('True-Client-IP', '203.0.113.7')
      .set('X-Other', 'secret');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      forwarding: {
        'x-forwarded-for': '203.0.113.7, 198.51.100.2',
        'true-client-ip': '203.0.113.7',
      },
      headerNames: expect.arrayContaining([
        'x-forwarded-for',
        'true-client-ip',
        'x-other',
      ]) as unknown,
      socketAddress: expect.any(String) as unknown,
    });
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
});

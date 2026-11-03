import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('createApp', () => {
  it('answers an unknown route with 404', async () => {
    const app = createApp({ checkDatabase: async () => true });

    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
  });
});

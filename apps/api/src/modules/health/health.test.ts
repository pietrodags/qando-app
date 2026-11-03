import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

describe('GET /api/health', () => {
  it('reports ok when the database answers', async () => {
    const app = createApp({ checkDatabase: async () => true });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('reports unavailable when the database does not answer', async () => {
    const app = createApp({ checkDatabase: async () => false });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable', database: 'down' });
  });

  it('reports unavailable when the database check fails', async () => {
    const app = createApp({
      checkDatabase: async () => {
        throw new Error('connection refused');
      },
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable', database: 'down' });
  });

  it('is never cached', async () => {
    const app = createApp({ checkDatabase: async () => true });

    const response = await request(app).get('/api/health');

    expect(response.headers['cache-control']).toBe('no-store');
  });
});

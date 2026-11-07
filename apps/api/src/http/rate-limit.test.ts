import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { testDependencies } from '../test/test-dependencies.js';

const token = 'kQ7vZ2xT9bLm4Np0Rs8wYA';
const limit = 60;

/** An app whose participations count how many transactions the requests opened. */
function setUp() {
  const dependencies = testDependencies();
  let transactions = 0;
  const app = createApp({
    ...dependencies,
    participations: {
      transaction: (work) => {
        transactions += 1;
        return dependencies.participations.transaction(work);
      },
    },
  });
  const readMine = () =>
    request(app).get('/api/public/events/k3P9x/participations/mine').set('X-Vote-Token', token);
  return { app, readMine, transactions: () => transactions };
}

async function spend(count: number, send: () => request.Test) {
  for (let sent = 0; sent < count; sent += 1) {
    const response = await send();
    expect(response.status, `request ${sent + 1}`).not.toBe(429);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('rate limit on the capability-token endpoints', () => {
  it(`answers ${limit} requests a minute from one address`, async () => {
    const { readMine } = setUp();

    await spend(limit, readMine);
  });

  it('refuses the next one with 429 RATE_LIMITED, before any database work', async () => {
    const { readMine, transactions } = setUp();
    await spend(limit, readMine);

    const refused = await readMine();

    expect(refused.status).toBe(429);
    expect(refused.body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests', details: [] },
    });
    expect(refused.headers['cache-control']).toBe('no-store');
    expect(transactions()).toBe(limit);
  });

  it('says in Retry-After how many seconds are left of the minute', async () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T08:00:00Z'), toFake: ['Date'] });
    const { readMine } = setUp();
    await spend(limit, readMine);
    vi.setSystemTime(new Date('2026-06-15T08:00:20Z'));

    const refused = await readMine();

    expect(refused.headers['retry-after']).toBe('40');
  });

  it('answers again once the minute is over', async () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T08:00:00Z'), toFake: ['Date'] });
    const { readMine } = setUp();
    await spend(limit, readMine);
    vi.setSystemTime(new Date('2026-06-15T08:01:00Z'));

    const response = await readMine();

    expect(response.status).not.toBe(429);
  });

  it('counts casting, reading and editing a vote together', async () => {
    const { app, readMine } = setUp();
    const path = '/api/public/events/k3P9x/participations';
    await spend(limit / 3, () => request(app).post(path).set('X-Vote-Token', token).send({}));
    await spend(limit / 3, () =>
      request(app).put(`${path}/mine`).set('X-Vote-Token', token).send({}),
    );
    await spend(limit / 3, readMine);

    const refused = await request(app).post(path).set('X-Vote-Token', token).send({});

    expect(refused.status).toBe(429);
  });

  it('counts reading the results with the voting endpoints', async () => {
    const { app, readMine } = setUp();
    await spend(limit / 2, readMine);
    await spend(limit / 2, () => request(app).get('/api/results/guess'));

    expect((await request(app).get('/api/results/guess')).status).toBe(429);
    expect((await readMine()).status).toBe(429);
  });

  it('counts every event together: changing the link does not reset it', async () => {
    const { app } = setUp();
    let link = 0;
    const nextLink = () => {
      link += 1;
      return request(app)
        .get(`/api/public/events/guess${link}/participations/mine`)
        .set('X-Vote-Token', token);
    };
    await spend(limit, nextLink);

    expect((await nextLink()).status).toBe(429);
  });

  // The chains the hosting forwards, as measured in production: through the web's `/api/*`
  // rewrite (CDN, rewrite proxy, CDN) and straight to the API's own URL (CDN only).
  const throughTheWeb = (client: string) =>
    `${client}, 162.158.42.8, 162.158.42.8,74.220.48.253, 162.158.111.185`;
  const straight = (client: string) => `${client}, 162.158.95.213`;

  it('counts each client address on its own, behind the hosting proxies', async () => {
    const { readMine } = setUp();
    await spend(limit, () => readMine().set('X-Forwarded-For', throughTheWeb('203.0.113.7')));

    const other = await readMine().set('X-Forwarded-For', throughTheWeb('198.51.100.9'));

    expect(other.status).not.toBe(429);
  });

  it('counts a client the same through the web and straight to the API', async () => {
    const { readMine } = setUp();
    await spend(limit, () => readMine().set('X-Forwarded-For', throughTheWeb('203.0.113.7')));

    const refused = await readMine().set('X-Forwarded-For', straight('203.0.113.7'));

    expect(refused.status).toBe(429);
  });

  it('ignores addresses the client writes itself in front of its own', async () => {
    const { readMine } = setUp();
    let forged = 0;
    const forging = () => {
      forged += 1;
      return readMine().set('X-Forwarded-For', throughTheWeb(`192.0.2.${forged}, 203.0.113.7`));
    };
    await spend(limit, forging);

    expect((await forging()).status).toBe(429);
  });

  it('counts IPv6 clients per /56 network, so rotating addresses does not help', async () => {
    const { readMine } = setUp();
    let host = 0;
    const rotating = () => {
      host += 1;
      return readMine().set('X-Forwarded-For', straight(`2001:db8:0:1::${host.toString(16)}`));
    };
    await spend(limit, rotating);

    expect((await rotating()).status).toBe(429);
  });

  it('leaves the other endpoints alone', async () => {
    const { app, readMine } = setUp();
    await spend(limit, readMine);

    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});

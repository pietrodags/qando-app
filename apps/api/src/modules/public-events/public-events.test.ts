import type { Option } from '@qando/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { testDependencies } from '../../test/test-dependencies.js';
import type { PublicEventLookup, StoredPublicEvent } from './public-events.js';

// "Cena de verano" closes at the end of 1 July in Madrid.
const closesAt = new Date('2026-07-01T21:59:59.999Z');
const july10: Option = {
  id: '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11',
  dates: { kind: 'single', date: '2026-07-10' },
  time: { kind: 'single', at: '21:00' },
};

const cena: StoredPublicEvent = {
  title: 'Cena de verano',
  organizerName: 'Ana',
  note: 'En el sitio de siempre',
  deadline: '2026-07-01',
  timeZone: 'Europe/Madrid',
  anonymous: false,
  state: 'open',
  closesAt,
  options: [july10],
  confirmedOption: null,
};

function appWith(events: Record<string, PublicEventLookup>, now = '2026-06-15T08:00:00Z') {
  return createApp(testDependencies({ publicEvents: events, now: new Date(now) }));
}

const read = (app: ReturnType<typeof appWith>, publicId: string) =>
  request(app).get(`/api/public/events/${publicId}`);

describe('GET /api/public/events/:id', () => {
  it('answers the event of the participation link as participants see it', async () => {
    const app = appWith({ k3P9x: { status: 'found', event: cena } });

    const response = await read(app, 'k3P9x');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      title: 'Cena de verano',
      organizerName: 'Ana',
      note: 'En el sitio de siempre',
      deadline: '2026-07-01',
      timeZone: 'Europe/Madrid',
      anonymous: false,
      state: 'open',
      options: [july10],
      confirmedOption: null,
    });
  });

  it('reads the event of the link it was given', async () => {
    const app = appWith({
      k3P9x: { status: 'found', event: cena },
      z8Lm2: { status: 'found', event: { ...cena, title: 'Comida de equipo' } },
    });

    const response = await read(app, 'z8Lm2');

    expect(response.body).toMatchObject({ title: 'Comida de equipo' });
  });

  it('answers closed once the closing instant has come, though nothing closed it', async () => {
    const app = appWith({ k3P9x: { status: 'found', event: cena } }, '2026-07-01T22:00:00Z');

    const response = await read(app, 'k3P9x');

    expect(response.body).toMatchObject({ state: 'closed' });
  });

  it('answers a confirmed event with its confirmed option', async () => {
    const confirmed = { ...cena, state: 'confirmed' as const, confirmedOption: july10 };
    const app = appWith({ k3P9x: { status: 'found', event: confirmed } });

    const response = await read(app, 'k3P9x');

    expect(response.body).toMatchObject({ state: 'confirmed', confirmedOption: july10 });
  });

  it('never answers what the contract does not show to participants', async () => {
    const leaky = { ...cena, organizerEmail: 'ana@example.com', managementTokenHash: 'abc' };
    const app = appWith({ k3P9x: { status: 'found', event: leaky } });

    const response = await read(app, 'k3P9x');

    expect(response.text).not.toContain('ana@example.com');
    expect(response.text).not.toContain('managementTokenHash');
    expect(response.body).not.toHaveProperty('closesAt');
  });

  it('answers 404 when no event has the link', async () => {
    const app = appWith({});

    const response = await read(app, 'k3P9x');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No event has this participation link', details: [] },
    });
  });

  it('answers 410 with the title when the event was cancelled', async () => {
    const app = appWith({ k3P9x: { status: 'cancelled', title: 'Cena de verano' } });

    const response = await read(app, 'k3P9x');

    expect(response.status).toBe(410);
    expect(response.body).toEqual({
      error: {
        code: 'EVENT_CANCELLED',
        message: 'The event was cancelled',
        details: [],
        title: 'Cena de verano',
      },
    });
  });

  it.each([
    ['found', { k3P9x: { status: 'found', event: cena } }],
    ['missing', {}],
    ['cancelled', { k3P9x: { status: 'cancelled', title: 'Cena' } }],
  ] as const)('is never cached (%s)', async (_case, events) => {
    const response = await read(appWith(events), 'k3P9x');

    expect(response.headers['cache-control']).toBe('no-store');
  });
});

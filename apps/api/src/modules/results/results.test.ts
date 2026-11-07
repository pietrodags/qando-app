import type { Option, Results } from '@qando/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { testDependencies } from '../../test/test-dependencies.js';
import type { ResultsLookup, StoredResultsEvent, StoredVote } from './read-results.js';

const resultsIn = (response: { body: unknown }) => response.body as Results;

// "Cena de verano" closes at the end of 1 July in Madrid.
const closesAt = new Date('2026-07-01T21:59:59.999Z');
const beforeDeadline = '2026-06-15T08:00:00Z';
const afterDeadline = '2026-07-02T08:00:00Z';

const option = (id: string, date: string): Option => ({
  id,
  dates: { kind: 'single', date },
  time: null,
});
const july6 = option('6a1e0c9b-1f4e-4b8e-9a51-0c1d2e3f4a06', '2026-07-06');
const july10 = option('0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c10', '2026-07-10');
const july11 = option('5d2f8a3c-7b61-4e0a-8c9d-2e4f6a8b1c11', '2026-07-11');

const vote = (
  name: string | null,
  states: readonly [
    StoredVote['votes'][string],
    StoredVote['votes'][string],
    StoredVote['votes'][string],
  ],
): StoredVote => ({
  name,
  votes: { [july6.id]: states[0], [july10.id]: states[1], [july11.id]: states[2] },
});

const cena: StoredResultsEvent = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  anonymous: false,
  state: 'open',
  closesAt,
  options: [july6, july10, july11],
  confirmedOption: null,
  votes: [],
};

function appWith(results: Record<string, ResultsLookup>, now = beforeDeadline) {
  return createApp(testDependencies({ results, now: new Date(now) }));
}

const read = (app: ReturnType<typeof appWith>, resultsId: string) =>
  request(app).get(`/api/results/${resultsId}`);

const readCena = (event: Partial<StoredResultsEvent>, now = beforeDeadline) =>
  read(appWith({ Qw7p2: { status: 'found', event: { ...cena, ...event } } }, now), 'Qw7p2');

describe('GET /api/results/:resultsId', () => {
  it('answers the winner, its counts and who answered it each way', async () => {
    const response = await readCena({
      votes: [
        vote('Luis', ['available', 'preferred', 'unavailable']),
        vote('Marta', ['available', 'available', 'unavailable']),
        vote('Álvaro', ['unavailable', 'available', 'available']),
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      title: 'Cena de verano',
      timeZone: 'Europe/Madrid',
      final: false,
      outcome: 'one',
      voters: 3,
      attending: 3,
      notAttending: 0,
      winnersListed: true,
      winners: [
        {
          option: july10,
          preferred: 1,
          available: 2,
          unavailable: 0,
          names: { preferred: ['Luis'], available: ['Álvaro', 'Marta'], unavailable: [] },
        },
      ],
      alternatives: [],
      confirmedOption: null,
    });
  });

  it('answers the alternatives with their names, most preferred first', async () => {
    const response = await readCena({
      votes: [
        vote('Luis', ['preferred', 'available', 'available']),
        vote('Marta', ['available', 'available', 'preferred']),
        vote('Pablo', ['available', 'unavailable', 'preferred']),
        vote('Sofía', ['available', 'available', 'available']),
      ],
    });

    expect(response.body).toMatchObject({
      outcome: 'one',
      attending: 4,
      notAttending: 0,
      winners: [
        {
          option: july11,
          preferred: 2,
          names: { preferred: ['Marta', 'Pablo'], available: ['Luis', 'Sofía'], unavailable: [] },
        },
      ],
      alternatives: [
        {
          option: july6,
          preferred: 1,
          available: 3,
          unavailable: 0,
          names: { preferred: ['Luis'], available: ['Marta', 'Pablo', 'Sofía'], unavailable: [] },
        },
      ],
    });
  });

  it('lists the voters who cannot attend an option under it', async () => {
    const response = await readCena({
      votes: [
        vote('Luis', ['available', 'unavailable', 'unavailable']),
        vote('Marta', ['available', 'unavailable', 'unavailable']),
        vote('Pablo', ['unavailable', 'unavailable', 'unavailable']),
      ],
    });

    expect(response.body).toMatchObject({
      attending: 2,
      notAttending: 1,
      winners: [
        {
          option: july6,
          unavailable: 1,
          names: { preferred: [], available: ['Luis', 'Marta'], unavailable: ['Pablo'] },
        },
      ],
    });
  });

  it('sorts the names in Spanish alphabetical order, accents and case aside', async () => {
    const names = ['Óscar', 'pablo', 'Zoe', 'Álvaro', 'ana', 'Ñoño', 'Nuria', 'Beatriz'];
    const response = await readCena({
      votes: names.map((name) => vote(name, ['available', 'unavailable', 'unavailable'])),
    });

    expect(resultsIn(response).winners[0]?.names?.available).toEqual([
      'Álvaro',
      'ana',
      'Beatriz',
      'Nuria',
      'Ñoño',
      'Óscar',
      'pablo',
      'Zoe',
    ]);
  });

  it('answers a tie with every winner in the event order', async () => {
    const response = await readCena({
      votes: [
        vote('Luis', ['preferred', 'available', 'unavailable']),
        vote('Marta', ['available', 'preferred', 'unavailable']),
      ],
    });

    expect(response.body).toMatchObject({ outcome: 'two', winnersListed: true });
    expect(resultsIn(response).winners.map((shown) => shown.option)).toEqual([july6, july10]);
  });

  it('shows no names on an anonymous event', async () => {
    const response = await readCena({
      anonymous: true,
      votes: [
        vote(null, ['preferred', 'available', 'unavailable']),
        vote(null, ['preferred', 'available', 'unavailable']),
        vote(null, ['available', 'preferred', 'unavailable']),
      ],
    });

    expect(resultsIn(response).winners).toEqual([
      { option: july6, preferred: 2, available: 1, unavailable: 0 },
    ]);
    expect(resultsIn(response).alternatives).toEqual([
      { option: july10, preferred: 1, available: 2, unavailable: 0 },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('names');
  });

  it('answers no winner while nobody has voted', async () => {
    const response = await readCena({ votes: [] });

    expect(response.body).toMatchObject({
      outcome: 'no-votes',
      voters: 0,
      attending: 0,
      notAttending: 0,
      winnersListed: false,
      winners: [],
      alternatives: [],
    });
  });

  it('answers no winner when nobody can attend any option', async () => {
    const response = await readCena({
      votes: [vote('Luis', ['unavailable', 'unavailable', 'unavailable'])],
    });

    expect(response.body).toMatchObject({
      outcome: 'nobody-can-attend',
      voters: 1,
      attending: 0,
      notAttending: 1,
      winners: [],
    });
  });

  it('says the results are final once the deadline has passed', async () => {
    expect(resultsIn(await readCena({}, beforeDeadline)).final).toBe(false);
    expect(resultsIn(await readCena({}, afterDeadline)).final).toBe(true);
  });

  it('says the results are final when the organizer closed voting early', async () => {
    expect(resultsIn(await readCena({ state: 'closed' })).final).toBe(true);
  });

  it('answers the confirmed option apart from the winners', async () => {
    const response = await readCena({
      state: 'confirmed',
      confirmedOption: july11,
      votes: [vote('Luis', ['preferred', 'unavailable', 'available'])],
    });

    expect(response.body).toMatchObject({
      final: true,
      confirmedOption: july11,
      winners: [{ option: july6 }],
    });
  });

  it('reads the results of the link it was given', async () => {
    const app = appWith({
      Qw7p2: { status: 'found', event: cena },
      Zr4t8: { status: 'found', event: { ...cena, title: 'Comida de equipo' } },
    });

    expect(resultsIn(await read(app, 'Zr4t8')).title).toBe('Comida de equipo');
  });

  it('never lets a response be cached', async () => {
    const app = appWith({ Qw7p2: { status: 'found', event: cena } });

    expect((await read(app, 'Qw7p2')).headers['cache-control']).toBe('no-store');
    expect((await read(app, 'unknown')).headers['cache-control']).toBe('no-store');
  });

  it('refuses the participation link of an event with 403 FORBIDDEN', async () => {
    const response = await read(appWith({ k3P9x: { status: 'participation-link' } }), 'k3P9x');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'A participation link opens no results',
        details: [],
      },
    });
  });

  it('answers a cancelled event with 410 EVENT_CANCELLED and its title', async () => {
    const app = appWith({ Qw7p2: { status: 'cancelled', title: 'Cena de verano' } });

    const response = await read(app, 'Qw7p2');

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

  it('answers an unknown link with 404 NOT_FOUND', async () => {
    const response = await read(appWith({}), 'unknown');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No event has this results link', details: [] },
    });
  });

  it('answers a link with broken percent-encoding with 400', async () => {
    const response = await read(appWith({}), '%E0%A4%A');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });
});

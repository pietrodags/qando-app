import { describe, expect, it } from 'vitest';
import { resultsEndpoint, resultsForbiddenSchema, resultsSchema, type Results } from './results.js';

const july10 = {
  id: '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11',
  dates: { kind: 'single', date: '2026-07-10' },
  time: null,
} as const;

const named: Results = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  final: false,
  outcome: 'one',
  voters: 2,
  attending: 2,
  notAttending: 0,
  winnersListed: true,
  winners: [
    {
      option: july10,
      preferred: 1,
      available: 1,
      unavailable: 0,
      names: { preferred: ['Luis'], available: ['Marta'], unavailable: [] },
    },
  ],
  alternatives: [],
  confirmedOption: null,
};

describe('results contract', () => {
  it('accepts the results of a named event, with the names of each option', () => {
    expect(resultsSchema.parse(named)).toEqual(named);
  });

  it('accepts options without names, as on anonymous events', () => {
    const { option, preferred, available, unavailable } = named.winners[0]!;
    const anonymous = { ...named, winners: [{ option, preferred, available, unavailable }] };

    expect(resultsSchema.parse(anonymous)).toEqual(anonymous);
  });

  it('accepts a confirmed option', () => {
    const confirmed = { ...named, final: true, confirmedOption: july10 };
    expect(resultsSchema.parse(confirmed)).toEqual(confirmed);
  });

  it.each(['no-votes', 'nobody-can-attend', 'one', 'two', 'three', 'several', 'all'])(
    'accepts the outcome %s',
    (outcome) => {
      expect(resultsSchema.safeParse({ ...named, outcome }).success).toBe(true);
    },
  );

  it.each([
    ['an unknown outcome', { ...named, outcome: 'tie' }],
    ['a negative count', { ...named, voters: -1 }],
    ['a count that is not whole', { ...named, attending: 1.5 }],
    [
      'an option count that is negative',
      { ...named, winners: [{ ...named.winners[0], unavailable: -1 }] },
    ],
  ])('rejects %s', (_name, results) => {
    expect(resultsSchema.safeParse(results).success).toBe(false);
  });

  it('drops fields that are not part of the contract', () => {
    const leaked = { ...named, organizerEmail: 'ana@example.com', publicId: 'k3P9x' };
    expect(resultsSchema.parse(leaked)).toEqual(named);
  });

  it('refuses the participation link with FORBIDDEN', () => {
    const body = { error: { code: 'FORBIDDEN', message: 'Not a results link', details: [] } };
    expect(resultsForbiddenSchema.parse(body)).toEqual(body);
  });

  it('is served by GET /api/results/{resultsId} with 200, 400, 403, 404, 410, 429 and 500', () => {
    expect(resultsEndpoint.method).toBe('get');
    expect(resultsEndpoint.path).toBe('/api/results/{resultsId}');
    expect(Object.keys(resultsEndpoint.responses)).toEqual([
      '200',
      '400',
      '403',
      '404',
      '410',
      '429',
      '500',
    ]);
    expect(resultsEndpoint.params.parse({ resultsId: 'Qw7p2' })).toEqual({ resultsId: 'Qw7p2' });
    expect(resultsEndpoint.params.safeParse({ resultsId: '' }).success).toBe(false);
  });
});

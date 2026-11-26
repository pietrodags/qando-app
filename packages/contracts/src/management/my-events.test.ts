import { describe, expect, it } from 'vitest';
import { myEventsEndpoint, myEventsSchema, type MyEvent } from './my-events.js';

const excursion: MyEvent = {
  id: 'Re0YVYWmRfkSlDvhAzL-Yw',
  title: 'Excursión',
  state: 'open',
  deadline: '2026-07-20',
  voters: 0,
  createdAt: '2026-06-14T09:30:00.000Z',
};

const cena: MyEvent = {
  id: 'uHuaiU4BzZfa7oUR2OC3QQ',
  title: 'Cena de verano',
  state: 'confirmed',
  deadline: '2026-07-01',
  voters: 2,
  createdAt: '2026-06-10T18:05:12.345Z',
};

describe('my events contract', () => {
  it('accepts the events of an account as the list shows them', () => {
    expect(myEventsSchema.parse([excursion, cena])).toEqual([excursion, cena]);
  });

  it('accepts an account without events', () => {
    expect(myEventsSchema.parse([])).toEqual([]);
  });

  it.each([
    ['an unknown state', { ...cena, state: 'cancelled' }],
    ['a deadline that is not a calendar date', { ...cena, deadline: '1 July' }],
    ['a creation instant that is not one', { ...cena, createdAt: 'yesterday' }],
    ['a creation instant without its time zone', { ...cena, createdAt: '2026-06-10T18:05:12' }],
    ['no title', { ...cena, title: undefined }],
    ['no count of voters', { ...cena, voters: undefined }],
    ['a negative count of voters', { ...cena, voters: -1 }],
    ['a count of voters that is not whole', { ...cena, voters: 1.5 }],
  ])('rejects %s', (_name, event) => {
    expect(myEventsSchema.safeParse([event]).success).toBe(false);
  });

  it('drops fields that are not part of the contract', () => {
    const leaked = { ...cena, ownerId: 'ana', managementTokenHash: 'a1', resultsId: 'Qw7p2' };
    expect(myEventsSchema.parse([leaked])).toEqual([cena]);
  });

  it('is read with the session alone, at a path of its own', () => {
    expect(myEventsEndpoint.method).toBe('get');
    expect(myEventsEndpoint.path).toBe('/api/me/events');
    expect(myEventsEndpoint.responses[200].schema).toBe(myEventsSchema);
    expect(Object.keys(myEventsEndpoint.responses)).toEqual(['200', '401', '500']);
  });
});

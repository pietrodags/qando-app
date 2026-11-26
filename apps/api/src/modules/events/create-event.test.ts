import type { EventCreated } from '@qando/contracts';
import { closingInstant, type NewEvent, type NewEventInput } from '@qando/domain';
import { describe, expect, it } from 'vitest';
import {
  createEvent,
  createEventOnce,
  type AssistantEventInput,
  type NewEvents,
} from './create-event.js';

// 10:00 in Madrid on 15 June 2026.
const morning = new Date('2026-06-15T08:00:00Z');

const links: EventCreated = {
  participationId: 'uHuaiU4BzZfa7oUR2OC3QQ',
  resultsId: 'Re0YVYWmRfkSlDvhAzL-Yw',
};

const token = 'Zx81aB2cD4eF6gH8iJ0kLm';

const wholeDay = (date: string) => ({ dates: { kind: 'single', date }, time: null }) as const;

const cena: NewEventInput = {
  title: ' Cena de verano ',
  organizerName: 'Ana',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  anonymous: false,
  options: [wholeDay('2026-07-10'), wholeDay('2026-07-06')],
};

/** The events stored, by owner and token, each answered with `answer`. */
function storedEvents(answer: EventCreated | 'taken' = links) {
  const stored: { ownerId: string; managementToken: string; event: NewEvent }[] = [];
  const newEvents: NewEvents = {
    create: (ownerId, managementToken, event) => {
      stored.push({ ownerId, managementToken, event });
      return Promise.resolve(answer);
    },
    createOnce: () => Promise.reject(new Error('Not created once in this test')),
    lastOrganizerName: () => Promise.reject(new Error('No name is looked up in this test')),
  };
  return { stored, newEvents };
}

describe('createEvent', () => {
  it('stores the event as the domain checked it, owned by the account with its token, and answers its links', async () => {
    const { stored, newEvents } = storedEvents();

    const creation = await createEvent(newEvents, 'ana', token, cena, morning);

    expect(creation).toEqual({ status: 'created', links });
    expect(stored).toEqual([
      {
        ownerId: 'ana',
        managementToken: token,
        event: {
          organizerName: 'Ana',
          title: 'Cena de verano',
          note: null,
          timeZone: 'Europe/Madrid',
          deadline: '2026-07-01',
          closesAt: closingInstant('2026-07-01', 'Europe/Madrid'),
          anonymous: false,
          options: [wholeDay('2026-07-06'), wholeDay('2026-07-10')],
        },
      },
    ]);
  });

  it('stores nothing and answers every problem of an event that breaks the rules', async () => {
    const { stored, newEvents } = storedEvents();
    const coffee = {
      dates: { kind: 'single', date: '2026-07-10' },
      time: { kind: 'range', start: '20:00', end: '20:30' },
    } as const;

    const creation = await createEvent(
      newEvents,
      'ana',
      token,
      { ...cena, organizerName: 'A', options: [wholeDay('2026-06-14'), coffee] },
      morning,
    );

    expect(creation).toEqual({
      status: 'rejected',
      problems: [
        { code: 'NAME_TOO_SHORT' },
        { code: 'DATE_PAST', index: 0 },
        { code: 'TIME_RANGE_WITHIN_ONE_HOUR', index: 1 },
      ],
    });
    expect(stored).toEqual([]);
  });

  it('refuses a token that holds an event of another account', async () => {
    const { newEvents } = storedEvents('taken');

    const creation = await createEvent(newEvents, 'ana', token, cena, morning);

    expect(creation).toEqual({
      status: 'rejected',
      problems: [{ code: 'MANAGEMENT_TOKEN_TAKEN' }],
    });
  });

  it('takes today from the time given, in the event’s time zone', async () => {
    const { stored, newEvents } = storedEvents();
    const options = [wholeDay('2026-06-14')];

    const madrid = await createEvent(newEvents, 'ana', token, { ...cena, options }, morning);
    // 10:00 in Madrid is 21:00 of the 14th in Pago Pago (UTC−11).
    const pacific = await createEvent(
      newEvents,
      'ana',
      token,
      { ...cena, timeZone: 'Pacific/Pago_Pago', deadline: '2026-06-14', options },
      morning,
    );

    expect(madrid.status).toBe('rejected');
    expect(pacific.status).toBe('created');
    expect(stored).toHaveLength(1);
  });
});

/**
 * The events an assistant's calls store: each call with the account, the event and the rules it
 * was stored under, answered with `answer`; `lastName` is the name of the account's last event,
 * `null` for an account without one.
 */
function storedOnce(
  answer: EventCreated | { retryAt: Date } = links,
  lastName: string | null = 'Ana G.',
) {
  const stored: { ownerId: string; event: NewEvent; rules: unknown }[] = [];
  const asked: string[] = [];
  const newEvents: NewEvents = {
    create: () => Promise.reject(new Error('No token is sent by an assistant')),
    createOnce: (ownerId, event, rules) => {
      stored.push({ ownerId, event, rules });
      return Promise.resolve(answer);
    },
    lastOrganizerName: (ownerId) => {
      asked.push(ownerId);
      return Promise.resolve(lastName ?? undefined);
    },
  };
  return { stored, asked, newEvents };
}

const unnamed: AssistantEventInput = { ...cena, organizerName: undefined };

describe('createEventOnce', () => {
  it('stores the event as the domain checked it, once within 10 minutes and at most 10 an hour, and answers its title and links', async () => {
    const { stored, newEvents } = storedOnce();

    const creation = await createEventOnce(newEvents, 'ana', cena, morning);

    expect(creation).toEqual({ status: 'created', title: 'Cena de verano', links });
    expect(stored).toEqual([
      {
        ownerId: 'ana',
        event: {
          organizerName: 'Ana',
          title: 'Cena de verano',
          note: null,
          timeZone: 'Europe/Madrid',
          deadline: '2026-07-01',
          closesAt: closingInstant('2026-07-01', 'Europe/Madrid'),
          anonymous: false,
          options: [wholeDay('2026-07-06'), wholeDay('2026-07-10')],
        },
        rules: { sameWithinMs: 10 * 60_000, atMost: { count: 10, withinMs: 60 * 60_000 } },
      },
    ]);
  });

  it.each([
    ['no name', unnamed],
    ['a name of spaces', { ...cena, organizerName: '  ' }],
  ])('takes the name of the account’s last event for %s', async (_case, input) => {
    const { stored, asked, newEvents } = storedOnce();

    await createEventOnce(newEvents, 'ana', input, morning);

    expect(asked).toEqual(['ana']);
    expect(stored.map(({ event }) => event.organizerName)).toEqual(['Ana G.']);
  });

  it('keeps the name sent, even when the account’s last event has another', async () => {
    const { stored, newEvents } = storedOnce();

    await createEventOnce(newEvents, 'ana', { ...cena, organizerName: ' Ana ' }, morning);

    expect(stored.map(({ event }) => event.organizerName)).toEqual(['Ana']);
  });

  it('stores nothing and answers the name missing when none is sent and the account has no event yet', async () => {
    const { stored, newEvents } = storedOnce(links, null);

    const creation = await createEventOnce(newEvents, 'ana', unnamed, morning);

    expect(creation).toEqual({ status: 'rejected', problems: [{ code: 'NAME_MISSING' }] });
    expect(stored).toEqual([]);
  });

  it('stores nothing and answers every problem of an event that breaks the rules', async () => {
    const { stored, newEvents } = storedOnce();

    const creation = await createEventOnce(
      newEvents,
      'ana',
      { ...cena, title: ' ', options: [], deadline: '2026-06-14' },
      morning,
    );

    expect(creation).toEqual({
      status: 'rejected',
      problems: [{ code: 'TITLE_MISSING' }, { code: 'NO_OPTIONS' }, { code: 'DEADLINE_PAST' }],
    });
    expect(stored).toEqual([]);
  });

  it.each([
    ['in whole seconds, rounded up', new Date(morning.getTime() + 754_200), 755],
    ['at least one second', new Date(morning.getTime() + 200), 1],
    ['at least one second, at the moment itself', morning, 1],
  ])(
    'answers how long to wait when the account created its 10 events of the hour, %s',
    async (_case, retryAt, seconds) => {
      const { newEvents } = storedOnce({ retryAt });

      const creation = await createEventOnce(newEvents, 'ana', cena, morning);

      expect(creation).toEqual({ status: 'limited', retryAfterSeconds: seconds });
    },
  );
});

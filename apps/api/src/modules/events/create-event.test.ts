import type { EventCreated } from '@qando/contracts';
import { closingInstant, type NewEvent, type NewEventInput } from '@qando/domain';
import { describe, expect, it } from 'vitest';
import { createEvent, type NewEvents } from './create-event.js';

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

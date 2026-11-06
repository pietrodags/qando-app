import { closingInstant, validateVote } from '@qando/domain';
import { describe, expect, it } from 'vitest';
import { demoEvents, linksOf, type DemoEvent } from './demo-events.js';
import type { SeededEvent } from './seed-event.js';

const today = '2026-06-15';
const now = new Date('2026-06-15T08:00:00Z');

const byTitle = (title: string): DemoEvent => {
  const found = demoEvents(today).find((demo) => demo.seed.title === title);
  if (!found) throw new Error(`No demo event "${title}"`);
  return found;
};

describe('demoEvents', () => {
  it('shows every state a page has to show', () => {
    expect(demoEvents(today).map(({ seed, state }) => [seed.title, state])).toEqual([
      ['Cena de verano', 'open'],
      ['Regalo para Lucía', 'open, anonymous'],
      ['Excursión a la sierra', 'closed, pending confirmation'],
      ['Comida de equipo', 'confirmed'],
      ['Concierto en el parque', 'cancelled'],
    ]);
  });

  it('dates everything from the day it runs', () => {
    const cena = byTitle('Cena de verano').seed;

    expect(cena.deadline).toBe('2026-06-29');
    expect(cena.options).toEqual([
      '2026-07-05',
      { date: '2026-07-09', startTime: '21:00' },
      { date: '2026-07-10', endDate: '2026-07-11' },
    ]);
    expect(byTitle('Excursión a la sierra').seed.deadline).toBe('2026-06-14');
  });

  it('dates across the end of a month and of a year', () => {
    const [cena] = demoEvents('2026-12-20');

    expect(cena?.seed.deadline).toBe('2027-01-03');
  });

  it('keeps the open events open and the closed ones closed on the day it runs', () => {
    const closing = (title: string) => {
      const { seed } = byTitle(title);
      return closingInstant(seed.deadline, seed.timeZone ?? 'Europe/Madrid');
    };

    expect(closing('Cena de verano').getTime()).toBeGreaterThan(now.getTime());
    expect(closing('Regalo para Lucía').getTime()).toBeGreaterThan(now.getTime());
    expect(closing('Excursión a la sierra').getTime()).toBeLessThan(now.getTime());
    expect(closing('Comida de equipo').getTime()).toBeLessThan(now.getTime());
  });

  it('offers only dates after the day it runs', () => {
    for (const { seed } of demoEvents(today)) {
      for (const option of seed.options) {
        const date = typeof option === 'string' ? option : option.date;
        expect(date > today, `${seed.title}: ${date}`).toBe(true);
      }
    }
  });

  it('writes every time as HH:MM and every note with some text', () => {
    for (const { seed } of demoEvents(today)) {
      expect(seed.note ?? 'none', seed.title).not.toBe('');
      for (const option of seed.options) {
        if (typeof option === 'string') continue;
        for (const time of [option.startTime, option.endTime].filter((t) => t !== undefined)) {
          expect(time, seed.title).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
        }
      }
    }
  });

  it('confirms an option the event offers', () => {
    const { seed } = byTitle('Comida de equipo');

    expect(seed.outcome).toEqual({ confirmed: 1 });
    expect(seed.options[1]).toBeDefined();
  });

  it('stores only votes the API would accept', () => {
    for (const { seed } of demoEvents(today)) {
      const optionIds = seed.options.map((_, position) => `option-${position}`);
      expect(seed.votes?.length ?? 0, seed.title).toBeLessThanOrEqual(5);
      for (const vote of seed.votes ?? []) {
        for (const state of vote.states) {
          expect(['available', 'preferred', 'unavailable'], seed.title).toContain(state);
        }
        const votes = Object.fromEntries(vote.states.map((state, i) => [optionIds[i]!, state]));
        const validation = validateVote(
          { anonymous: seed.anonymous ?? false, optionIds },
          { name: vote.name, votes },
        );
        expect(validation, `${seed.title}: ${vote.name ?? 'anonymous'}`).toMatchObject({
          ok: true,
        });
      }
    }
  });

  it('offers at least one date on every event', () => {
    for (const { seed } of demoEvents(today)) {
      expect(seed.options.length, seed.title).toBeGreaterThan(0);
    }
  });

  it('has votes on every event that is not cancelled, so the results are not empty', () => {
    for (const { seed } of demoEvents(today).filter(({ seed }) => seed.outcome !== 'cancelled')) {
      expect(seed.votes?.length, seed.title).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('linksOf', () => {
  const seeded: SeededEvent = {
    title: 'Cena de verano',
    publicId: 'P1',
    resultsId: 'R1',
    managementToken: 'M1',
    optionIds: ['o1'],
    votes: [{ name: 'Luis', token: 'V1' }, { token: 'V2' }],
    cancelled: false,
  };

  it('builds the links the pages are opened with, the tokens in the fragment', () => {
    expect(linksOf('https://qando.app', seeded)).toEqual([
      ['Vote', 'https://qando.app/vote/P1'],
      ['Results', 'https://qando.app/results/R1'],
      ['Manage', 'https://qando.app/manage/P1#t=M1'],
      ['Edit the vote of Luis', 'https://qando.app/vote/P1/my-vote#t=V1'],
      ['Edit vote 2', 'https://qando.app/vote/P1/my-vote#t=V2'],
    ]);
  });

  it('accepts a web address that ends in a slash', () => {
    expect(linksOf('http://localhost:4200/', seeded)[0]).toEqual([
      'Vote',
      'http://localhost:4200/vote/P1',
    ]);
  });

  it('gives a cancelled event only the links that still answer', () => {
    const cancelled = { ...seeded, optionIds: [], votes: [], cancelled: true };

    expect(linksOf('https://qando.app', cancelled)).toEqual([
      ['Vote', 'https://qando.app/vote/P1'],
      ['Results', 'https://qando.app/results/R1'],
    ]);
  });
});

import { createRequire } from 'node:module';
import type { ProposedOption } from '@qando/domain';
import { describe, expect, it } from 'vitest';
import { dayLabel, shortOptionLabel, zoneCity } from './date-labels.js';

function single(date: string, time: ProposedOption['time'] = null): ProposedOption {
  return { dates: { kind: 'single', date }, time };
}

function range(start: string, end: string): ProposedOption {
  return { dates: { kind: 'range', start, end }, time: null };
}

describe('shortOptionLabel', () => {
  // The same labels as the results page's chart, so an email and the page name an option alike.
  it.each([
    ['a day', single('2026-07-11'), 'Sáb 11 Jul'],
    ['a day at a time', single('2026-01-08', { kind: 'single', at: '09:30' }), 'Jue 8 Ene · 9:30'],
    [
      'a day between two times',
      single('2026-01-08', { kind: 'range', start: '10:00', end: '12:00' }),
      'Jue 8 Ene · 10:00 → 12:00',
    ],
    ['days in one month', range('2026-07-07', '2026-07-10'), 'Mar 7 → Vie 10 Jul'],
    ['days across two months', range('2026-06-29', '2026-07-02'), 'Lun 29 Jun → Jue 2 Jul'],
    ['a day in September, without the abbreviation’s dot', single('2026-09-05'), 'Sáb 5 Sept'],
    ['a Wednesday, with its accent', single('2026-06-03'), 'Mié 3 Jun'],
  ])('names %s', (_case, option, expected) => {
    expect(shortOptionLabel(option)).toBe(expected);
  });

  it('follows the shapes of the results page’s chart: a change there fails here', () => {
    // The emails name options as the chart does, which takes its shapes from the web's catalogue:
    // when they change, the emails' labels above change with them.
    const catalogue = createRequire(import.meta.url)('@qando/web/src/i18n/es.json') as {
      results: { label: { short: Record<string, string> } };
    };

    expect(catalogue.results.label.short).toEqual({
      date: '{weekday} {day} {month}',
      atTime: '{date} · {time}',
      betweenTimes: '{date} · {start} → {end}',
      sameMonth: '{startWeekday} {startDay} → {endWeekday} {endDay} {month}',
      acrossMonths: '{start} → {end}',
    });
  });

  it('takes the same month of another year as another month', () => {
    expect(shortOptionLabel(range('2026-07-30', '2027-07-02'))).toBe('Jue 30 Jul → Vie 2 Jul');
  });

  it('writes an hour without its leading zero, the minutes always with two digits', () => {
    expect(shortOptionLabel(single('2026-07-06', { kind: 'single', at: '21:05' }))).toBe(
      'Lun 6 Jul · 21:05',
    );
    expect(shortOptionLabel(single('2026-07-06', { kind: 'single', at: '00:00' }))).toBe(
      'Lun 6 Jul · 0:00',
    );
  });
});

describe('dayLabel', () => {
  it.each([
    ['2026-07-01', 'miércoles 1 de julio de 2026'],
    ['2026-12-31', 'jueves 31 de diciembre de 2026'],
    ['2027-01-09', 'sábado 9 de enero de 2027'],
  ])('names %s in full, in lower case, as a sentence says it', (date, expected) => {
    expect(dayLabel(date)).toBe(expected);
  });
});

describe('zoneCity', () => {
  it.each([
    ['Europe/Madrid', 'Madrid'],
    ['America/New_York', 'New York'],
    ['America/Argentina/Buenos_Aires', 'Buenos Aires'],
    ['UTC', 'UTC'],
  ])('names %s by its city', (timeZone, expected) => {
    expect(zoneCity(timeZone)).toBe(expected);
  });
});

import { capitalised, clockLabel, fullDate, longDate, optionInFull, zoneCity } from './display';

describe('longDate', () => {
  it('names the day, month and year of a date-only ISO string, whatever the zone', () => {
    expect(longDate('2026-07-01', 'es')).toBe('1 de julio de 2026');
    expect(longDate('2026-12-31', 'es')).toBe('31 de diciembre de 2026');
  });
});

describe('capitalised', () => {
  it('puts the first letter in upper case and keeps the rest as typed', () => {
    expect(capitalised('ana maría', 'es')).toBe('Ana maría');
    expect(capitalised('iñaki', 'es')).toBe('Iñaki');
    expect(capitalised('', 'es')).toBe('');
  });
});

describe('fullDate', () => {
  it('names the weekday before the long date, with no comma between them', () => {
    expect(fullDate('2026-07-10', 'es')).toBe('viernes 10 de julio de 2026');
    expect(fullDate('2026-12-31', 'es')).toBe('jueves 31 de diciembre de 2026');
  });
});

describe('clockLabel', () => {
  it('drops the leading zero of the hour and keeps the minutes', () => {
    expect(clockLabel('09:05')).toBe('9:05');
    expect(clockLabel('00:30')).toBe('0:30');
    expect(clockLabel('20:00')).toBe('20:00');
  });
});

describe('zoneCity', () => {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  it('names the city of another time zone, with spaces', () => {
    const other = browserZone === 'America/New_York' ? 'America/Los_Angeles' : 'America/New_York';
    expect(zoneCity(other)).toBe(other === 'America/New_York' ? 'New York' : 'Los Angeles');
  });

  it("is null in the browser's own zone", () => {
    expect(zoneCity(browserZone)).toBeNull();
  });
});

describe('optionInFull', () => {
  // The catalogue's two shapes: "{date}, {time}" and "{start} a {end}".
  const translate = (key: string, params: Record<string, string>) =>
    key === 'vote.confirmed.dateAndTime'
      ? `${params['date']!}, ${params['time']!}`
      : `${params['start']!} a ${params['end']!}`;
  const id = '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11';

  it.each([
    ['a whole day', { kind: 'single', date: '2026-07-10' }, null, 'viernes 10 de julio de 2026'],
    [
      'a range of days',
      { kind: 'range', start: '2026-07-10', end: '2026-07-12' },
      null,
      'viernes 10 de julio de 2026 a domingo 12 de julio de 2026',
    ],
    [
      'a day at a time',
      { kind: 'single', date: '2026-07-10' },
      { kind: 'single', at: '09:30' },
      'viernes 10 de julio de 2026, 9:30',
    ],
    [
      'a day between two times',
      { kind: 'single', date: '2026-07-10' },
      { kind: 'range', start: '20:00', end: '22:00' },
      'viernes 10 de julio de 2026, 20:00 a 22:00',
    ],
  ] as const)('names %s with its weekday and year', (_name, dates, time, expected) => {
    expect(optionInFull({ id, dates, time }, 'es', translate)).toBe(expected);
  });
});

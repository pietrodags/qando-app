import { capitalised, clockLabel, fullDate, longDate } from './display';

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

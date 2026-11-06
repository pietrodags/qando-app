import { capitalised, longDate } from './display';

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

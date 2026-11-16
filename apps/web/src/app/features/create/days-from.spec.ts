import { daysFrom } from './days-from';

describe('the day so many days from a date', () => {
  it('is the date itself at no days', () => {
    expect(daysFrom('2026-06-15', 0)).toBe('2026-06-15');
  });

  it('counts forward and backward', () => {
    expect(daysFrom('2026-06-15', 1)).toBe('2026-06-16');
    expect(daysFrom('2026-06-15', -1)).toBe('2026-06-14');
    expect(daysFrom('2026-06-15', 7)).toBe('2026-06-22');
  });

  it('crosses months, years and the leap day', () => {
    expect(daysFrom('2026-06-30', 1)).toBe('2026-07-01');
    expect(daysFrom('2027-01-01', -1)).toBe('2026-12-31');
    expect(daysFrom('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysFrom('2028-02-28', 2)).toBe('2028-03-01');
  });

  it('counts calendar days where the clocks change', () => {
    // In Europe/Madrid the night of 2026-10-25 has 25 hours and that of 2027-03-28 has 23.
    expect(daysFrom('2026-10-24', 2)).toBe('2026-10-26');
    expect(daysFrom('2027-03-27', 2)).toBe('2027-03-29');
  });
});

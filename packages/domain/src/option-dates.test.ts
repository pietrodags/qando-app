import { describe, expect, it } from 'vitest';
import { latestOptionDate } from './option-dates.js';

describe('latestOptionDate', () => {
  it('is the same day twelve months after today', () => {
    expect(latestOptionDate('2026-06-15')).toBe('2027-06-15');
    expect(latestOptionDate('2026-11-16')).toBe('2027-11-16');
  });

  it('keeps the first and the last day of a year', () => {
    expect(latestOptionDate('2026-01-01')).toBe('2027-01-01');
    expect(latestOptionDate('2026-12-31')).toBe('2027-12-31');
  });

  it('is 28 February a year after a 29 February', () => {
    expect(latestOptionDate('2028-02-29')).toBe('2029-02-28');
  });

  it('does not move the days around a 29 February', () => {
    expect(latestOptionDate('2027-02-28')).toBe('2028-02-28');
    expect(latestOptionDate('2028-03-01')).toBe('2029-03-01');
  });
});

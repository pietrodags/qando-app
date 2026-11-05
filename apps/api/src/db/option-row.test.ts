import { describe, expect, it } from 'vitest';
import { optionFromRow } from './option-row.js';

const id = '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11';
const row = { id, startDate: '2026-07-10', endDate: null, startTime: null, endTime: null };

describe('optionFromRow', () => {
  it('reads a whole day', () => {
    expect(optionFromRow(row)).toEqual({
      id,
      dates: { kind: 'single', date: '2026-07-10' },
      time: null,
    });
  });

  it('reads a range of days', () => {
    expect(optionFromRow({ ...row, endDate: '2026-07-12' })).toEqual({
      id,
      dates: { kind: 'range', start: '2026-07-10', end: '2026-07-12' },
      time: null,
    });
  });

  it('reads a start time, without the seconds PostgreSQL adds', () => {
    expect(optionFromRow({ ...row, startTime: '21:00:00' }).time).toEqual({
      kind: 'single',
      at: '21:00',
    });
  });

  it('reads a time range', () => {
    expect(optionFromRow({ ...row, startTime: '09:00:00', endTime: '13:30:00' }).time).toEqual({
      kind: 'range',
      start: '09:00',
      end: '13:30',
    });
  });
});

import { type Shape, shapeOf } from './day-shape';

// A month that starts on a Wednesday (two blanks) and has 31 days: its rows end on the 5th, 12th…
const rows = { leadingBlanks: 2, days: Array.from({ length: 31 }) };

function shape(day: number, start: number, end: number): Shape {
  const iso = (each: number) => `2026-07-${String(each).padStart(2, '0')}`;
  return shapeOf(day - 1, iso(day), { start: iso(start), end: iso(end) }, rows);
}

const ALONE: Shape = {
  joinsPrevious: false,
  joinsNext: false,
  cutBefore: false,
  cutAfter: false,
  middle: false,
};

describe('shapeOf', () => {
  it('joins nothing in a band of one day', () => {
    expect(shape(8, 8, 8)).toEqual(ALONE);
  });

  it('joins the days of a band on one row, the days between its ends as the middle', () => {
    expect(shape(7, 7, 9)).toEqual({ ...ALONE, joinsNext: true });
    expect(shape(8, 7, 9)).toEqual({
      ...ALONE,
      joinsPrevious: true,
      joinsNext: true,
      middle: true,
    });
    expect(shape(9, 7, 9)).toEqual({ ...ALONE, joinsPrevious: true });
  });

  it('cuts a band where it wraps to the next row', () => {
    // Sunday 5 ends a row, Monday 6 starts the next one.
    expect(shape(5, 4, 7)).toEqual({ ...ALONE, joinsPrevious: true, cutAfter: true, middle: true });
    expect(shape(6, 4, 7)).toEqual({ ...ALONE, cutBefore: true, joinsNext: true, middle: true });
    expect(shape(5, 5, 6)).toEqual({ ...ALONE, cutAfter: true });
    expect(shape(6, 5, 6)).toEqual({ ...ALONE, cutBefore: true });
  });

  it('cuts a band that goes on outside the grid, before its first day and after its last', () => {
    const first = shapeOf(0, '2026-07-01', { start: '2026-06-29', end: '2026-07-02' }, rows);
    const last = shapeOf(30, '2026-07-31', { start: '2026-07-30', end: '2026-08-02' }, rows);

    // Wednesday 1 and Friday 31 are inside their rows: the cut is the month's edge.
    expect(first).toEqual({ ...ALONE, cutBefore: true, joinsNext: true, middle: true });
    expect(last).toEqual({ ...ALONE, joinsPrevious: true, cutAfter: true, middle: true });
  });
});

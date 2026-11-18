import { type DayTime, dragHours, markAt, pressHour, shiftQuarter } from './day-times';

const at = (...times: string[]): DayTime[] => times.map((time) => ({ kind: 'single', at: time }));
const range = (start: string, end: string): DayTime => ({ kind: 'range', start, end });

describe('the times of a day', () => {
  it('gain a time on the hour when a free hour is pressed', () => {
    expect(pressHour([], 18, false)).toEqual(at('18:00'));
    expect(pressHour([], 9, false)).toEqual(at('09:00'));
    expect(pressHour([], 0, false)).toEqual(at('00:00'));
  });

  it('stay in order, whatever the order of the presses', () => {
    const pressed = [18, 9, 23, 10].reduce<readonly DayTime[]>(
      (times, hour) => pressHour(times, hour, false),
      [],
    );

    expect(pressed).toEqual(at('09:00', '10:00', '18:00', '23:00'));
  });

  it('lose the time of an hour pressed again, whatever its quarter', () => {
    expect(pressHour(at('09:00', '18:30'), 18, false)).toEqual(at('09:00'));
    expect(pressHour(at('09:00', '18:30'), 9, false)).toEqual(at('18:30'));
  });

  it('gain nothing when no more can be added, and still lose a time', () => {
    const times = at('09:00');

    expect(pressHour(times, 10, true)).toBe(times);
    expect(pressHour(times, 9, true)).toEqual([]);
  });

  it('move a time by quarters within its hour', () => {
    expect(shiftQuarter(at('09:00', '18:00'), 18, 1)).toEqual(at('09:00', '18:15'));
    expect(shiftQuarter(at('18:15'), 18, 1)).toEqual(at('18:30'));
    expect(shiftQuarter(at('18:30'), 18, 1)).toEqual(at('18:45'));
    expect(shiftQuarter(at('18:45'), 18, -1)).toEqual(at('18:30'));
    expect(shiftQuarter(at('09:15', '18:15'), 9, -1)).toEqual(at('09:00', '18:15'));
  });

  it('stop a time at :00 and at :45', () => {
    const early = at('18:00');
    const late = at('18:45');

    expect(shiftQuarter(early, 18, -1)).toBe(early);
    expect(shiftQuarter(late, 18, 1)).toBe(late);
  });

  it('move nothing on an hour with no time', () => {
    const times = at('18:00');

    expect(shiftQuarter(times, 17, 1)).toBe(times);
  });

  it('say what each hour is', () => {
    const quarter: DayTime = { kind: 'single', at: '09:15' };
    const evening = range('10:30', '13:45');
    const times = [quarter, evening];

    expect(markAt(times, 8)).toEqual({ part: 'free', time: null, minutes: ':00' });
    expect(markAt(times, 9)).toEqual({ part: 'single', time: quarter, minutes: ':15' });
    expect(markAt(times, 10)).toEqual({ part: 'start', time: evening, minutes: ':30' });
    expect(markAt(times, 11)).toEqual({ part: 'between', time: evening, minutes: ':00' });
    expect(markAt(times, 12)).toEqual({ part: 'between', time: evening, minutes: ':00' });
    expect(markAt(times, 13)).toEqual({ part: 'end', time: evening, minutes: ':45' });
    expect(markAt(times, 14)).toEqual({ part: 'free', time: null, minutes: ':00' });
  });
});

describe('a time range', () => {
  it('is made by a drag from a free hour to another, in either direction', () => {
    expect(dragHours([], 10, 13, false)?.times).toEqual([range('10:00', '13:00')]);
    expect(dragHours([], 13, 10, false)?.times).toEqual([range('10:00', '13:00')]);
    expect(dragHours([], 0, 23, false)?.times).toEqual([range('00:00', '23:00')]);
  });

  it('is a time of its own while the drag is of one hour', () => {
    expect(dragHours([], 10, 10, false)?.times).toEqual(at('10:00'));
  });

  it('is said apart from the times the drag leaves', () => {
    const drag = dragHours(at('09:00'), 10, 12, false);

    expect(drag?.drawn).toEqual(range('10:00', '12:00'));
    expect(drag?.times).toContain(drag?.drawn);
  });

  it('keeps the minutes of the time it is dragged from, at that end', () => {
    expect(dragHours(at('10:30'), 10, 12, false)?.times).toEqual([range('10:30', '12:00')]);
    expect(dragHours(at('10:30'), 10, 8, false)?.times).toEqual([range('08:00', '10:30')]);
    expect(dragHours(at('10:30'), 10, 10, false)?.times).toEqual(at('10:30'));
  });

  it('takes in the times on its way and stays in order among the others', () => {
    const times = at('09:00', '10:45', '11:15', '12:00', '13:00');

    expect(dragHours(times, 10, 12, false)?.times).toEqual([
      ...at('09:00'),
      range('10:45', '12:00'),
      ...at('13:00'),
    ]);
  });

  it('stops at the hour next to another range', () => {
    const afternoon = range('14:00', '15:30');

    expect(dragHours([afternoon], 10, 17, false)?.times).toEqual([
      range('10:00', '13:00'),
      afternoon,
    ]);
    expect(dragHours([afternoon], 18, 12, false)?.times).toEqual([
      afternoon,
      range('16:00', '18:00'),
    ]);
    expect(dragHours([afternoon], 13, 23, false)?.times).toEqual([...at('13:00'), afternoon]);
  });

  it('stops at the nearest of the ranges on its way, on either side', () => {
    const times = [range('02:00', '03:00'), range('08:00', '09:00'), range('14:00', '15:00')];

    expect(dragHours(times, 11, 0, false)?.drawn).toEqual(range('10:00', '11:00'));
    expect(dragHours(times, 5, 23, false)?.drawn).toEqual(range('05:00', '07:00'));
    expect(dragHours(times, 5, 0, false)?.drawn).toEqual(range('04:00', '05:00'));
  });

  it('moves the end it is dragged from, the other end staying, each with its minutes', () => {
    const times = [range('10:15', '13:30')];

    expect(dragHours(times, 13, 15, false)?.times).toEqual([range('10:15', '15:30')]);
    expect(dragHours(times, 13, 12, false)?.times).toEqual([range('10:15', '12:30')]);
    expect(dragHours(times, 10, 8, false)?.times).toEqual([range('08:15', '13:30')]);
    expect(dragHours(times, 10, 12, false)?.times).toEqual([range('12:15', '13:30')]);
  });

  it('turns around when an end is dragged past the other, each end with its minutes', () => {
    const times = [range('10:15', '13:30')];

    expect(dragHours(times, 13, 8, false)?.times).toEqual([range('08:30', '10:15')]);
    expect(dragHours(times, 10, 15, false)?.times).toEqual([range('13:30', '15:15')]);
  });

  it('leaves a time of its own when an end is dragged onto the other, which keeps its minutes', () => {
    const times = [range('10:15', '13:30')];

    expect(dragHours(times, 13, 10, false)?.times).toEqual(at('10:15'));
    expect(dragHours(times, 10, 13, false)?.times).toEqual(at('13:30'));
  });

  it('does nothing dragged from an hour between its ends', () => {
    const times = [range('10:00', '13:00')];

    expect(dragHours(times, 11, 15, false)).toBeNull();
    expect(dragHours(times, 12, 12, false)).toBeNull();
  });

  it('is not made when it would add a time and no more can be added', () => {
    expect(dragHours(at('09:00'), 10, 12, true)).toBeNull();
    expect(dragHours(at('09:00'), 10, 10, true)).toBeNull();
  });

  it('is still made, with no more to add, from the times it takes in or the one it moves', () => {
    expect(dragHours(at('11:00'), 10, 12, true)?.times).toEqual([range('10:00', '12:00')]);
    expect(dragHours(at('10:00'), 10, 12, true)?.times).toEqual([range('10:00', '12:00')]);
    expect(dragHours([range('10:00', '12:00')], 12, 14, true)?.times).toEqual([
      range('10:00', '14:00'),
    ]);
  });

  it('is removed by a press on any of its hours, also when no more can be added', () => {
    const times = [...at('09:00'), range('10:00', '13:00')];

    for (const hour of [10, 11, 12, 13]) {
      expect(pressHour(times, hour, false)).toEqual(at('09:00'));
      expect(pressHour(times, hour, true)).toEqual(at('09:00'));
    }
  });

  it('stays in order when a time is marked after it', () => {
    const times = [range('10:00', '13:00')];

    expect(pressHour(times, 14, false)).toEqual([...times, ...at('14:00')]);
    expect(pressHour(times, 9, false)).toEqual([...at('09:00'), ...times]);
  });

  it('moves each end by quarters within its hour, and nothing from between them', () => {
    const times = [range('10:00', '13:45')];

    expect(shiftQuarter(times, 10, 1)).toEqual([range('10:15', '13:45')]);
    expect(shiftQuarter(times, 13, -1)).toEqual([range('10:00', '13:30')]);
    expect(shiftQuarter(times, 10, -1)).toBe(times);
    expect(shiftQuarter(times, 13, 1)).toBe(times);
    expect(shiftQuarter(times, 11, 1)).toBe(times);
  });
});

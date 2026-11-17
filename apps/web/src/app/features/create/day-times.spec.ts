import { type DayTime, pressHour, shiftQuarter, timeAt } from './day-times';

const at = (...times: string[]): DayTime[] => times.map((time) => ({ kind: 'single', at: time }));

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

  it('say which time an hour has', () => {
    expect(timeAt(at('09:00', '18:30'), 18)).toEqual({ kind: 'single', at: '18:30' });
    expect(timeAt(at('09:00', '18:30'), 8)).toBeUndefined();
  });
});

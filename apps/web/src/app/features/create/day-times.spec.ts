import {
  type DayTime,
  type DayTimes,
  NO_TIMES,
  type SavedEdit,
  dragHours,
  endEdit,
  markAt,
  optionsOf,
  pressHour,
  removeSavedTime,
  saveTime,
  shiftEdited,
  shiftQuarter,
  timesOf,
} from './day-times';

const at = (...times: string[]): DayTime[] => times.map((time) => ({ kind: 'single', at: time }));
const single = (time: string): DayTime => ({ kind: 'single', at: time });
const range = (start: string, end: string): DayTime => ({ kind: 'range', start, end });
const day = (marked: readonly DayTime[], saved: readonly DayTime[] = []): DayTimes => ({
  marked,
  saved,
});

describe('the times of a day', () => {
  it('gain a time on the hour when a free hour is pressed', () => {
    expect(pressHour(NO_TIMES, 18, false)).toEqual(day(at('18:00')));
    expect(pressHour(NO_TIMES, 9, false)).toEqual(day(at('09:00')));
    expect(pressHour(NO_TIMES, 0, false)).toEqual(day(at('00:00')));
  });

  it('stay in order, whatever the order of the presses', () => {
    const pressed = [18, 9, 23, 10].reduce<DayTimes>(
      (times, hour) => pressHour(times, hour, false),
      NO_TIMES,
    );

    expect(pressed).toEqual(day(at('09:00', '10:00', '18:00', '23:00')));
  });

  it('lose the time of an hour pressed again, whatever its quarter', () => {
    expect(pressHour(day(at('09:00', '18:30')), 18, false)).toEqual(day(at('09:00')));
    expect(pressHour(day(at('09:00', '18:30')), 9, false)).toEqual(day(at('18:30')));
  });

  it('gain nothing when no more can be added, and still lose a time', () => {
    const times = day(at('09:00'));

    expect(pressHour(times, 10, true)).toBe(times);
    expect(pressHour(times, 9, true)).toEqual(NO_TIMES);
  });

  it('move a time by quarters within its hour', () => {
    expect(shiftQuarter(day(at('09:00', '18:00')), 18, 1, false)).toEqual(
      day(at('09:00', '18:15')),
    );
    expect(shiftQuarter(day(at('18:15')), 18, 1, false)).toEqual(day(at('18:30')));
    expect(shiftQuarter(day(at('18:30')), 18, 1, false)).toEqual(day(at('18:45')));
    expect(shiftQuarter(day(at('18:45')), 18, -1, false)).toEqual(day(at('18:30')));
    expect(shiftQuarter(day(at('09:15', '18:15')), 9, -1, false)).toEqual(
      day(at('09:00', '18:15')),
    );
  });

  it('stop a time at :00 and at :45', () => {
    const early = day(at('18:00'));
    const late = day(at('18:45'));

    expect(shiftQuarter(early, 18, -1, false)).toBe(early);
    expect(shiftQuarter(late, 18, 1, false)).toBe(late);
  });

  it('move nothing on an hour with no time', () => {
    const times = day(at('18:00'));

    expect(shiftQuarter(times, 17, 1, false)).toBe(times);
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
    expect(dragHours(NO_TIMES, 10, 13, false)?.times).toEqual(day([range('10:00', '13:00')]));
    expect(dragHours(NO_TIMES, 13, 10, false)?.times).toEqual(day([range('10:00', '13:00')]));
    expect(dragHours(NO_TIMES, 0, 23, false)?.times).toEqual(day([range('00:00', '23:00')]));
  });

  it('is a time of its own while the drag is of one hour', () => {
    expect(dragHours(NO_TIMES, 10, 10, false)?.times).toEqual(day(at('10:00')));
  });

  it('is said apart from the times the drag leaves', () => {
    const drag = dragHours(day(at('09:00')), 10, 12, false);

    expect(drag?.drawn).toEqual(range('10:00', '12:00'));
    expect(drag?.times.marked).toContain(drag?.drawn);
  });

  it('keeps the minutes of the time it is dragged from, at that end', () => {
    expect(dragHours(day(at('10:30')), 10, 12, false)?.times).toEqual(
      day([range('10:30', '12:00')]),
    );
    expect(dragHours(day(at('10:30')), 10, 8, false)?.times).toEqual(
      day([range('08:00', '10:30')]),
    );
    expect(dragHours(day(at('10:30')), 10, 10, false)?.times).toEqual(day(at('10:30')));
  });

  it('takes in the times on its way and stays in order among the others', () => {
    const times = day(at('09:00', '10:45', '11:15', '12:00', '13:00'));

    expect(dragHours(times, 10, 12, false)?.times).toEqual(
      day([...at('09:00'), range('10:45', '12:00'), ...at('13:00')]),
    );
  });

  it('stops at the hour next to another range', () => {
    const afternoon = range('14:00', '15:30');

    expect(dragHours(day([afternoon]), 10, 17, false)?.times).toEqual(
      day([range('10:00', '13:00'), afternoon]),
    );
    expect(dragHours(day([afternoon]), 18, 12, false)?.times).toEqual(
      day([afternoon, range('16:00', '18:00')]),
    );
    expect(dragHours(day([afternoon]), 13, 23, false)?.times).toEqual(
      day([...at('13:00'), afternoon]),
    );
  });

  it('stops at the nearest of the ranges on its way, on either side', () => {
    const times = day([range('02:00', '03:00'), range('08:00', '09:00'), range('14:00', '15:00')]);

    expect(dragHours(times, 11, 0, false)?.drawn).toEqual(range('10:00', '11:00'));
    expect(dragHours(times, 5, 23, false)?.drawn).toEqual(range('05:00', '07:00'));
    expect(dragHours(times, 5, 0, false)?.drawn).toEqual(range('04:00', '05:00'));
  });

  it('moves the end it is dragged from, the other end staying, each with its minutes', () => {
    const times = day([range('10:15', '13:30')]);

    expect(dragHours(times, 13, 15, false)?.times).toEqual(day([range('10:15', '15:30')]));
    expect(dragHours(times, 13, 12, false)?.times).toEqual(day([range('10:15', '12:30')]));
    expect(dragHours(times, 10, 8, false)?.times).toEqual(day([range('08:15', '13:30')]));
    expect(dragHours(times, 10, 12, false)?.times).toEqual(day([range('12:15', '13:30')]));
  });

  it('turns around when an end is dragged past the other, each end with its minutes', () => {
    const times = day([range('10:15', '13:30')]);

    expect(dragHours(times, 13, 8, false)?.times).toEqual(day([range('08:30', '10:15')]));
    expect(dragHours(times, 10, 15, false)?.times).toEqual(day([range('13:30', '15:15')]));
  });

  it('leaves a time of its own when an end is dragged onto the other, which keeps its minutes', () => {
    const times = day([range('10:15', '13:30')]);

    expect(dragHours(times, 13, 10, false)?.times).toEqual(day(at('10:15')));
    expect(dragHours(times, 10, 13, false)?.times).toEqual(day(at('13:30')));
  });

  it('does nothing dragged from an hour between its ends', () => {
    const times = day([range('10:00', '13:00')]);

    expect(dragHours(times, 11, 15, false)).toBeNull();
    expect(dragHours(times, 12, 12, false)).toBeNull();
  });

  it('is not made when it would add a time and no more can be added', () => {
    expect(dragHours(day(at('09:00')), 10, 12, true)).toBeNull();
    expect(dragHours(day(at('09:00')), 10, 10, true)).toBeNull();
  });

  it('is still made, with no more to add, from the times it takes in or the one it moves', () => {
    expect(dragHours(day(at('11:00')), 10, 12, true)?.times).toEqual(
      day([range('10:00', '12:00')]),
    );
    expect(dragHours(day(at('10:00')), 10, 12, true)?.times).toEqual(
      day([range('10:00', '12:00')]),
    );
    expect(dragHours(day([range('10:00', '12:00')]), 12, 14, true)?.times).toEqual(
      day([range('10:00', '14:00')]),
    );
  });

  it('is removed by a press on any of its hours, also when no more can be added', () => {
    const times = day([...at('09:00'), range('10:00', '13:00')]);

    for (const hour of [10, 11, 12, 13]) {
      expect(pressHour(times, hour, false)).toEqual(day(at('09:00')));
      expect(pressHour(times, hour, true)).toEqual(day(at('09:00')));
    }
  });

  it('stays in order when a time is marked after it', () => {
    const evening = range('10:00', '13:00');
    const times = day([evening]);

    expect(pressHour(times, 14, false)).toEqual(day([evening, ...at('14:00')]));
    expect(pressHour(times, 9, false)).toEqual(day([...at('09:00'), evening]));
  });

  it('moves each end by quarters within its hour, and nothing from between them', () => {
    const times = day([range('10:00', '13:45')]);

    expect(shiftQuarter(times, 10, 1, false)).toEqual(day([range('10:15', '13:45')]));
    expect(shiftQuarter(times, 13, -1, false)).toEqual(day([range('10:00', '13:30')]));
    expect(shiftQuarter(times, 10, -1, false)).toBe(times);
    expect(shiftQuarter(times, 13, 1, false)).toBe(times);
    expect(shiftQuarter(times, 11, 1, false)).toBe(times);
  });
});

describe('a saved time', () => {
  it('is no longer marked, and is one of the saved times', () => {
    const [nine, six] = at('09:00', '18:30');
    const evening = range('20:15', '22:30');

    expect(saveTime(day([nine!, six!, evening]), six!)).toEqual(day([nine!, evening], [six!]));
    expect(saveTime(day([nine!, evening]), evening)).toEqual(day([nine!], [evening]));
  });

  it('is kept by when it starts, then by when it ends', () => {
    const marked = [range('09:00', '12:00'), ...at('13:00')];
    const saved = [...at('09:00'), range('09:00', '13:00'), range('10:00', '11:00')];

    expect(saveTime(day(marked, saved), marked[0]!).saved).toEqual([
      ...at('09:00'),
      range('09:00', '12:00'),
      range('09:00', '13:00'),
      range('10:00', '11:00'),
    ]);
    expect(saveTime(day(marked, saved), marked[1]!).saved).toEqual([...saved, ...at('13:00')]);
  });

  it('is saved once: a time like a saved one joins it', () => {
    const saved = [...at('09:15'), range('10:00', '12:30')];

    const twin = day(at('09:15'), saved);
    expect(saveTime(twin, twin.marked[0]!)).toEqual(day([], saved));
    const again = day([range('10:00', '12:30')], saved);
    expect(saveTime(again, again.marked[0]!)).toEqual(day([], saved));
  });

  it('is not saved when it is not marked on the day', () => {
    const times = day(at('09:00'));

    expect(saveTime(times, single('09:00'))).toBe(times);
  });

  it('leaves its hours free to be marked again, also as the same time', () => {
    const saved = [range('09:00', '12:00')];

    expect(pressHour(day([], saved), 10, false)).toEqual(day(at('10:00'), saved));
    expect(dragHours(day([], saved), 9, 12, false)?.times).toEqual(
      day([range('09:00', '12:00')], saved),
    );
  });

  it('is deleted, what is marked on its hours staying', () => {
    const saved = [...at('09:00'), range('09:00', '12:00')];
    const times = day(at('10:00'), saved);

    expect(removeSavedTime(times, saved[1]!)).toEqual(day(at('10:00'), at('09:00')));
    expect(removeSavedTime(times, saved[0]!)).toEqual(day(at('10:00'), [saved[1]!]));
  });
});

describe('the different times of a day', () => {
  it('are the marked and the saved in order, a time marked like a saved one once', () => {
    const marked = [...at('09:00'), range('10:00', '12:00')];
    const saved = [...at('09:00', '09:15'), range('10:00', '12:00'), range('10:00', '13:00')];

    expect(timesOf(day(marked, saved))).toEqual([
      ...at('09:00', '09:15'),
      range('10:00', '12:00'),
      range('10:00', '13:00'),
    ]);
    expect(timesOf(NO_TIMES)).toEqual([]);
  });

  it('tell a time from a range that starts with it', () => {
    expect(timesOf(day(at('09:00'), [range('09:00', '11:00')]))).toEqual([
      ...at('09:00'),
      range('09:00', '11:00'),
    ]);
  });

  it('are one option each, and a day without times is one option', () => {
    expect(optionsOf(NO_TIMES)).toBe(1);
    expect(optionsOf(day(at('09:00')))).toBe(1);
    expect(optionsOf(day([], at('09:00')))).toBe(1);
    expect(optionsOf(day(at('09:00'), at('09:00')))).toBe(1);
    expect(optionsOf(day(at('09:00', '10:00'), [range('09:00', '10:00')]))).toBe(3);
  });
});

describe('a day when no more options can be added', () => {
  it('takes its first time, which is no further option than the whole day', () => {
    expect(pressHour(NO_TIMES, 9, true)).toEqual(day(at('09:00')));
    expect(dragHours(NO_TIMES, 9, 11, true)?.times).toEqual(day([range('09:00', '11:00')]));
  });

  it('counts its saved times: a free hour is not marked', () => {
    const times = day([], at('09:00'));

    expect(pressHour(times, 10, true)).toBe(times);
    expect(dragHours(times, 10, 12, true)).toBeNull();
  });

  it('still takes a time like a saved one, which is no further option', () => {
    const saved = [...at('09:00'), range('10:00', '12:00')];

    expect(pressHour(day([], saved), 9, true)).toEqual(day(at('09:00'), saved));
    expect(dragHours(day([], saved), 10, 12, true)?.times).toEqual(
      day([range('10:00', '12:00')], saved),
    );
  });

  it('does not move a time marked like a saved one, which would be one option more', () => {
    const times = day(at('09:00'), at('09:00'));

    expect(shiftQuarter(times, 9, 1, true)).toBe(times);
    expect(shiftQuarter(times, 9, 1, false)).toEqual(day(at('09:15'), at('09:00')));
  });

  it('does not join in a range two times marked like saved ones', () => {
    const saved = at('09:00', '10:00');
    const times = day(at('09:00', '10:00', '11:00'), saved);

    expect(dragHours(times, 9, 10, true)).toBeNull();
    expect(dragHours(times, 10, 11, true)?.times).toEqual(
      day([...at('09:00'), range('10:00', '11:00')], saved),
    );
  });

  it('still saves a time and deletes a saved one', () => {
    const times = day(at('09:00'), at('10:00'));

    expect(saveTime(times, times.marked[0]!)).toEqual(day([], at('09:00', '10:00')));
    expect(removeSavedTime(times, times.saved[0]!)).toEqual(day(at('09:00')));
  });
});

describe('a saved time being edited', () => {
  it('moves by quarters within its hour, the saved times staying as they are', () => {
    const [saved] = at('18:00');
    const times = day([], [saved!]);
    const edit: SavedEdit = { saved: saved!, now: saved! };

    const later = shiftEdited(times, edit, 18, 1, false);

    expect(later).toEqual({ saved, now: single('18:15') });
    expect(shiftEdited(times, later, 18, 1, false).now).toEqual(single('18:30'));
    expect(shiftEdited(times, later, 18, -1, false).now).toEqual(saved);
  });

  it('moves each end of a range, and nothing from another hour', () => {
    const saved = range('10:00', '13:45');
    const times = day([], [saved]);
    const edit: SavedEdit = { saved, now: saved };

    expect(shiftEdited(times, edit, 10, 1, false).now).toEqual(range('10:15', '13:45'));
    expect(shiftEdited(times, edit, 13, -1, false).now).toEqual(range('10:00', '13:30'));
    expect(shiftEdited(times, edit, 11, 1, false)).toBe(edit);
    expect(shiftEdited(times, edit, 9, 1, false)).toBe(edit);
  });

  it('stops at :00 and at :45', () => {
    const saved = range('10:00', '13:45');
    const edit: SavedEdit = { saved, now: saved };

    expect(shiftEdited(day([], [saved]), edit, 10, -1, false)).toBe(edit);
    expect(shiftEdited(day([], [saved]), edit, 13, 1, false)).toBe(edit);
  });

  it('is saved as it is now when the edit ends, in its place among the others', () => {
    const saved = [...at('09:00', '10:00'), range('10:00', '12:00')];
    const times = day(at('11:00'), saved);

    expect(endEdit(times, { saved: saved[1]!, now: single('10:45') })).toEqual(
      day(at('11:00'), [...at('09:00'), range('10:00', '12:00'), ...at('10:45')]),
    );
    expect(endEdit(times, { saved: saved[2]!, now: range('10:00', '12:15') }).saved).toEqual([
      ...at('09:00', '10:00'),
      range('10:00', '12:15'),
    ]);
  });

  it('joins the saved time it has become like', () => {
    const saved = at('09:00', '09:15');
    const times = day([], saved);

    expect(endEdit(times, { saved: saved[1]!, now: single('09:00') })).toEqual(
      day([], at('09:00')),
    );
  });

  it('leaves the day as it was when it ends as it began', () => {
    const saved = at('09:00');
    const times = day([], saved);

    expect(endEdit(times, { saved: saved[0]!, now: single('09:00') })).toBe(times);
  });

  it('is not moved off the marked time it is like when no more options can be added', () => {
    const saved = at('09:00');
    const times = day(at('09:00'), saved);
    const edit: SavedEdit = { saved: saved[0]!, now: saved[0]! };

    expect(shiftEdited(times, edit, 9, 1, true)).toBe(edit);
    expect(shiftEdited(times, edit, 9, 1, false).now).toEqual(single('09:15'));
  });

  it('is moved back onto the time it left, with no more options to add', () => {
    const saved = at('09:15');
    const times = day(at('09:00'), saved);
    const moved: SavedEdit = { saved: saved[0]!, now: single('09:30') };

    expect(shiftEdited(times, moved, 9, -1, true).now).toEqual(single('09:15'));
    expect(shiftEdited(times, moved, 9, 1, true).now).toEqual(single('09:45'));
  });
});

import { NO_DATES, hasDates, pressDay, withoutDatesBefore } from './date-selection';

describe('the dates of the wizard', () => {
  it('start with none', () => {
    expect(NO_DATES).toEqual({ singles: [] });
    expect(hasDates(NO_DATES)).toBe(false);
  });

  it('gain a date of its own when a free day is pressed', () => {
    const selection = pressDay(NO_DATES, '2026-06-20');

    expect(selection).toEqual({ singles: ['2026-06-20'] });
    expect(hasDates(selection)).toBe(true);
  });

  it('keep the dates in order, whatever the order of the presses', () => {
    const pressed = ['2026-07-06', '2026-06-20', '2026-06-21', '2026-06-02'].reduce(
      pressDay,
      NO_DATES,
    );

    expect(pressed.singles).toEqual(['2026-06-02', '2026-06-20', '2026-06-21', '2026-07-06']);
  });

  it('lose a date when its day is pressed again, and only that one', () => {
    const three = ['2026-06-20', '2026-06-21', '2026-06-22'].reduce(pressDay, NO_DATES);

    expect(pressDay(three, '2026-06-21')).toEqual({ singles: ['2026-06-20', '2026-06-22'] });
    expect(pressDay(pressDay(NO_DATES, '2026-06-20'), '2026-06-20')).toEqual(NO_DATES);
  });

  it('never change the selection a press started from', () => {
    const before = pressDay(NO_DATES, '2026-06-20');

    pressDay(before, '2026-06-21');
    pressDay(before, '2026-06-20');

    expect(before).toEqual({ singles: ['2026-06-20'] });
  });

  it('lose the dates before a day, and keep that day and the later ones in order', () => {
    const marked = ['2026-06-14', '2026-06-15', '2026-06-16', '2026-07-06'].reduce(
      pressDay,
      NO_DATES,
    );

    expect(withoutDatesBefore(marked, '2026-06-16')).toEqual({
      singles: ['2026-06-16', '2026-07-06'],
    });
    expect(withoutDatesBefore(marked, '2026-07-07')).toEqual(NO_DATES);
    expect(marked.singles).toHaveLength(4);
  });

  it('stay the very same selection when no date is before the day', () => {
    const marked = ['2026-06-16', '2026-07-06'].reduce(pressDay, NO_DATES);

    expect(withoutDatesBefore(marked, '2026-06-16')).toBe(marked);
    expect(withoutDatesBefore(NO_DATES, '2026-06-16')).toBe(NO_DATES);
  });
});

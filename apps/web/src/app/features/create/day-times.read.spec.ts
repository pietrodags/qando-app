import { type DayTime, type DayTimes, NO_TIMES, withTimeRead } from './day-times';

const single = (time: string): DayTime => ({ kind: 'single', at: time });
const range = (start: string, end: string): DayTime => ({ kind: 'range', start, end });
const day = (marked: readonly DayTime[], saved: readonly DayTime[] = []): DayTimes => ({
  marked,
  saved,
});

describe('a time read from a phrase', () => {
  it('is marked on the hours of a day that are free, in its place among the marked times', () => {
    expect(withTimeRead(NO_TIMES, single('21:00'))).toEqual(day([single('21:00')]));
    expect(withTimeRead(day([single('21:00')]), single('18:30'))).toEqual(
      day([single('18:30'), single('21:00')]),
    );
    expect(withTimeRead(day([single('09:00')]), range('17:00', '19:30'))).toEqual(
      day([single('09:00'), range('17:00', '19:30')]),
    );
  });

  it('is marked beside a range whose hours it does not share, before it or after it', () => {
    const marked = day([range('17:00', '19:00')]);

    expect(withTimeRead(marked, range('20:00', '22:00'))).toEqual(
      day([range('17:00', '19:00'), range('20:00', '22:00')]),
    );
    expect(withTimeRead(marked, range('14:00', '16:45'))).toEqual(
      day([range('14:00', '16:45'), range('17:00', '19:00')]),
    );
    expect(withTimeRead(marked, single('16:45'))).toEqual(
      day([single('16:45'), range('17:00', '19:00')]),
    );
    expect(withTimeRead(marked, single('20:00'))).toEqual(
      day([range('17:00', '19:00'), single('20:00')]),
    );
  });

  it('is saved when the hour of a time of its own has one marked before', () => {
    expect(withTimeRead(day([single('18:00')]), single('18:30'))).toEqual(
      day([single('18:00')], [single('18:30')]),
    );
  });

  it('is saved when it is a range and one of its hours has a time marked before', () => {
    const read = range('17:00', '19:00');

    expect(withTimeRead(day([single('18:00')]), read)).toEqual(day([single('18:00')], [read]));
    expect(withTimeRead(day([single('17:45')]), read)).toEqual(day([single('17:45')], [read]));
    expect(withTimeRead(day([single('19:15')]), read)).toEqual(day([single('19:15')], [read]));
  });

  it('is saved when it is a range that shares an hour with a range marked before', () => {
    const marked = day([range('17:00', '19:00')]);

    expect(withTimeRead(marked, range('18:00', '20:00'))).toEqual(
      day([range('17:00', '19:00')], [range('18:00', '20:00')]),
    );
    expect(withTimeRead(marked, range('19:15', '21:00'))).toEqual(
      day([range('17:00', '19:00')], [range('19:15', '21:00')]),
    );
    expect(withTimeRead(marked, range('15:00', '17:30'))).toEqual(
      day([range('17:00', '19:00')], [range('15:00', '17:30')]),
    );
    expect(withTimeRead(marked, range('16:00', '20:00'))).toEqual(
      day([range('17:00', '19:00')], [range('16:00', '20:00')]),
    );
  });

  it('takes the hour of the range marked there, which is saved, when it is a time of its own', () => {
    const marked = day([range('17:00', '19:00'), single('21:00')]);
    const saved = [range('17:00', '19:00')];

    expect(withTimeRead(marked, single('18:15'))).toEqual(
      day([single('18:15'), single('21:00')], saved),
    );
    expect(withTimeRead(marked, single('17:30'))).toEqual(
      day([single('17:30'), single('21:00')], saved),
    );
    expect(withTimeRead(marked, single('19:45'))).toEqual(
      day([single('19:45'), single('21:00')], saved),
    );
  });

  it('joins the saved times in their order, and a range saved for it only once', () => {
    expect(withTimeRead(day([single('18:00')], [single('19:00')]), single('18:30'))).toEqual(
      day([single('18:00')], [single('18:30'), single('19:00')]),
    );
    expect(
      withTimeRead(day([range('17:00', '19:00')], [range('17:00', '19:00')]), single('18:00')),
    ).toEqual(day([single('18:00')], [range('17:00', '19:00')]));
  });

  it('changes nothing when a time like it is there, marked or saved', () => {
    const times = day([single('18:00'), range('20:00', '22:00')], [single('18:30')]);

    expect(withTimeRead(times, single('18:00'))).toBe(times);
    expect(withTimeRead(times, range('20:00', '22:00'))).toBe(times);
    expect(withTimeRead(times, single('18:30'))).toBe(times);
  });

  it('is not held when it is a range within one clock hour', () => {
    expect(withTimeRead(NO_TIMES, range('17:00', '17:45'))).toBeNull();
    expect(withTimeRead(NO_TIMES, range('17:15', '17:30'))).toBeNull();
    expect(withTimeRead(NO_TIMES, range('17:45', '18:00'))).toEqual(day([range('17:45', '18:00')]));
  });
});

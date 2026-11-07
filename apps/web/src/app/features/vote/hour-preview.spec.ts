import type { Option } from '@qando/contracts';
import { hourPreview } from './hour-preview';

function at(time: string): Option['time'] {
  return { kind: 'single', at: time };
}

function between(start: string, end: string): Option['time'] {
  return { kind: 'range', start, end };
}

describe('hourPreview', () => {
  it('lists the times of a day as the organizer wrote them, ranges with an arrow', () => {
    expect(
      hourPreview([between('09:00', '11:00'), between('10:00', '13:00'), at('18:15')]),
    ).toEqual({ items: ['09:00 → 11:00', '10:00 → 13:00', '18:15'], more: 0 });
  });

  it('shows four times and counts the rest', () => {
    const times = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00'].map(at);

    expect(hourPreview(times)).toEqual({
      items: ['09:00', '10:00', '11:00', '12:00'],
      more: 2,
    });
  });

  it('shows all four times of a day that has exactly four', () => {
    const times = ['09:00', '10:00', '11:00', '12:00'].map(at);

    expect(hourPreview(times)).toEqual({ items: ['09:00', '10:00', '11:00', '12:00'], more: 0 });
  });

  it('marks the whole day as null, for the page to name it', () => {
    expect(hourPreview([null])).toEqual({ items: [null], more: 0 });
  });

  it('lists a time only once when two options of the day share it', () => {
    // The day alone and a range of days that holds it, both at 18:15.
    expect(hourPreview([at('18:15'), at('18:15'), null, null])).toEqual({
      items: ['18:15', null],
      more: 0,
    });
  });
});

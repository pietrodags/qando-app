import { today } from './today';

describe('today', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is the date the person’s clock shows, with two digits for month and day', () => {
    vi.setSystemTime(new Date(2026, 0, 5, 0, 30));
    expect(today()).toBe('2026-01-05');
  });

  it('is still the same day one minute before midnight', () => {
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
    expect(today()).toBe('2026-12-31');
  });

  it('is the date the clocks of a time zone show, when one is given', () => {
    // 12:00 UTC: already the next day in Kiritimati (UTC+14), still the same in Pago Pago (UTC-11).
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    expect(today('Pacific/Kiritimati')).toBe('2026-11-21');
    expect(today('Pacific/Pago_Pago')).toBe('2026-11-20');
  });
});

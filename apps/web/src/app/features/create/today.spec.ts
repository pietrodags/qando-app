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
});

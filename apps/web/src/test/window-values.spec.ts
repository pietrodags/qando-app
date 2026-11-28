import { restoreWindow, setWindow } from './window-values';

describe('setWindow and restoreWindow', () => {
  afterEach(() => {
    restoreWindow();
  });

  it('sets the window’s screen and scroll, as a value or read each time', () => {
    let height = 600;
    setWindow('innerWidth', 267);
    setWindow('innerHeight', () => height);
    setWindow('scrollY', 120);

    height = 700;

    expect([window.innerWidth, window.innerHeight, window.scrollY]).toEqual([267, 700, 120]);
  });

  it('gives the window back what it had, for the spec files that run after in the same page', () => {
    const before = [window.innerWidth, window.innerHeight, window.scrollY];
    setWindow('innerWidth', 267);
    setWindow('innerWidth', 300);
    setWindow('innerHeight', () => 10);
    setWindow('scrollY', 120);

    restoreWindow();

    expect([window.innerWidth, window.innerHeight, window.scrollY]).toEqual(before);
    expect(before.every((value) => typeof value === 'number')).toBe(true);
  });
});

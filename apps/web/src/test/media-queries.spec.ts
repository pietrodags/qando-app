import { installTestScreen } from './media-queries';

describe('installTestScreen', () => {
  it('answers the queries it was given, and no other', () => {
    installTestScreen({ '(min-width: 650px)': true, '(pointer: coarse)': false });

    expect(window.matchMedia('(min-width: 650px)').matches).toBe(true);
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
    expect(window.matchMedia('(min-width: 650px)').media).toBe('(min-width: 650px)');
  });

  it('tells the lists of a query when its answer changes, and only then', () => {
    const screen = installTestScreen();
    const wide = window.matchMedia('(min-width: 650px)');
    const touch = window.matchMedia('(pointer: coarse)');
    const heard: string[] = [];
    wide.addEventListener('change', (event) => heard.push(`listener ${String(event.matches)}`));
    wide.onchange = (event) => heard.push(`onchange ${String(event.matches)}`);
    touch.addEventListener('change', () => heard.push('touch'));

    screen.set('(min-width: 650px)', false);
    screen.set('(min-width: 650px)', true);

    expect(wide.matches).toBe(true);
    expect(heard).toEqual(['onchange true', 'listener true']);
  });

  it('stops telling a listener once it is removed', () => {
    const screen = installTestScreen();
    const wide = window.matchMedia('(min-width: 650px)');
    const heard: boolean[] = [];
    const listener = (event: MediaQueryListEvent): void => {
      heard.push(event.matches);
    };
    wide.addEventListener('change', listener);
    screen.set('(min-width: 650px)', true);
    wide.removeEventListener('change', listener);
    screen.set('(min-width: 650px)', false);

    expect(heard).toEqual([true]);
  });
});

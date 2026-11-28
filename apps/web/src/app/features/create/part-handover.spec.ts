import { DestroyRef, EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PartHandover } from './part-handover';

describe('PartHandover', () => {
  const root = document.documentElement;
  let handover: PartHandover;

  /** The page scrolled `scrollY` px down a screen 800 px tall. */
  function scrolled(scrollY: number): void {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: scrollY });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PartHandover] });
    handover = TestBed.inject(PartHandover);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    scrolled(120);
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'scrollY');
    Reflect.deleteProperty(window, 'innerHeight');
    root.style.removeProperty('min-block-size');
  });

  /** A part on the page, until `end`. */
  function part(): { readonly ref: DestroyRef; readonly end: () => void } {
    const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    return {
      ref: injector.get(DestroyRef),
      end: () => {
        injector.destroy();
      },
    };
  }

  const kept = (): string => root.style.getPropertyValue('min-block-size');

  it('keeps the page as tall as was seen of it when a part gave way, while the one that took its place is there', () => {
    handover.leave();
    const summary = part();

    handover.arrive(summary.ref);
    expect(kept()).toBe('920px');

    summary.end();
    expect(kept()).toBe('');
  });

  it('keeps nothing for a part that comes from another step, also after one took what was left', () => {
    handover.arrive(part().ref);
    expect(kept()).toBe('');

    handover.leave();
    handover.arrive(part().ref);
    root.style.removeProperty('min-block-size');
    handover.arrive(part().ref);

    expect(kept()).toBe('');
  });

  it('leaves the page as the last part that came in kept it when an earlier one goes', () => {
    handover.leave();
    const summary = part();
    handover.arrive(summary.ref);
    scrolled(300);
    handover.leave();
    handover.arrive(part().ref);

    summary.end();

    expect(kept()).toBe('1100px');
  });
});

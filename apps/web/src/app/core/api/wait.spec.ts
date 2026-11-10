import { ApplicationRef, Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { secondsUntil } from './wait';

describe('secondsUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function follow(initial: number | null) {
    const until = signal(initial);
    const seconds = runInInjectionContext(TestBed.inject(Injector), () =>
      secondsUntil(() => until()),
    );
    return { until, seconds };
  }

  /** Lets the timers run and the effects that follow them. */
  function pass(ms: number): void {
    vi.advanceTimersByTime(ms);
    TestBed.inject(ApplicationRef).tick();
  }

  it('is 0 without a time to wait for', () => {
    expect(follow(null).seconds()).toBe(0);
  });

  it('counts the whole seconds left down, each second', () => {
    const { seconds } = follow(Date.now() + 30_000);
    pass(0);

    expect(seconds()).toBe(30);
    pass(1000);
    expect(seconds()).toBe(29);
    pass(500);
    expect(seconds()).toBe(29);
    pass(500);
    expect(seconds()).toBe(28);
  });

  it('rounds a part of a second up: 0 only once the time has come', () => {
    const { seconds } = follow(Date.now() + 1500);
    pass(0);

    expect(seconds()).toBe(2);
    pass(1000);
    expect(seconds()).toBe(1);
    pass(1000);
    expect(seconds()).toBe(0);
  });

  it('stays at 0 after the time, and for a time already past', () => {
    const { seconds } = follow(Date.now() + 2000);
    pass(60_000);

    expect(seconds()).toBe(0);
    expect(follow(Date.now() - 5000).seconds()).toBe(0);
  });

  it('reads the clock, so a tab whose timers were held back still shows the time left', () => {
    const { seconds } = follow(Date.now() + 30_000);
    pass(0);

    vi.setSystemTime(Date.now() + 20_000);
    pass(1000);

    expect(seconds()).toBe(9);
  });

  it('stops its timer once the time has come', () => {
    follow(Date.now() + 2000);
    pass(0);
    expect(vi.getTimerCount()).toBe(1);

    pass(2000);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts again with a new time', () => {
    const { until, seconds } = follow(Date.now() + 2000);
    pass(5000);

    until.set(Date.now() + 10_000);
    pass(0);

    expect(seconds()).toBe(10);
    pass(1000);
    expect(seconds()).toBe(9);
  });

  it('counts a time given long after it was created from the clock, at once', () => {
    const { until, seconds } = follow(null);
    pass(0);
    vi.setSystemTime(Date.now() + 20_000);

    until.set(Date.now() + 10_000);

    // Read before any effect or timer ran.
    expect(seconds()).toBe(10);
  });

  it('stops counting when the time is taken away', () => {
    const { until, seconds } = follow(Date.now() + 10_000);
    pass(0);

    until.set(null);
    pass(0);

    expect(seconds()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

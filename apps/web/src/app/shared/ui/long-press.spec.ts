import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { HOLD_MS, LongPress } from './long-press';

@Component({
  imports: [LongPress],
  template: `<button
    type="button"
    appLongPress
    (longPress)="presses.update((n) => n + 1)"
    (click)="clicks.update((n) => n + 1)"
  >
    6
  </button>`,
})
class Host {
  readonly presses = signal(0);
  readonly clicks = signal(0);
}

describe('LongPress', () => {
  let fixture: ComponentFixture<Host>;
  let button: HTMLButtonElement;
  let vibrations: number[];

  beforeEach(() => {
    vi.useFakeTimers();
    vibrations = [];
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (ms: number) => vibrations.push(ms) > 0,
    });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function pointer(type: string, init: { pointerType?: string; x?: number; y?: number } = {}) {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: init.x ?? 0,
      clientY: init.y ?? 0,
    });
    Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'touch' });
    button.dispatchEvent(event);
    fixture.detectChanges();
  }

  function holdFor(ms: number, pointerType = 'touch') {
    pointer('pointerdown', { pointerType });
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  it('fires once a finger rests on the element for the whole hold, and vibrates', () => {
    holdFor(HOLD_MS);

    expect(fixture.componentInstance.presses()).toBe(1);
    expect(vibrations).toHaveLength(1);
  });

  it('does not fire when the finger lifts before the hold completes: that is a tap', () => {
    holdFor(HOLD_MS - 1);
    pointer('pointerup');
    vi.advanceTimersByTime(HOLD_MS);
    button.click();

    expect(fixture.componentInstance.presses()).toBe(0);
    expect(fixture.componentInstance.clicks()).toBe(1);
  });

  it('swallows the click that follows a long-press, so the tap action does not run too', () => {
    holdFor(HOLD_MS);
    pointer('pointerup');
    button.click();
    button.click();

    expect(fixture.componentInstance.clicks()).toBe(1);
  });

  it('lets the next tap through when the browser sent no click after the long-press', () => {
    holdFor(HOLD_MS);
    pointer('pointerup');
    pointer('pointerdown');
    pointer('pointerup');
    button.click();

    expect(fixture.componentInstance.clicks()).toBe(1);
  });

  it('is cancelled when the finger moves away, as when scrolling', () => {
    pointer('pointerdown', { x: 100, y: 100 });
    pointer('pointermove', { x: 104, y: 103 });
    pointer('pointermove', { x: 100, y: 112 });
    vi.advanceTimersByTime(HOLD_MS);

    expect(fixture.componentInstance.presses()).toBe(0);
  });

  it('keeps going when the finger only trembles', () => {
    pointer('pointerdown', { x: 100, y: 100 });
    pointer('pointermove', { x: 106, y: 106 });
    vi.advanceTimersByTime(HOLD_MS);

    expect(fixture.componentInstance.presses()).toBe(1);
  });

  it('is cancelled when the browser takes the gesture over', () => {
    pointer('pointerdown');
    pointer('pointercancel');
    vi.advanceTimersByTime(HOLD_MS);

    expect(fixture.componentInstance.presses()).toBe(0);
  });

  it('ignores the mouse, which has the double-click', () => {
    holdFor(HOLD_MS, 'mouse');

    expect(fixture.componentInstance.presses()).toBe(0);
  });

  it('marks the element while the finger rests, for the filling ring, and gives it the hold time', () => {
    pointer('pointerdown');

    expect(button.classList).toContain('holding');
    expect(button.style.getPropertyValue('--hold-duration')).toBe(`${String(HOLD_MS)}ms`);

    vi.advanceTimersByTime(HOLD_MS);
    fixture.detectChanges();
    expect(button.classList).not.toContain('holding');
  });

  it('stops marking the element when the finger lifts early', () => {
    pointer('pointerdown');
    pointer('pointerup');

    expect(button.classList).not.toContain('holding');
  });

  it('keeps the browser menu of a long touch away', () => {
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    button.dispatchEvent(menu);

    expect(menu.defaultPrevented).toBe(true);
  });

  it('fires without vibrating where the browser cannot vibrate', () => {
    Reflect.deleteProperty(navigator, 'vibrate');

    holdFor(HOLD_MS);

    expect(fixture.componentInstance.presses()).toBe(1);
  });
  it('is not marked before any touch', () => {
    expect(button.classList).not.toContain('holding');
  });

  it('cancels the browser action of the swallowed click', () => {
    holdFor(HOLD_MS);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });

    button.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
  });

  it('starts over when a second touch begins, so it never fires twice', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(HOLD_MS - 100);
    pointer('pointerdown');
    vi.advanceTimersByTime(100);

    expect(fixture.componentInstance.presses()).toBe(0);

    vi.advanceTimersByTime(HOLD_MS);
    expect(fixture.componentInstance.presses()).toBe(1);
  });

  it('keeps going when the finger moves exactly the tolerance', () => {
    pointer('pointerdown', { x: 100, y: 100 });
    pointer('pointermove', { x: 110, y: 100 });
    vi.advanceTimersByTime(HOLD_MS);

    expect(fixture.componentInstance.presses()).toBe(1);
  });

  it('stops when the element goes away: no late press, no click swallowed', () => {
    holdFor(HOLD_MS);
    pointer('pointerdown');
    fixture.destroy();
    vi.advanceTimersByTime(HOLD_MS);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(click);

    expect(fixture.componentInstance.presses()).toBe(1);
    expect(click.defaultPrevented).toBe(false);
  });
});

import { DestroyRef, Directive, ElementRef, inject, output, signal } from '@angular/core';

/** How long a finger rests on the element before the long-press fires. */
export const HOLD_MS = 500;

/** A short buzz confirms the long-press where the browser can vibrate (not on iPhone). */
const VIBRATION_MS = 30;

/** A finger that moves farther than this is scrolling, not pressing. */
const MOVE_TOLERANCE_PX = 10;

/**
 * A long-press for touch screens (finger or pen; the mouse has the double-click): `longPress`
 * fires once the finger has rested `HOLD_MS` on the element, with a short vibration, and the click
 * the browser sends when the finger lifts is swallowed. Lifting earlier is an ordinary tap;
 * moving the finger (scrolling) cancels. While the finger rests, the element has the class
 * `holding` and `--hold-duration`, so its stylesheet can draw progress; the browser's own
 * long-touch menu is kept away.
 */
@Directive({
  selector: '[appLongPress]',
  host: {
    '[class.holding]': 'holding()',
    '[style.--hold-duration]': 'holdDuration',
    '(pointerdown)': 'start($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'cancel()',
    '(pointercancel)': 'cancel()',
    '(pointerleave)': 'cancel()',
    '(contextmenu)': '$event.preventDefault()',
  },
})
export class LongPress {
  readonly longPress = output();

  protected readonly holding = signal(false);
  protected readonly holdDuration = `${String(HOLD_MS)}ms`;

  private timer: ReturnType<typeof setTimeout> | undefined;
  private origin = { x: 0, y: 0 };
  private swallowNextClick = false;

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    // Capturing runs before the element's own click listeners, so the tap action never sees it.
    const onClick = (event: Event) => {
      if (!this.swallowNextClick) return;
      this.swallowNextClick = false;
      event.stopImmediatePropagation();
      event.preventDefault();
    };
    element.addEventListener('click', onClick, { capture: true });
    inject(DestroyRef).onDestroy(() => {
      element.removeEventListener('click', onClick, { capture: true });
      this.cancel();
    });
  }

  protected start(event: PointerEvent): void {
    // Some browsers send no click after a long-press: a new touch must not lose its own.
    this.swallowNextClick = false;
    if (event.pointerType === 'mouse') return;
    this.cancel();
    this.origin = { x: event.clientX, y: event.clientY };
    this.holding.set(true);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.holding.set(false);
      this.swallowNextClick = true;
      // Typed as always there, but Safari has no vibration.
      if ('vibrate' in navigator) navigator.vibrate(VIBRATION_MS);
      this.longPress.emit();
    }, HOLD_MS);
  }

  protected move(event: PointerEvent): void {
    const distance = Math.hypot(event.clientX - this.origin.x, event.clientY - this.origin.y);
    if (distance > MOVE_TOLERANCE_PX) this.cancel();
  }

  protected cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.holding.set(false);
  }
}

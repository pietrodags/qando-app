import { DestroyRef, Directive, inject, output } from '@angular/core';

/** How long a pointer is held before the action begins to repeat. */
export const REPEAT_DELAY_MS = 400;

/** How often the action repeats from then on. */
export const REPEAT_EVERY_MS = 200;

/**
 * A button whose action repeats while it is held: `appHoldRepeat` fires as soon as a pointer
 * presses the element, again after `REPEAT_DELAY_MS` and then every `REPEAT_EVERY_MS` until the
 * pointer lifts, leaves the element or the window loses the focus. Pressed with the keyboard, or
 * by assistive technology, it fires once per press. The element needs no click handler of its own.
 */
@Directive({
  selector: '[appHoldRepeat]',
  host: {
    '(pointerdown)': 'start($event)',
    '(pointerup)': 'stop()',
    '(pointercancel)': 'stop()',
    '(pointerleave)': 'stop()',
    '(window:blur)': 'stop()',
    '(click)': 'clicked($event)',
  },
})
export class HoldRepeat {
  readonly appHoldRepeat = output();

  private delay: ReturnType<typeof setTimeout> | undefined;
  private repeat: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stop();
    });
  }

  protected start(event: PointerEvent): void {
    this.stop();
    if (event.button !== 0) return;
    this.appHoldRepeat.emit();
    this.delay = setTimeout(() => {
      this.appHoldRepeat.emit();
      this.repeat = setInterval(() => {
        this.appHoldRepeat.emit();
      }, REPEAT_EVERY_MS);
    }, REPEAT_DELAY_MS);
  }

  protected stop(): void {
    clearTimeout(this.delay);
    clearInterval(this.repeat);
  }

  /** A click made by a pointer counts its presses; the pointer's press has fired already. */
  protected clicked(event: MouseEvent): void {
    if (event.detail === 0) this.appHoldRepeat.emit();
  }
}

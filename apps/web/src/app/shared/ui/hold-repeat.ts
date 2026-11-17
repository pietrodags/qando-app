import { DestroyRef, Directive, inject, input, output } from '@angular/core';

/** How long a pointer is held before the action begins to repeat. */
export const REPEAT_DELAY_MS = 400;

/** How often the action repeats from then on. */
export const REPEAT_EVERY_MS = 200;

/**
 * A button whose action repeats while it is held: `appHoldRepeat` fires as soon as a pointer
 * presses the element, again after `REPEAT_DELAY_MS` and then every `REPEAT_EVERY_MS` until the
 * pointer lifts, leaves the element or the window loses the focus. Pressed with the keyboard, or
 * by assistive technology, it fires once per press. The element needs no click handler of its own.
 *
 * While `repeating` is false the element is a plain button, which fires once when a press ends on
 * it: for an action that must not run before the pointer lifts, such as leaving the page. A hold
 * under way ends there, and its press does not fire again when it lifts.
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
  /** Whether a press fires at once and repeats while held, or only when it ends. */
  readonly repeating = input(true);

  /** The pointer's press under way has fired already, so the click that ends it does not count. */
  private fired = false;
  private delay: ReturnType<typeof setTimeout> | undefined;
  private repeat: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stop();
    });
  }

  protected start(event: PointerEvent): void {
    this.stop();
    this.fired = false;
    if (event.button !== 0 || !this.repeating()) return;
    this.fired = true;
    this.appHoldRepeat.emit();
    this.delay = setTimeout(() => {
      this.repeat = setInterval(() => {
        this.again();
      }, REPEAT_EVERY_MS);
      this.again();
    }, REPEAT_DELAY_MS);
  }

  private again(): void {
    if (this.repeating()) this.appHoldRepeat.emit();
    else this.stop();
  }

  protected stop(): void {
    clearTimeout(this.delay);
    clearInterval(this.repeat);
  }

  /** A click made by a pointer counts its presses (0 without one): its press may have fired. */
  protected clicked(event: MouseEvent): void {
    if (event.detail === 0 || !this.fired) this.appHoldRepeat.emit();
  }
}

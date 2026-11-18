import { Directive, output } from '@angular/core';

/** A finger must move farther than this from where it was put down for its way to be known. */
const START_PX = 10;

/**
 * A finger's slide sideways over the element (a mouse does not slide). It begins once the finger
 * has moved more than 10 px from where it was put down, more sideways than up or down: `sliding`
 * fires then and on each move, with how far sideways the finger is from where it was put down,
 * in pixels, less than nothing to the left; `slid` fires when it lifts, with where it was. A
 * finger that goes up or down first is the browser's, to scroll with, wherever it goes later, as
 * is the pinch of two; a touch whose move something inside the element has kept from the browser
 * (a drag of its own) is left alone until it ends. While the finger slides the page does not
 * move with it. A slide the browser takes away, or that a second finger joins, ends with `slid`
 * as 0: back where it began.
 */
@Directive({
  selector: '[appSideSlide]',
  host: {
    '[style.touch-action]': '"pan-y pinch-zoom"',
    '(touchstart)': 'putDown($event)',
    '(touchmove)': 'moved($event)',
    '(touchend)': 'lifted()',
    '(touchcancel)': 'giveUp()',
  },
})
export class SideSlide {
  /** The slide as it goes: how far sideways the finger is from where it was put down. */
  readonly sliding = output<number>();
  /** The slide ends: where the finger lifted, or 0 when the slide is given up. */
  readonly slid = output<number>();

  private finger: Finger | null = null;

  protected putDown(event: TouchEvent): void {
    this.giveUp();
    const [touch] = event.touches;
    if (event.touches.length !== 1 || !touch) return;
    this.finger = { x: touch.clientX, y: touch.clientY, by: 0, sliding: false };
  }

  protected moved(event: TouchEvent): void {
    // A second finger may land outside the element, where its touchstart is never heard: the
    // first finger's move still counts every finger on the screen.
    if (event.touches.length !== 1) {
      this.giveUp();
      return;
    }
    const finger = this.finger;
    const [touch] = event.touches;
    if (!finger || !touch) return;
    const across = touch.clientX - finger.x;
    const down = touch.clientY - finger.y;
    if (!finger.sliding) {
      if (event.defaultPrevented) {
        this.finger = null;
        return;
      }
      if (Math.hypot(across, down) <= START_PX) return;
      if (Math.abs(across) <= Math.abs(down)) {
        this.finger = null;
        return;
      }
      finger.sliding = true;
    }
    event.preventDefault();
    finger.by = across;
    this.sliding.emit(across);
  }

  protected lifted(): void {
    const finger = this.finger;
    this.finger = null;
    if (finger?.sliding) this.slid.emit(finger.by);
  }

  protected giveUp(): void {
    const sliding = this.finger?.sliding === true;
    this.finger = null;
    if (sliding) this.slid.emit(0);
  }
}

/** A finger on the element, until it lifts: where it was put down, and its slide once it has one. */
interface Finger {
  readonly x: number;
  readonly y: number;
  /** How far sideways it is from where it was put down. */
  by: number;
  sliding: boolean;
}

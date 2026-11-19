import { Directive, output } from '@angular/core';

/** A finger must move farther than this from where it was put down for its way to be known. */
const START_PX = 10;

/** A finger lifted faster than this sideways, in pixels each millisecond, is flung. */
const FLING_PX_PER_MS = 0.4;

/** How long before the lift the finger's moves tell how fast it lifted. */
const FLING_WINDOW_MS = 100;

/** A slide ends: where the finger lifted, and the way it was flung, if it lifted moving fast. */
export interface SlideEnd {
  /** How far sideways the finger lifted from where it was put down; 0 when given up. */
  readonly by: number;
  /**
   * The way the finger was moving fast sideways when it lifted, over its last 100 ms: `-1` to the
   * left, `1` to the right, `0` when it was not (or the slide was given up).
   */
  readonly flung: -1 | 0 | 1;
}

/**
 * A finger's slide sideways over the element (a mouse does not slide). It begins once the finger
 * has moved more than 10 px from where it was put down, more sideways than up or down: `sliding`
 * fires then and on each move, with how far sideways the finger is from where it was put down,
 * in pixels, less than nothing to the left; `slid` fires when it lifts, with where it was and
 * whether it was flung: moving faster than 0.4 px each millisecond over its last 100 ms. A
 * finger that goes up or down first is the browser's, to scroll with, wherever it goes later, as
 * is the pinch of two; a touch whose move something inside the element has kept from the browser
 * (a drag of its own) is left alone until it ends. While the finger slides the page does not
 * move with it. A slide the browser takes away, or that a second finger joins, ends with `slid`
 * at 0, not flung: back where it began.
 */
@Directive({
  selector: '[appSideSlide]',
  host: {
    '[style.touch-action]': '"pan-y pinch-zoom"',
    '(touchstart)': 'putDown($event)',
    '(touchmove)': 'moved($event)',
    '(touchend)': 'lifted($event)',
    '(touchcancel)': 'giveUp()',
  },
})
export class SideSlide {
  /** The slide as it goes: how far sideways the finger is from where it was put down. */
  readonly sliding = output<number>();
  /** The slide ends: where the finger lifted and how, or back at 0 when it is given up. */
  readonly slid = output<SlideEnd>();

  private finger: Finger | null = null;

  protected putDown(event: TouchEvent): void {
    this.giveUp();
    const [touch] = event.touches;
    if (event.touches.length !== 1 || !touch) return;
    this.finger = { x: touch.clientX, y: touch.clientY, by: 0, sliding: false, moves: [] };
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
    finger.moves.push({ x: touch.clientX, at: event.timeStamp });
    this.sliding.emit(across);
  }

  protected lifted(event: TouchEvent): void {
    const finger = this.finger;
    this.finger = null;
    if (finger?.sliding)
      this.slid.emit({ by: finger.by, flung: flungWay(finger, event.timeStamp) });
  }

  protected giveUp(): void {
    const sliding = this.finger?.sliding === true;
    this.finger = null;
    if (sliding) this.slid.emit({ by: 0, flung: 0 });
  }
}

/**
 * The way a finger lifted at `liftedAt` was moving fast sideways: from its first move of the last
 * 100 ms to where it lifted, over the time to the lift, so that a finger that slows or stops
 * before it lifts is less fast.
 */
function flungWay(finger: Finger, liftedAt: number): -1 | 0 | 1 {
  const first = finger.moves.find(({ at }) => at >= liftedAt - FLING_WINDOW_MS);
  const last = finger.moves.at(-1);
  if (!first || !last) return 0;
  const speed = (last.x - first.x) / (liftedAt - first.at);
  if (Math.abs(speed) <= FLING_PX_PER_MS) return 0;
  return speed < 0 ? -1 : 1;
}

/** A finger on the element, until it lifts: where it was put down, and its slide once it has one. */
interface Finger {
  readonly x: number;
  readonly y: number;
  /** How far sideways it is from where it was put down. */
  by: number;
  sliding: boolean;
  /** Its moves while it slides: where it was, sideways, and when, in milliseconds. */
  readonly moves: { readonly x: number; readonly at: number }[];
}

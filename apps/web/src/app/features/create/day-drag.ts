import { DOCUMENT, DestroyRef, Directive, ElementRef, inject, output } from '@angular/core';

/** A mouse must move farther than this from where it was pressed for a drag to begin. */
const START_PX = 8;

/** How near a side of the element, or beyond it, the pointer counts as resting at that side. */
const SIDE_PX = 10;

/** How long the pointer rests at a side before `sideHeld` fires. */
export const SIDE_HOLD_MS = 300;

/** A drag between two days, as their `data-date`: the day pressed and the day the pointer is on. */
export interface DayDragSpan {
  readonly from: string;
  readonly to: string;
}

/**
 * A drag over the days inside the element, each a descendant with a `data-date`. A mouse begins
 * it by pressing a day and moving away; a finger or a pen, which scroll the page when they move,
 * by resting on the day pressed: the element's user tells when with `rested()`. `dragging` fires
 * when the drag begins and each time the pointer gets to another day, and `dropped` when it is
 * released, wherever it is; the click the browser sends after it is swallowed. A press that
 * neither moves nor rests stays an ordinary click or tap. While the pointer rests off the days at
 * a side of the element, or beyond it, `sideHeld` fires once: the days can change under a drag
 * (another month) and it goes on. The page does not scroll under a finger's drag. A drag whose
 * release never arrives, or that the browser cancels, ends with `dragging` as `null`.
 */
@Directive({
  selector: '[appDayDrag]',
  exportAs: 'appDayDrag',
  host: { '(pointerdown)': 'pressed($event)' },
})
export class DayDrag {
  /** The drag as it goes on; `null` when it is given up without a release. */
  readonly dragging = output<DayDragSpan | null>();
  /** The pointer is released: the drag ends on the last day it was on. */
  readonly dropped = output<DayDragSpan>();
  /** During a drag the pointer rested at the element's start side (`-1`) or end side (`1`). */
  readonly sideHeld = output<-1 | 1>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);

  private press: Press | null = null;
  private side: -1 | 0 | 1 = 0;
  private sideTimer: ReturnType<typeof setTimeout> | undefined;
  private swallowClick = false;

  constructor() {
    // Capturing runs before the days' own click listeners.
    const onClick = (event: Event) => {
      if (!this.swallowClick) return;
      this.swallowClick = false;
      event.stopImmediatePropagation();
      event.preventDefault();
    };
    this.host.addEventListener('click', onClick, { capture: true });
    // Always there: Safari lets a touch be kept from scrolling only where a listener that can
    // was waiting before the touch began.
    this.host.addEventListener('touchmove', this.keepStill, { passive: false });
    inject(DestroyRef).onDestroy(() => {
      this.host.removeEventListener('click', onClick, { capture: true });
      this.host.removeEventListener('touchmove', this.keepStill);
      this.end();
    });
  }

  /**
   * The pointer pressed on a day has rested on it long enough: its drag begins there, without
   * moving. Nothing happens with no day pressed, or during a drag.
   */
  rested(): void {
    const press = this.press;
    if (!press || press.dragging) return;
    // A finger's events stay with the day it pressed, which leaves the page when the days
    // change: from here they come to the element.
    this.host.setPointerCapture(press.pointerId);
    this.reach(press, press.from);
  }

  protected pressed(event: PointerEvent): void {
    // During a drag, another finger on the days is not followed.
    if (this.press?.dragging && event.pointerId !== this.press.pointerId) return;
    this.giveUp();
    const from = this.dayAt(event);
    if (event.button !== 0 || from === null || !event.target) return;
    this.press = {
      pointerId: event.pointerId,
      mouse: event.pointerType === 'mouse',
      target: event.target,
      from,
      to: from,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    // A touch's own events reach only the element it began on once that has left the page.
    event.target.addEventListener('touchmove', this.keepStill, { passive: false });
    // On the document: the pointer leaves the element during a drag, and is released anywhere.
    this.document.addEventListener('pointermove', this.moved);
    this.document.addEventListener('pointerup', this.released);
    this.document.addEventListener('pointercancel', this.cancelled);
  }

  private readonly moved = (event: PointerEvent): void => {
    const press = this.press;
    if (press?.pointerId !== event.pointerId) return;
    // The primary button, or a finger's contact, is the first bit: no longer down, the release
    // was lost on the way.
    if (event.buttons % 2 === 0) {
      this.giveUp();
      return;
    }
    if (!press.dragging) {
      const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      // A finger that moves before it has rested is scrolling the page.
      if (!press.mouse || distance <= START_PX) return;
    }
    const over = this.dayAt(event);
    const to = over ?? press.to;
    if (!press.dragging || to !== press.to) this.reach(press, to);
    this.restAt(over === null ? this.sideAt(event.clientX) : 0);
  };

  private readonly released = (event: PointerEvent): void => {
    const press = this.press;
    if (press?.pointerId !== event.pointerId) return;
    this.end();
    if (!press.dragging) return;
    // The click that follows the release is the drag's own; without one, the next is not.
    this.swallowClick = true;
    setTimeout(() => (this.swallowClick = false));
    this.dropped.emit({ from: press.from, to: press.to });
  };

  /** The browser takes the pointer away: a finger's, when the page scrolls after all. */
  private readonly cancelled = (event: PointerEvent): void => {
    if (this.press?.pointerId === event.pointerId) this.giveUp();
  };

  /** The page does not scroll under a drag. */
  private readonly keepStill = (event: Event): void => {
    if (this.press?.dragging) event.preventDefault();
  };

  /** The drag begins, or gets to another day. */
  private reach(press: Press, to: string): void {
    press.dragging = true;
    press.to = to;
    this.dragging.emit({ from: press.from, to });
  }

  private giveUp(): void {
    const dragging = this.press?.dragging === true;
    this.end();
    if (dragging) this.dragging.emit(null);
  }

  /**
   * The day under the pointer: its `data-date`, or `null` off the element's days. Not from the
   * event's target, which for a finger stays the day it pressed.
   */
  private dayAt(event: PointerEvent): string | null {
    const day = this.document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-date]');
    return day && this.host.contains(day) ? day.getAttribute('data-date') : null;
  }

  private sideAt(x: number): -1 | 0 | 1 {
    const { left, right } = this.host.getBoundingClientRect();
    if (x <= left + SIDE_PX) return -1;
    return x >= right - SIDE_PX ? 1 : 0;
  }

  /** The pointer is at a side (or at none): the side's wait starts when it gets there. */
  private restAt(side: -1 | 0 | 1): void {
    if (side === this.side) return;
    this.side = side;
    clearTimeout(this.sideTimer);
    if (side !== 0) {
      this.sideTimer = setTimeout(() => {
        this.sideHeld.emit(side);
      }, SIDE_HOLD_MS);
    }
  }

  private end(): void {
    this.press?.target.removeEventListener('touchmove', this.keepStill);
    this.press = null;
    this.restAt(0);
    this.document.removeEventListener('pointermove', this.moved);
    this.document.removeEventListener('pointerup', this.released);
    this.document.removeEventListener('pointercancel', this.cancelled);
  }
}

/** A pointer down on a day, until it is released: a drag once it has moved away or rested. */
interface Press {
  readonly pointerId: number;
  readonly mouse: boolean;
  /** The element pressed: a touch's own events are its for as long as the touch lasts. */
  readonly target: EventTarget;
  readonly from: string;
  to: string;
  readonly x: number;
  readonly y: number;
  dragging: boolean;
}

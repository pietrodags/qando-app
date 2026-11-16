import { DOCUMENT, DestroyRef, Directive, ElementRef, inject, output } from '@angular/core';

/** The mouse must move farther than this from where it was pressed for a drag to begin. */
const START_PX = 8;

/** How near a side of the element, or beyond it, the mouse counts as resting at that side. */
const SIDE_PX = 10;

/** How long the mouse rests at a side before `sideHeld` fires. */
export const SIDE_HOLD_MS = 300;

/** A drag between two days, as their `data-date`: the day pressed and the day the mouse is on. */
export interface DayDragSpan {
  readonly from: string;
  readonly to: string;
}

/**
 * A mouse drag over the days inside the element, each a descendant with a `data-date`. Pressing
 * a day and moving the mouse away begins the drag: `dragging` fires then and each time the mouse
 * gets to another day, and `dropped` when the button is released, wherever it is; the click the
 * browser sends after it is swallowed. A press that does not move stays an ordinary click. While
 * the mouse rests off the days at a side of the element, or beyond it, `sideHeld` fires once: the
 * days can change under a drag (another month) and it goes on. A drag whose release never
 * arrives ends with `dragging` as `null`. Fingers and pens do not drag: they scroll the page.
 */
@Directive({
  selector: '[appDayDrag]',
  host: { '(pointerdown)': 'pressed($event)' },
})
export class DayDrag {
  /** The drag as it goes on; `null` when it is given up without a release. */
  readonly dragging = output<DayDragSpan | null>();
  /** The button is released: the drag ends on the last day the mouse was on. */
  readonly dropped = output<DayDragSpan>();
  /** During a drag the mouse rested at the element's start side (`-1`) or end side (`1`). */
  readonly sideHeld = output<-1 | 1>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);

  private press: { from: string; to: string; x: number; y: number; dragging: boolean } | null =
    null;
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
    inject(DestroyRef).onDestroy(() => {
      this.host.removeEventListener('click', onClick, { capture: true });
      this.end();
    });
  }

  protected pressed(event: PointerEvent): void {
    this.end();
    const from = this.dayAt(event);
    if (event.pointerType !== 'mouse' || event.button !== 0 || from === null) return;
    this.press = { from, to: from, x: event.clientX, y: event.clientY, dragging: false };
    // On the document: the mouse leaves the element during a drag, and is released anywhere.
    this.document.addEventListener('pointermove', this.moved);
    this.document.addEventListener('pointerup', this.released);
    this.document.addEventListener('pointercancel', this.givenUp);
  }

  private readonly moved = (event: PointerEvent): void => {
    const press = this.press;
    if (!press) return;
    // The primary button is the first bit: no longer down, the release was lost on the way.
    if (event.buttons % 2 === 0) {
      this.givenUp();
      return;
    }
    const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (!press.dragging && distance <= START_PX) return;
    const over = this.dayAt(event);
    const to = over ?? press.to;
    if (!press.dragging || to !== press.to) {
      press.dragging = true;
      press.to = to;
      this.dragging.emit({ from: press.from, to });
    }
    this.restAt(over === null ? this.sideAt(event.clientX) : 0);
  };

  private readonly released = (): void => {
    const press = this.press;
    this.end();
    if (!press?.dragging) return;
    // The click that follows the release is the drag's own; without one, the next is not.
    this.swallowClick = true;
    setTimeout(() => (this.swallowClick = false));
    this.dropped.emit({ from: press.from, to: press.to });
  };

  private readonly givenUp = (): void => {
    const dragging = this.press?.dragging === true;
    this.end();
    if (dragging) this.dragging.emit(null);
  };

  /** The day under the mouse: its `data-date`, or `null` off the element's days. */
  private dayAt(event: PointerEvent): string | null {
    const day = event.target instanceof Element ? event.target.closest('[data-date]') : null;
    return day && this.host.contains(day) ? day.getAttribute('data-date') : null;
  }

  private sideAt(x: number): -1 | 0 | 1 {
    const { left, right } = this.host.getBoundingClientRect();
    if (x <= left + SIDE_PX) return -1;
    return x >= right - SIDE_PX ? 1 : 0;
  }

  /** The mouse is at a side (or at none): the side's wait starts when it gets there. */
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
    this.press = null;
    this.restAt(0);
    this.document.removeEventListener('pointermove', this.moved);
    this.document.removeEventListener('pointerup', this.released);
    this.document.removeEventListener('pointercancel', this.givenUp);
  }
}

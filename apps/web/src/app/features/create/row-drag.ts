import { DOCUMENT, DestroyRef, Directive, ElementRef, inject, output } from '@angular/core';

/** A mouse must move farther than this from where it was pressed for a drag to begin. */
const START_PX = 8;

/** How near the top or the bottom of the list the pointer makes it scroll. */
const EDGE_PX = 34;

/** The most the list scrolls each time, in pixels. */
const FASTEST_PX = 9;

/** How often the list scrolls while the pointer stays near one of its ends. */
export const FOLLOW_MS = 16;

/** A drag between two rows, by their place in the list: the row pressed and the row the pointer is at. */
export interface RowDragSpan {
  readonly from: number;
  readonly to: number;
}

/**
 * A drag along the rows of a list that scrolls: each child of the element is a row, known by its
 * place, the first being 0. A mouse begins it by pressing a row and moving away; a finger or a
 * pen, which scroll the list when they move, by resting on the row pressed: the element's user
 * tells when with `rested(row)`. `dragging` fires when the drag begins and each time the pointer
 * gets to another row, and `dropped` when it is released; the click the browser sends after it is
 * swallowed. A press that neither moves nor rests stays an ordinary click or tap. The pointer is
 * at the row of its height, wherever it is sideways, and at the row at the top or the bottom of
 * the list when it is above or below it. While it is near the top or the bottom of the list, or past
 * them, the list scrolls that way, faster the further it goes, so the drag gets to every row;
 * a finger's drag does not scroll it otherwise. A drag whose release never arrives, or that the
 * browser cancels, ends with `dragging` as `null`.
 */
@Directive({
  selector: '[appRowDrag]',
  exportAs: 'appRowDrag',
  host: { '(pointerdown)': 'pressed($event)' },
})
export class RowDrag {
  /** The drag as it goes on; `null` when it is given up without a release. */
  readonly dragging = output<RowDragSpan | null>();
  /** The pointer is released: the drag ends on the row it was at. */
  readonly dropped = output<RowDragSpan>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);

  private press: Press | null = null;
  private following: ReturnType<typeof setInterval> | undefined;
  private swallowClick = false;

  constructor() {
    // Capturing runs before the rows' own click listeners.
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
      this.end();
    });
  }

  /**
   * The pointer pressed on the row at `row` has rested on it long enough: its drag begins there,
   * without moving. Nothing happens when the press followed is not on that row (none, or another
   * finger's by now), or during a drag.
   */
  rested(row: number): void {
    const press = this.press;
    if (press?.from !== row || press.dragging) return;
    this.reach(press, row);
  }

  protected pressed(event: PointerEvent): void {
    // During a drag, another finger on the rows is not followed.
    if (this.press?.dragging && event.pointerId !== this.press.pointerId) return;
    this.giveUp();
    const from = this.rows().findIndex((row) => row.contains(event.target as Node | null));
    if (event.button !== 0 || from === -1) return;
    this.press = {
      pointerId: event.pointerId,
      mouse: event.pointerType === 'mouse',
      from,
      to: from,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    // On the document: the pointer leaves the list during a drag, and is released anywhere.
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
      // A finger that moves before it has rested is scrolling the list.
      if (!press.mouse || distance <= START_PX) return;
    }
    press.y = event.clientY;
    this.reach(press, this.rowAt(press.y));
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

  /** The browser takes the pointer away: a finger's, when the list scrolls after all. */
  private readonly cancelled = (event: PointerEvent): void => {
    if (this.press?.pointerId === event.pointerId) this.giveUp();
  };

  /** The list does not scroll under a finger's drag. */
  private readonly keepStill = (event: Event): void => {
    if (this.press?.dragging) event.preventDefault();
  };

  /** The drag begins, or gets to another row. */
  private reach(press: Press, to: number): void {
    if (press.dragging && to === press.to) return;
    if (!press.dragging) {
      this.following = setInterval(() => {
        this.follow(press);
      }, FOLLOW_MS);
    }
    press.dragging = true;
    press.to = to;
    this.dragging.emit({ from: press.from, to });
  }

  /** The list scrolls towards the end the pointer is near, and the drag gets to the row there. */
  private follow(press: Press): void {
    const { top, bottom } = this.host.getBoundingClientRect();
    const above = top + EDGE_PX - press.y;
    const below = press.y - (bottom - EDGE_PX);
    if (above <= 0 && below <= 0) return;
    this.host.scrollTop += above > 0 ? -paceAt(above) : paceAt(below);
    this.reach(press, this.rowAt(press.y));
  }

  /** The row at a height of the screen; above or below the list, the one at that end of it. */
  private rowAt(y: number): number {
    const { top, bottom } = this.host.getBoundingClientRect();
    const height = Math.min(Math.max(y, top), bottom - 1);
    const rows = this.rows();
    const at = rows.findIndex((row) => row.getBoundingClientRect().bottom > height);
    return at === -1 ? rows.length - 1 : at;
  }

  private rows(): Element[] {
    return Array.from(this.host.children);
  }

  private giveUp(): void {
    const dragging = this.press?.dragging === true;
    this.end();
    if (dragging) this.dragging.emit(null);
  }

  private end(): void {
    this.press = null;
    clearInterval(this.following);
    this.document.removeEventListener('pointermove', this.moved);
    this.document.removeEventListener('pointerup', this.released);
    this.document.removeEventListener('pointercancel', this.cancelled);
  }
}

/** How far the list scrolls each time, by how deep the pointer is into the end of the list. */
function paceAt(depth: number): number {
  return Math.min(FASTEST_PX, depth / 4 + 1);
}

/** A pointer down on a row, until it is released: a drag once it has moved away or rested. */
interface Press {
  readonly pointerId: number;
  readonly mouse: boolean;
  readonly from: number;
  to: number;
  readonly x: number;
  y: number;
  dragging: boolean;
}

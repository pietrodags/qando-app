import { Directive, ElementRef, afterRenderEffect, inject, input, signal } from '@angular/core';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Half a pixel: smooth scrolling and zoom leave fractions behind. */
const TOLERANCE_PX = 0.5;

/**
 * A box that shows only `fold` of its children, and no more than fit in `foldHeight` pixels
 * (`foldLeast` at least), and scrolls the rest, a child at a time: `back()` and `forward()` move
 * one child up or down (realigning one cut at the top first), each call one child further than
 * the one before while the box still moves, and `atStart`/`atEnd` say where it
 * stands, for the buttons that call them, and `nextHidden()` which child they would bring into
 * sight. The box is exactly as tall as the children it shows
 * with its padding and border, so none is cut; when they all fit it grows to fit them. While
 * folded it has the class `folded` and `folded()` is true, for its stylesheet to let it scroll
 * and hide the scrollbar and for the page to show its arrows. The first time it folds it opens
 * with the child `foldStart` at its top, and stays from then on where the reader scrolls it.
 * Used as `<div [appScrollFold]="fold" [foldHeight]="limit" #box="appScrollFold">`.
 */
@Directive({
  selector: '[appScrollFold]',
  exportAs: 'appScrollFold',
  host: {
    '[class.folded]': 'folded()',
    '(scroll)': 'locate()',
    '(scrollend)': 'rest()',
  },
})
export class ScrollFold {
  /** How many children show before the box scrolls; `null` shows them all. */
  readonly appScrollFold = input.required<number | null>();
  /** The most the box may measure, border included; `null` sets no limit. */
  readonly foldHeight = input<number | null>(null);
  /** The child at the top of the box the first time it folds. */
  readonly foldStart = input(0);
  /** The fewest children `foldHeight` leaves in sight, however short it is. */
  readonly foldLeast = input(1);

  /** Some children are out of sight: the box scrolls. */
  readonly folded = signal(false);

  /** At the top: there is nothing to go back to. */
  readonly atStart = signal(true);
  /** At the bottom: there is nothing to go forward to. */
  readonly atEnd = signal(true);

  private readonly box = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** The box has folded once and stands where `foldStart` put it or the reader took it. */
  private opened = false;
  /**
   * Where the move under way will leave the box, for the next one to count from there: a press
   * given while the box still slides would otherwise ask for the same child again. `null` once
   * the box rests, and always in a browser that never tells when a scroll ends.
   */
  private heading: number | null = null;

  constructor() {
    afterRenderEffect(() => {
      const shown = this.shown(this.appScrollFold(), this.foldHeight(), this.foldLeast());
      const folded = shown < this.box.children.length;
      this.box.style.blockSize = folded ? `${String(this.heightOf(shown))}px` : '';
      this.folded.set(folded);
      if (folded && !this.opened) {
        // Before `locate()`, so the buttons are right from the first render.
        this.box.scrollTop = this.stops()[this.foldStart()] ?? 0;
        this.opened = true;
      }
      this.locate();
    });
  }

  /** One child up: the one above the top, or the one cut by it. */
  back(): void {
    const above = this.stops().filter((stop) => stop < this.from() - TOLERANCE_PX);
    this.scroll(above.at(-1) ?? 0);
  }

  /** One child down, or as far as the box scrolls. */
  forward(): void {
    const below = this.stops().find((stop) => stop > this.from() + TOLERANCE_PX);
    this.scroll(Math.min(below ?? Infinity, this.end()));
  }

  /**
   * The child `back()` or `forward()` would bring into sight, without moving: the last one above
   * the top, or the first one cut by the bottom or below it. The first child when nothing is
   * above, the last when nothing is below.
   */
  nextHidden(direction: 'back' | 'forward'): number {
    const { scrollTop, clientHeight } = this.box;
    const stops = this.stops();
    if (direction === 'back') {
      return Math.max(stops.filter((stop) => stop < scrollTop - TOLERANCE_PX).length - 1, 0);
    }
    const { paddingTop, paddingBottom } = getComputedStyle(this.box);
    const bottom = scrollTop + clientHeight - pixels(paddingTop) - pixels(paddingBottom);
    const children = Array.from(this.box.children);
    const cut = children.findIndex((child, index) => {
      const { top, bottom: end } = child.getBoundingClientRect();
      return (stops[index] ?? 0) + end - top > bottom + TOLERANCE_PX;
    });
    return cut === -1 ? children.length - 1 : cut;
  }

  protected locate(): void {
    const { scrollTop } = this.box;
    this.atStart.set(scrollTop <= TOLERANCE_PX);
    this.atEnd.set(scrollTop >= this.end() - TOLERANCE_PX);
  }

  protected rest(): void {
    this.heading = null;
  }

  /** Where the box is, or where the move under way will leave it. */
  private from(): number {
    return this.heading ?? this.box.scrollTop;
  }

  /** How many children show: the fold, fewer if they pass the height, and `least` at least. */
  private shown(fold: number | null, maxHeight: number | null, least: number): number {
    let shown = Math.min(fold ?? Infinity, this.box.children.length);
    if (maxHeight === null) return shown;
    while (shown > least && this.heightOf(shown) > maxHeight) shown -= 1;
    return shown;
  }

  /** The height of the box that shows its first `count` children whole. */
  private heightOf(count: number): number {
    const last = this.box.children[count - 1];
    if (last === undefined) return 0;
    const { paddingBottom, borderBottomWidth } = getComputedStyle(this.box);
    return (
      last.getBoundingClientRect().bottom -
      this.box.getBoundingClientRect().top +
      this.box.scrollTop +
      pixels(paddingBottom) +
      pixels(borderBottomWidth)
    );
  }

  /** The scroll positions that put each child at the top, below the padding. */
  private stops(): number[] {
    const { paddingTop, borderTopWidth } = getComputedStyle(this.box);
    const origin =
      this.box.getBoundingClientRect().top -
      this.box.scrollTop +
      pixels(borderTopWidth) +
      pixels(paddingTop);
    return Array.from(this.box.children, (child) => child.getBoundingClientRect().top - origin);
  }

  private end(): number {
    return Math.max(this.box.scrollHeight - this.box.clientHeight, 0);
  }

  private scroll(top: number): void {
    const behavior = window.matchMedia(REDUCED_MOTION_QUERY).matches ? 'instant' : 'smooth';
    this.heading = 'onscrollend' in window ? top : null;
    this.box.scrollTo({ top, behavior });
  }
}

function pixels(length: string): number {
  return Number.parseFloat(length) || 0;
}

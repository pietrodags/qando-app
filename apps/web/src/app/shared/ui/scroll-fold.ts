import {
  DestroyRef,
  Directive,
  ElementRef,
  afterEveryRender,
  afterRenderEffect,
  inject,
  input,
  signal,
} from '@angular/core';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Half a pixel: smooth scrolling and zoom leave fractions behind. */
const TOLERANCE_PX = 0.5;

/**
 * A box that shows only `fold` of its children, and no more than fit in `foldHeight` pixels
 * (`foldLeast` at least), and scrolls the rest, a child at a time: `back()` and `forward()` move
 * one child up or down (realigning one cut at the top first), each call one child further than
 * the one before while the box still moves, and `atStart`/`atEnd` say where it
 * stands, for the buttons that call them, and `nextHidden()` which child they would bring into
 * sight; `reveal(first, last)` brings those children into sight with the least scroll, for a page
 * that adds one or wants one seen. The box is exactly as tall as the children it shows
 * with its padding and border, so none is cut; when they all fit it grows to fit them, and it
 * measures itself again when a child joins or leaves, grows or shrinks, and when the box is shown
 * after being hidden: in the same render when something is drawn again (so it is never seen
 * measured as hidden), and else as soon as the browser sees the box or a child resize, as a
 * turned screen or a late font that wraps the children's words. While
 * folded it has the class `folded` and `folded()` is true, for its stylesheet to let it scroll
 * and hide the scrollbar and for the page to show its arrows; it has the class from the render in
 * which it folds, so it scrolls at once. `spare` says how much of `foldHeight` is left under it.
 * The first time it folds in sight it opens
 * with the child `foldStart` at its top, and stays from then on where the reader scrolls it;
 * `foldSight` names a child it keeps in sight, brought there with the least scroll as `reveal`
 * does: at once whenever the box is shown or folds, smoothly when it names another one.
 * Used as `<div [appScrollFold]="fold" [foldHeight]="limit" #box="appScrollFold">`.
 */
@Directive({
  selector: '[appScrollFold]',
  exportAs: 'appScrollFold',
  host: {
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
  /**
   * A child the box keeps in sight, as a choice the page has made for the reader; `null` keeps
   * none.
   */
  readonly foldSight = input<number | null>(null);

  /** Some children are out of sight: the box scrolls. */
  readonly folded = signal(false);

  /**
   * How many pixels `foldHeight` leaves under the box as it is drawn, for the page to put
   * something there without taking a child from the box: negative when even the fewest children
   * pass it, `null` without a limit.
   */
  readonly spare = signal<number | null>(null);

  /** At the top: there is nothing to go back to. */
  readonly atStart = signal(true);
  /** At the bottom: there is nothing to go forward to. */
  readonly atEnd = signal(true);

  private readonly box = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** How many children the box holds: with one more or one less it measures itself again. */
  private readonly held = signal(0);
  /**
   * How tall what the box holds is drawn, nothing while hidden: shown, or with a child grown or
   * shrunk, the box measures itself again in that same render.
   */
  private readonly tall = signal(0);
  /** Bumped whenever the browser sees the box or a child resize, even with nothing drawn again. */
  private readonly resized = signal(0);
  /** The children the browser watches, for those that leave to be let go. */
  private readonly watched = new Set<Element>();
  /** How the box stood when it last measured itself, for when `foldSight` is brought into sight. */
  private last: { laidOut: boolean; folded: boolean; sight: number | null } = {
    laidOut: false,
    folded: false,
    sight: null,
  };
  /** The box has folded once and stands where `foldStart` put it or the reader took it. */
  private opened = false;
  /**
   * Where the move under way will leave the box, for the next one to count from there: a press
   * given while the box still slides would otherwise ask for the same child again. `null` once
   * the box rests, and always in a browser that never tells when a scroll ends.
   */
  private heading: number | null = null;

  constructor() {
    // Older browsers without it measure again only when something is drawn again.
    const observer =
      'ResizeObserver' in window
        ? new ResizeObserver(() => {
            this.resized.update((count) => count + 1);
          })
        : undefined;
    observer?.observe(this.box);
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
    });
    // Read before the measure below, so that a child that joins or grows, or the box shown, is
    // measured in the same render.
    afterEveryRender({
      earlyRead: () => {
        this.held.set(this.box.children.length);
        this.tall.set(this.box.scrollHeight);
        if (observer !== undefined) this.watch(observer);
      },
    });
    afterRenderEffect(() => {
      this.held();
      this.resized();
      // Hidden, the box has nothing laid out: no place to open at, nothing to bring into sight.
      const laidOut = this.tall() > 0;
      const limit = this.foldHeight();
      const shown = this.shown(this.appScrollFold(), limit, this.foldLeast());
      const folded = shown < this.box.children.length;
      const height = this.heightOf(shown);
      this.box.style.blockSize = folded ? `${String(height)}px` : '';
      this.spare.set(limit === null ? null : limit - height);
      // Marked here, with its height, and not by a binding, which would mark it a render late: a
      // box whose stylesheet lets it scroll only once folded would not move for what is asked of
      // it in this render, its first place or a child to bring into sight.
      this.box.classList.toggle('folded', folded);
      this.folded.set(folded);
      if (folded && laidOut && !this.opened) {
        // Before `locate()`, so the buttons are right from the first render.
        this.box.scrollTop = this.stops()[this.foldStart()] ?? 0;
        this.opened = true;
      }
      this.keepInSight(laidOut, folded);
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
    const { scrollTop } = this.box;
    const stops = this.stops();
    if (direction === 'back') {
      return Math.max(stops.filter((stop) => stop < scrollTop - TOLERANCE_PX).length - 1, 0);
    }
    const bottom = scrollTop + this.sight();
    const children = Array.from(this.box.children);
    const cut = children.findIndex((child, index) => {
      const { top, bottom: end } = child.getBoundingClientRect();
      return (stops[index] ?? 0) + end - top > bottom + TOLERANCE_PX;
    });
    return cut === -1 ? children.length - 1 : cut;
  }

  /**
   * Brings the children `first` to `last` into sight with the least scroll: nothing when they are
   * whole in sight already, inside the padding; `first` at the top when they start above it or do
   * not all fit; else `last` at the bottom of what the box shows. A place before the first child
   * is the first, and one after the last is the last.
   */
  reveal(first: number, last: number): void {
    this.bring(first, last, false);
  }

  protected locate(): void {
    const { scrollTop } = this.box;
    this.atStart.set(scrollTop <= TOLERANCE_PX);
    this.atEnd.set(scrollTop >= this.end() - TOLERANCE_PX);
  }

  protected rest(): void {
    this.heading = null;
  }

  /** `reveal`, smoothly or else `atOnce`, without motion. */
  private bring(first: number, last: number, atOnce: boolean): void {
    const children = Array.from(this.box.children);
    const within = (place: number): number => Math.min(Math.max(place, 0), children.length - 1);
    const lastChild = children[within(last)];
    if (lastChild === undefined) return;
    const stops = this.stops();
    const rect = lastChild.getBoundingClientRect();
    const top = stops[within(first)] ?? 0;
    const bottom = (stops[within(last)] ?? 0) + rect.bottom - rect.top;
    const from = this.from();
    const sight = this.sight();
    const startsAbove = top < from - TOLERANCE_PX;
    if (!startsAbove && bottom <= from + sight + TOLERANCE_PX) return;
    const fits = bottom - top <= sight + TOLERANCE_PX;
    const wanted = Math.min(startsAbove || !fits ? top : bottom - sight, this.end());
    // Already there: a scroll that moves nothing never tells that it ended.
    if (Math.abs(wanted - from) <= TOLERANCE_PX) return;
    if (atOnce) this.box.scrollTop = wanted;
    else this.scroll(wanted);
  }

  /**
   * Brings `foldSight` into sight: at once as the box is shown or folds, for it to appear there,
   * and smoothly when it names another child; else the box stays where the reader took it.
   */
  private keepInSight(laidOut: boolean, folded: boolean): void {
    const sight = this.foldSight();
    const appears = laidOut && (!this.last.laidOut || (folded && !this.last.folded));
    const named = sight !== this.last.sight;
    this.last = { laidOut, folded, sight };
    if (sight === null || !laidOut) return;
    if (appears) this.bring(sight, sight, true);
    else if (named) this.bring(sight, sight, false);
  }

  /** Has the browser watch each child the box holds now, and let go of those gone. */
  private watch(observer: ResizeObserver): void {
    const children = new Set(Array.from(this.box.children));
    for (const child of this.watched) {
      if (children.has(child)) continue;
      observer.unobserve(child);
      this.watched.delete(child);
    }
    for (const child of children) {
      if (this.watched.has(child)) continue;
      observer.observe(child);
      this.watched.add(child);
    }
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

  /** How much of the box shows its children: its height inside the padding. */
  private sight(): number {
    const { paddingTop, paddingBottom } = getComputedStyle(this.box);
    return this.box.clientHeight - pixels(paddingTop) - pixels(paddingBottom);
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

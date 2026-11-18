import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  type ElementRef,
  Injector,
  TemplateRef,
  afterNextRender,
  afterRenderEffect,
  contentChild,
  inject,
  input,
  model,
  output,
  viewChild,
  viewChildren,
} from '@angular/core';
import { HoldRepeat } from '../../shared/ui/hold-repeat';
import { ScrollFold } from '../../shared/ui/scroll-fold';

/** The most pills a stacked list shows: the rest scroll under ︿ ﹀. */
const MOST_STACKED = 4;

/** A pill of the list. A page may give its pills more fields, for its template to read. */
export interface SavedPill<T> {
  /** What the pill stands for: what is pinned, previewed and removed. */
  readonly item: T;
  /** The tip of its "−", and its name for screen readers. */
  readonly removeTitle: string;
  readonly removeName: string;
}

/**
 * Saved items as a list of pills in a white well. What a pill reads is up to the page: the one
 * `<ng-template let-pill>` it gives as content is drawn inside each pill, with the pill. A press
 * on a pill pins its item, and on the pinned pill lets it go; the mouse over a pill previews its
 * item. A pill's "−" asks the page to delete its item: a mouse and the keyboard find it on the
 * pill while none is pinned, and without a mouse it is there only on the pinned pill. Once the
 * page has deleted the item, the focus goes to the pill that takes its place, or to the last one;
 * with no pill left the list has nothing to give it to. A page that changes the item of a pill,
 * which is then another pill, says which one takes the focus (`focus(item)`).
 *
 * The pills go side by side, or `stacked` one under another: then the list shows four at most
 * and scrolls the rest under ︿ ﹀ (`ScrollFold`), and a pill that joins it is brought into sight.
 * Items are told apart by identity: a page keeps the item of a pill the same while it is saved.
 */
@Component({
  selector: 'app-saved-pills',
  imports: [HoldRepeat, NgTemplateOutlet, ScrollFold],
  styleUrl: './saved-pills.scss',
  templateUrl: './saved-pills.html',
  host: { '[class.touch]': 'touch()', '[class.stacked]': 'stacked()' },
})
export class SavedPills<T> {
  /** The pills to show, in order. */
  readonly pills = input.required<readonly SavedPill<T>[]>();
  /** The device has no mouse: a pill is pinned to find its "−". */
  readonly touch = input(false);
  /** One under another in a narrow column, as wide as the list, and four in sight at most. */
  readonly stacked = input(false);
  /** The item pinned; one that is not among `pills` shows on no pill. */
  readonly pinned = model<T | null>(null);
  /** The mouse comes over the pill of an item, or leaves it (`null`). */
  readonly previewed = output<T | null>();
  /** The "−" of an item is pressed: the page deletes it by taking its pill out of `pills`. */
  readonly removed = output<T>();

  /** What a pill reads: the page's template, drawn with the pill. */
  protected readonly label =
    contentChild.required<TemplateRef<{ $implicit: SavedPill<T> }>>(TemplateRef);
  protected readonly mostStacked = MOST_STACKED;

  private readonly injector = inject(Injector);
  private readonly pillButtons = viewChildren<ElementRef<HTMLButtonElement>>('pillButton');
  private readonly fold = viewChild.required(ScrollFold);
  /** The items of the pills as last drawn: one that is not among them has just joined. */
  private drawn: readonly T[] | null = null;

  constructor() {
    // In the last phase of the render: by then the list has measured itself with its new pill.
    afterRenderEffect({
      read: () => {
        const items = this.pills().map(({ item }) => item);
        const before = this.drawn;
        this.drawn = items;
        // The pills a list is first drawn with have not joined it.
        if (before === null) return;
        const joined = items.findIndex((item) => !before.includes(item));
        if (joined !== -1) this.fold().reveal(joined, joined);
      },
    });
  }

  /**
   * The focus goes to the pill of an item, once the list is drawn with what the page has just
   * changed: for a page that gives a new item for the one of the pill with the focus, whose pill
   * is then another. It stays where it is when no pill is of that item.
   */
  focus(item: T): void {
    afterNextRender(
      () => {
        const place = this.pills().findIndex((pill) => pill.item === item);
        this.pillButtons()[place]?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  protected pin(item: T): void {
    this.pinned.update((pinned) => (pinned === item ? null : item));
  }

  /** A pointer comes over a pill; a finger's touch is not a mouse resting. */
  protected over(event: PointerEvent, item: T): void {
    if (event.pointerType !== 'touch') this.previewed.emit(item);
  }

  protected remove(item: T): void {
    const place = this.pills().findIndex((pill) => pill.item === item);
    this.removed.emit(item);
    afterNextRender(
      () => {
        // The page kept the item: its "−" is still there, with the focus.
        if (this.pills().some((pill) => pill.item === item)) return;
        const pills = this.pillButtons();
        (pills[place] ?? pills.at(-1))?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }
}

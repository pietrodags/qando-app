import { DOCUMENT, type DestroyRef, Injectable, inject } from '@angular/core';

/**
 * The times (`WizardTimes`) and their summary (`WizardSummary`) take each other's place in the
 * same card: the one that comes in may be shorter, and a page that shrank under its scroll would
 * be scrolled up by the browser, moving the columns down. So the part that gives way tells how far
 * down the page was seen (`leave`), and the one that takes its place keeps the page at least that
 * tall while it is there (`arrive`): the room left goes under the card, the columns stay where
 * they were, and the card ends where its new part does. Provided by the page that shows both in
 * one step. Taken once: a part that comes from another step keeps nothing.
 */
@Injectable()
export class PartHandover {
  private readonly page = inject(DOCUMENT);
  /** How far down the page was seen when a part gave way, in px; `null` once taken. */
  private seen: number | null = null;
  /** The part that keeps the page tall, if one does. */
  private holder: object | null = null;

  /** The part on screen gives way to the other. */
  leave(): void {
    const view = this.page.defaultView;
    this.seen = view ? view.scrollY + view.innerHeight : null;
  }

  /**
   * The part that takes the place of the one that gave way keeps the page at least as tall as was
   * seen of it, until `destroyRef` ends: nothing when no part gave way.
   */
  arrive(destroyRef: DestroyRef): void {
    const seen = this.seen;
    this.seen = null;
    if (seen === null) return;
    const holder = {};
    this.holder = holder;
    const root = this.page.documentElement;
    root.style.setProperty('min-block-size', `${String(seen)}px`);
    destroyRef.onDestroy(() => {
      // A part that came in after this one keeps the page as it set it.
      if (this.holder !== holder) return;
      this.holder = null;
      root.style.removeProperty('min-block-size');
    });
  }
}

import { DOCUMENT, DestroyRef, Directive, ElementRef, inject, signal } from '@angular/core';

/** How long the tip stays once the mouse has left it and its element, for the mouse to reach it. */
export const TIP_LINGER_MS = 150;

/**
 * On an element a tooltip points at, under the mouse: whether its tip is `shown`, for the page to
 * draw (`<button #sparkles appHoverTip #tip="appHoverTip">`, then
 * `@if (tip.shown()) { <app-tooltip [anchor]="sparkles"> }`). The mouse over the element shows it;
 * a finger or a pen does not, as a touch would leave it under the finger. It stays while the
 * mouse is over the element or over the tip, so it can be moved onto the tip to read it, and goes
 * `TIP_LINGER_MS` after the mouse is over neither (out of the window too), unless the mouse
 * reaches one of them meanwhile: a round element leaves its box's corners out, and the mouse
 * crosses one on its way. It goes at once when the element is pressed or with Escape: content
 * shown on hover that can be hovered and dismissed. The page is heard with plain listeners, so a
 * pointer moving over it costs no redrawing.
 */
@Directive({
  selector: '[appHoverTip]',
  exportAs: 'appHoverTip',
  host: {
    '(pointerenter)': 'entered($event)',
    '(click)': 'hide()',
  },
})
export class HoverTip {
  private readonly showing = signal(false);
  /** Whether the tip is shown. */
  readonly shown = this.showing.asReadonly();

  private readonly anchor = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** The tip's going, once the mouse has left it and its element. */
  private leaving: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const page = inject(DOCUMENT);
    const left = (event: PointerEvent): void => {
      if (!this.showing() || this.leaving !== null || this.holds(event.relatedTarget)) return;
      this.leaving = setTimeout(() => {
        this.hide();
      }, TIP_LINGER_MS);
    };
    const came = (event: PointerEvent): void => {
      if (this.holds(event.target)) this.stay();
    };
    const keyed = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') this.hide();
    };
    page.addEventListener('pointerout', left);
    page.addEventListener('pointerover', came);
    page.addEventListener('keydown', keyed);
    inject(DestroyRef).onDestroy(() => {
      page.removeEventListener('pointerout', left);
      page.removeEventListener('pointerover', came);
      page.removeEventListener('keydown', keyed);
    });
  }

  protected entered(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.showing.set(true);
  }

  protected hide(): void {
    this.stay();
    this.showing.set(false);
  }

  /** The tip's going, if it was to go, is called off. */
  private stay(): void {
    clearTimeout(this.leaving ?? undefined);
    this.leaving = null;
  }

  /** Whether the pointer, over `place`, is over the element or a tip. */
  private holds(place: EventTarget | null): boolean {
    return (
      place instanceof Node &&
      (this.anchor.contains(place) ||
        (place instanceof Element && place.closest('[role="tooltip"]') !== null))
    );
  }
}

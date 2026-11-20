import {
  afterNextRender,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
} from '@angular/core';

/**
 * Draws its element over the whole page, free of everything around it: in the browser's top
 * layer, so that nothing cuts it (not a box that hides what leaves it, nor a row drawn apart), and
 * as a child of the page's body, so that nothing holds it. The top layer alone is not enough on
 * an iPhone: there a ring written inside the columns of the times step was drawn away from its
 * hour, and from the body it is drawn on it. The element leaves the page with what it was written
 * in, as any other. Place it in the viewport's coordinates (`position: fixed`) and reset what the
 * browser gives a popover (margin, border, padding, background); what it takes from the boxes
 * around it (inherited styles) is the body's. Every browser the app supports has a top layer.
 */
@Directive({
  selector: '[appTopLayer]',
  host: { popover: 'manual' },
})
export class TopLayer {
  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const page = inject(DOCUMENT);
    afterNextRender(() => {
      // Moved first: a box moved once it is in the top layer leaves the top layer.
      page.body.append(element);
      element.showPopover();
    });
    // Angular takes an element out of where it wrote it: out of the body it is taken here.
    inject(DestroyRef).onDestroy(() => {
      element.remove();
    });
  }
}

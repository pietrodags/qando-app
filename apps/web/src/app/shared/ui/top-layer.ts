import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';

/**
 * Draws its element in the browser's top layer, over the whole page, so that nothing around it
 * cuts it: not a box that hides what leaves it, nor a row drawn apart. It is drawn there as long
 * as it is in the page; place it in the viewport's coordinates (`position: fixed`) and reset what
 * the browser gives a popover (margin, border, padding, background). Every browser the app
 * supports has a top layer.
 */
@Directive({
  selector: '[appTopLayer]',
  host: { popover: 'manual' },
})
export class TopLayer {
  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      element.showPopover();
    });
  }
}

import { Component, ElementRef, afterRenderEffect, inject, input } from '@angular/core';

/**
 * A small white box above an element, or (`placement`) below it or before it on its line (on its
 * left) where above would cover what the page needs seen, with a stem pointing at the element:
 * what it is given (`<app-tooltip [anchor]="day">09:00 • 18:15</app-tooltip>`). Above or below,
 * it centres itself on the anchor but stays inside its container, the nearest positioned
 * ancestor, and the stem follows the anchor when it cannot be centred; before it, it is centred
 * on the anchor's height, its stem in the middle of its right edge. Showing and hiding it is the
 * page's: it is shown while it is in the page.
 */
@Component({
  selector: 'app-tooltip',
  template: '<ng-content />',
  styleUrl: './tooltip.scss',
  host: {
    role: 'tooltip',
    '[class.below]': "placement() === 'below'",
    '[class.start]': "placement() === 'start'",
  },
})
export class Tooltip {
  /** The element it points at. */
  readonly anchor = input.required<HTMLElement>();
  /** Which side of the element it sits on. */
  readonly placement = input<'above' | 'below' | 'start'>('above');

  private readonly tooltip = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    afterRenderEffect(() => {
      const anchor = this.anchor().getBoundingClientRect();
      const container = this.container();
      const box = container.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = this.tooltip;
      // The anchor's place from the container's inner corner.
      const anchorLeft = anchor.left - box.left - container.clientLeft;
      const anchorTop = anchor.top - box.top - container.clientTop;
      const placement = this.placement();
      if (placement === 'start') {
        this.place(anchorLeft - width, anchorTop + anchor.height / 2 - height / 2);
        return;
      }
      const centre = anchorLeft + anchor.width / 2;
      const left = Math.max(0, Math.min(centre - width / 2, container.clientWidth - width));
      this.place(left, placement === 'above' ? anchorTop - height : anchorTop + anchor.height);
      this.tooltip.style.setProperty('--stem-left', `${String(centre - left)}px`);
    });
  }

  private place(left: number, top: number): void {
    this.tooltip.style.left = `${String(left)}px`;
    this.tooltip.style.top = `${String(top)}px`;
  }

  private container(): HTMLElement {
    const parent = this.tooltip.offsetParent ?? this.tooltip.parentElement;
    return parent instanceof HTMLElement ? parent : document.body;
  }
}

import { Component, ElementRef, afterRenderEffect, inject, input } from '@angular/core';

/**
 * A small white box above an element, with a stem pointing at the element's centre: what it is
 * given (`<app-tooltip [anchor]="day">09:00 • 18:15</app-tooltip>`). It centres itself on the
 * anchor but stays inside its container, the nearest positioned ancestor, and the stem follows
 * the anchor when it cannot be centred. Showing and hiding it is the page's: it is shown while
 * it is in the page.
 */
@Component({
  selector: 'app-tooltip',
  template: '<ng-content />',
  styleUrl: './tooltip.scss',
  host: { role: 'tooltip' },
})
export class Tooltip {
  /** The element it points at. */
  readonly anchor = input.required<HTMLElement>();

  private readonly tooltip = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    afterRenderEffect(() => {
      const anchor = this.anchor().getBoundingClientRect();
      const container = this.container();
      const box = container.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = this.tooltip;
      const centre = anchor.left + anchor.width / 2 - box.left - container.clientLeft;
      const left = Math.max(0, Math.min(centre - width / 2, container.clientWidth - width));
      this.tooltip.style.left = `${String(left)}px`;
      this.tooltip.style.top = `${String(anchor.top - box.top - container.clientTop - height)}px`;
      this.tooltip.style.setProperty('--stem-left', `${String(centre - left)}px`);
    });
  }

  private container(): HTMLElement {
    const parent = this.tooltip.offsetParent ?? this.tooltip.parentElement;
    return parent instanceof HTMLElement ? parent : document.body;
  }
}

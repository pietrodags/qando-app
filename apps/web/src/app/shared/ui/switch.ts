import { Component, input, model } from '@angular/core';

/**
 * A switch with its name before it: `<app-switch [(on)]="times">Horario</app-switch>`. A press on
 * the name or on the switch turns it on or off, as the space bar does once Tab has reached it.
 * Screen readers hear a switch, its name and whether it is on. A switch whose name is a drawing
 * says it in words with `label`.
 */
@Component({
  selector: 'app-switch',
  styleUrl: './switch.scss',
  template: `
    <label>
      <span><ng-content /></span>
      <span class="track">
        <input
          #box
          type="checkbox"
          role="switch"
          [attr.aria-label]="label()"
          [checked]="on()"
          (change)="on.set(box.checked)"
        />
        <span class="thumb"></span>
      </span>
    </label>
  `,
})
export class Switch {
  /** Whether the switch is on. */
  readonly on = model.required<boolean>();
  /** The name screen readers hear, for a switch that shows none in words. */
  readonly label = input<string>();
}

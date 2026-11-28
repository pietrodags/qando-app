import { Component, type ElementRef, input, output, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { HoverTip } from '../../shared/ui/hover-tip';
import { Tooltip } from '../../shared/ui/tooltip';

/**
 * The sparkles beside the dates step's question: the button that opens the smart calendar's box,
 * named "Generar fechas con IA" and pressed (`aria-pressed`) while the box is `open`, when a press
 * closes it. Red and a little larger under the mouse, as the trash, and so while the box is open.
 * Under the mouse they say their name over them (`Tooltip`, shown by `HoverTip`) until pressed or
 * Escape; the tip is placed from the page's nearest positioned element, so it may be wider than
 * they are. A press is told (`pressed`): opening and closing the box is the page's, and so is
 * giving them the focus back (`focus()`).
 */
@Component({
  selector: 'app-smart-calendar-toggle',
  imports: [HoverTip, Tooltip, TranslocoPipe],
  templateUrl: './smart-calendar-toggle.html',
  styleUrl: './smart-calendar-toggle.scss',
})
export class SmartCalendarToggle {
  /** The box they open is open. */
  readonly open = input.required<boolean>();
  /** They were pressed. */
  readonly pressed = output();

  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('sparkles');

  /** Gives them the focus, as the page does once the box's "X" has closed the box. */
  focus(): void {
    this.button().nativeElement.focus();
  }
}

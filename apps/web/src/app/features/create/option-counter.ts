import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MAX_OPTIONS } from '@qando/domain';
import { type DateSelection, optionCount } from './date-selection';

/** The counter shows once this many options are taken. */
const COUNTED_FROM = 50;

/**
 * How many of the options an event takes the dates amount to, once they are near the most: a
 * small pill ("57 de 60 opciones"), red when every one is taken. It is a status always on the
 * page, empty until then, so that screen readers hear its text when it comes; while it says
 * something it is marked `counting`, for the step to give it room.
 */
@Component({
  selector: 'app-option-counter',
  imports: [TranslocoPipe],
  styleUrl: './option-counter.scss',
  host: { role: 'status', '[class.counting]': 'counted() !== null' },
  template: `@if (counted(); as count) {
    <span class="counter" [class.full]="full()">{{
      'create.options' | transloco: { count, max }
    }}</span>
  }`,
})
export class OptionCounter {
  /** The dates the organizer has chosen, with their times. */
  readonly selection = input.required<DateSelection>();

  protected readonly max = MAX_OPTIONS;
  private readonly options = computed<number>(() => optionCount(this.selection()));
  /** How many options are taken, once they are near the most; `null` before. */
  protected readonly counted = computed<number | null>(() =>
    this.options() >= COUNTED_FROM ? this.options() : null,
  );
  protected readonly full = computed<boolean>(() => this.options() >= MAX_OPTIONS);
}

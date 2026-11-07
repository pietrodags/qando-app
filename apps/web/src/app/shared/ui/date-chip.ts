import { Component, computed, inject, input } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

/**
 * A date or a range of dates as a pill, named the short way: "Mié 8", "Mar 7➔Vie 10" (no
 * month, no year). An `available`, `preferred` or `unavailable` class colours it as that answer.
 * It only shows: to press it, the page puts it in a button. Dates are calendar values, as
 * `YYYY-MM-DD`.
 */
@Component({
  selector: 'app-date-chip',
  styleUrl: './date-chip.scss',
  template: `@for (end of ends(); track $index) {
    @if (!$first) {
      <span class="arrow" aria-hidden="true">➔</span>
    }
    <span>{{ end }}</span>
  }`,
})
export class DateChip {
  readonly start = input.required<string>();
  /** The last date of a range; the start itself for a single date. */
  readonly end = input.required<string>();

  private readonly locale = inject(TranslocoService).getActiveLang();
  private readonly weekdayFormat = new Intl.DateTimeFormat(this.locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });

  protected readonly ends = computed<string[]>(() => {
    const [start, end] = [this.start(), this.end()];
    return (start === end ? [start] : [start, end]).map((date) => this.label(date));
  });

  /** `2026-07-08` → "Mié 8": a date-only ISO string is read as UTC, as it is shown. */
  private label(date: string): string {
    const weekday = this.weekdayFormat.format(Date.parse(date));
    const titled = weekday.charAt(0).toLocaleUpperCase(this.locale) + weekday.slice(1);
    return `${titled} ${String(Number(date.slice(8)))}`;
  }
}

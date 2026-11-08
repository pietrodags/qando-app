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

  protected readonly ends = computed<string[]>(() =>
    endLabels(this.start(), this.end(), this.locale),
  );
}

/**
 * What a chip shows, in words: "Mié 8", "Mar 7 – Vie 10". The name of a button that holds a chip
 * starts with it, so a voice user can say what they see (WCAG 2.5.3).
 */
export function chipLabel(start: string, end: string, locale: string): string {
  return endLabels(start, end, locale).join(' – ');
}

/** Each end of a chip the short way: `2026-07-08` → "Mié 8", a date-only ISO string read as UTC. */
function endLabels(start: string, end: string, locale: string): string[] {
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  return (start === end ? [start] : [start, end]).map((date) => {
    const weekday = weekdayFormat.format(Date.parse(date));
    const titled = weekday.charAt(0).toLocaleUpperCase(locale) + weekday.slice(1);
    return `${titled} ${String(Number(date.slice(8)))}`;
  });
}

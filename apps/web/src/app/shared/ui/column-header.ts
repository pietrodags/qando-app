import { Component, computed, inject, input } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

/** `2026-07-06` → "Jul", "6", "Lun". */
interface HeaderDay {
  readonly month: string;
  readonly day: number;
  readonly weekday: string;
}

/**
 * The header of a column of times: a box that says whose day the column is, with its month, its
 * day and its weekday one over the other ("Jul", "6", "Lun"); a range of days shows both ends, a
 * little smaller and joined by "➔". It only shows: the page names the day for screen readers
 * where it is answered, and puts the header in a button to press it. Dates are calendar values,
 * as `YYYY-MM-DD`.
 */
@Component({
  selector: 'app-column-header',
  styleUrl: './column-header.scss',
  template: `@for (day of days(); track $index) {
    @if (!$first) {
      <span class="arrow">➔</span>
    }
    <div class="stack">
      <span class="month">{{ day.month }}</span>
      <span class="day">{{ day.day }}</span>
      <span class="weekday">{{ day.weekday }}</span>
    </div>
  }`,
})
export class ColumnHeader {
  /** The first day, or the only one, as `YYYY-MM-DD`. */
  readonly start = input.required<string>();
  /** The last day of a range of days; `null` for a single day. */
  readonly end = input<string | null>(null);

  private readonly locale = inject(TranslocoService).getActiveLang();
  private readonly monthFormat = new Intl.DateTimeFormat(this.locale, {
    month: 'short',
    timeZone: 'UTC',
  });
  private readonly weekdayFormat = new Intl.DateTimeFormat(this.locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });

  protected readonly days = computed<readonly HeaderDay[]>(() => {
    const end = this.end();
    return (end === null ? [this.start()] : [this.start(), end]).map((date) => this.dayOf(date));
  });

  private dayOf(date: string): HeaderDay {
    const time = Date.parse(date);
    return {
      month: this.titled(this.monthFormat.format(time)),
      day: new Date(time).getUTCDate(),
      weekday: this.titled(this.weekdayFormat.format(time)),
    };
  }

  /** Three letters of a month or a weekday, as a title: "sept." → "Sep". */
  private titled(name: string): string {
    const short = name.replace('.', '').slice(0, 3);
    return `${short.charAt(0).toLocaleUpperCase(this.locale)}${short.slice(1)}`;
  }
}

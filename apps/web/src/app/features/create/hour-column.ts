import {
  Component,
  type ElementRef,
  computed,
  input,
  model,
  signal,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { HoldRepeat } from '../../shared/ui/hold-repeat';
import { ScrollFold } from '../../shared/ui/scroll-fold';
import { type DayTime, pressHour, shiftQuarter, timeAt } from './day-times';

/** An hour of the day as its row shows it. */
interface HourRow {
  readonly hour: number;
  /** The minutes of its time, ":00" while it has none. */
  readonly minutes: string;
  /** What it reads and is named: "18:15". */
  readonly label: string;
  readonly marked: boolean;
  /** Its time is at the first quarter of the hour, or at the last: it moves no further. */
  readonly atFirstQuarter: boolean;
  readonly atLastQuarter: boolean;
}

/**
 * The times of one day: a list of the 24 hours where a press on an hour marks a time on the hour
 * and a press on a marked time unmarks it, and the two arrows of a marked time move it a quarter
 * within its hour. The list shows 9 hours, opens at 9:00 and scrolls the rest under ︿ ﹀; given
 * less `room` it shows the hours that fit, 4 at least. With the keyboard the column is one Tab
 * stop: ↑ ↓ go along the hours, Enter or Space mark, ← → move the time a quarter. The page names
 * the day (`role="group"` and a label on the host).
 */
@Component({
  selector: 'app-hour-column',
  imports: [HoldRepeat, ScrollFold, TranslocoPipe],
  templateUrl: './hour-column.html',
  styleUrl: './hour-column.scss',
})
export class HourColumn {
  /** The times of the day, in order. */
  readonly times = model.required<readonly DayTime[]>();
  /** The day takes no more times: a press on a free hour marks nothing. */
  readonly full = input.required<boolean>();
  /** The most the list may measure, in pixels; `null` sets no limit. */
  readonly room = input<number | null>(null);

  protected readonly shown = 9;
  protected readonly least = 4;
  protected readonly opening = 9;

  /** The hour the Tab key reaches: the last one that had the focus. */
  protected readonly tabStop = signal(this.opening);

  protected readonly rows = computed<readonly HourRow[]>(() => {
    const times = this.times();
    return Array.from({ length: 24 }, (_, hour) => {
      const time = timeAt(times, hour);
      const minutes = time?.at.slice(2) ?? ':00';
      return {
        hour,
        minutes,
        label: `${String(hour)}${minutes}`,
        marked: time !== undefined,
        // A time at its stop is not moved: the same list comes back.
        atFirstQuarter: shiftQuarter(times, hour, -1) === times,
        atLastQuarter: shiftQuarter(times, hour, 1) === times,
      };
    });
  });

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('time');

  protected press(hour: number): void {
    this.times.update((times) => pressHour(times, hour, this.full()));
  }

  protected move(hour: number, by: -1 | 1): void {
    this.times.update((times) => shiftQuarter(times, hour, by));
  }

  /** The focus goes to another hour, if the day has it. */
  protected focus(hour: number): void {
    this.buttons()[hour]?.nativeElement.focus();
  }
}

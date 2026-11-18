import {
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  signal,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { HoldRepeat } from '../../shared/ui/hold-repeat';
import { HOLD_MS, LongPress } from '../../shared/ui/long-press';
import { ScrollFold } from '../../shared/ui/scroll-fold';
import { Tooltip } from '../../shared/ui/tooltip';
import { TopLayer } from '../../shared/ui/top-layer';
import {
  type DayTimes,
  type HourDrag,
  type HourMark,
  dragHours,
  markAt,
  pressHour,
  shiftQuarter,
} from './day-times';
import { RowDrag, type RowDragSpan } from './row-drag';

/** An hour of the day as its row shows it. */
interface HourRow {
  readonly hour: number;
  readonly part: HourMark['part'];
  /** What tells its row from the others: its part, `marked`, and `live` while it is being drawn. */
  readonly classes: string;
  /** The minutes it shows: those of its time, ":00" while it has none, nothing inside a range. */
  readonly minutes: string;
  /** Its time as it reads, "18:15"; the hour, "18:00", where it has none. */
  readonly label: string;
  /** The two ends of its range as they read; `null` off a range. */
  readonly range: { readonly start: string; readonly end: string } | null;
  readonly marked: boolean;
  /** It has a time to move by quarters: a time of its own, or an end of a range. */
  readonly moves: boolean;
  /** Its time is at the first quarter of the hour, or at the last: it moves no further. */
  readonly atFirstQuarter: boolean;
  readonly atLastQuarter: boolean;
}

/** Where the ring of a finger's rest is drawn, in pixels from the corner of the screen. */
interface RingBox {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The times of one day: a list of the 24 hours where a press on an hour marks a time on the hour
 * and a press on a marked time unmarks it, and the two arrows of a marked time move it a quarter
 * within its hour. A drag from an hour to another makes a time range, drawn as it goes and made
 * when it is released: with a mouse by pressing and moving, with a finger by resting half a
 * second on the hour, a ring closing on it meanwhile, and then sliding (a finger that slides
 * before scrolls the list); near the ends of the list the drag scrolls it. A range is one band,
 * its two ends with their minutes and arrows; dragged from an end it moves that end, and a press
 * on any of its hours removes it. The list shows 9 hours, opens at 9:00 and scrolls the rest
 * under ︿ ﹀; given less `room` it shows the hours that fit, 4 at least. With the keyboard the
 * column is one Tab stop: ↑ ↓ go along the hours, Enter or Space mark, ← → move the time a
 * quarter; Shift+Enter holds an hour as an end of a range, drawn to the hour the focus goes to,
 * Enter there makes it and Escape lets go, and a tip over the hour held, heard by screen readers
 * too, asks for the last hour. While a range is being made no time is pressed or moved, and the
 * arrows are greyed. The page names the day (`role="group"` and a label on the host).
 */
@Component({
  selector: 'app-hour-column',
  imports: [HoldRepeat, LongPress, RowDrag, ScrollFold, Tooltip, TopLayer, TranslocoPipe],
  templateUrl: './hour-column.html',
  styleUrl: './hour-column.scss',
  host: { '(focusout)': 'left($event)' },
})
export class HourColumn {
  /** The times of the day, marked and saved. */
  readonly times = model.required<DayTimes>();
  /** The event takes no more options: nothing that would add one is marked, nor moved. */
  readonly full = input.required<boolean>();
  /** The most the list may measure, in pixels; `null` sets no limit. */
  readonly room = input<number | null>(null);

  protected readonly shown = 9;
  protected readonly least = 4;
  protected readonly opening = 9;
  protected readonly holdDuration = `${String(HOLD_MS)}ms`;

  /** The hour the Tab key reaches: the last one that had the focus. */
  protected readonly tabStop = signal(this.opening);
  /** The hour held with the keyboard as an end of a range whose other end is not chosen yet. */
  protected readonly held = signal<number | null>(null);
  /** The list has scrolled since the hour was held: the tip no longer points at it. */
  protected readonly tipLost = signal(false);
  /** The drag of a mouse or a finger going on, by its two hours. */
  private readonly drag = signal<RowDragSpan | null>(null);

  /**
   * The range being made, by a drag or from the hour held to the hour with the focus; `null`
   * without one, and when it draws nothing.
   */
  private readonly drawing = computed<HourDrag | null>(() => {
    const held = this.held();
    const span = this.drag() ?? (held === null ? null : { from: held, to: this.tabStop() });
    return span && dragHours(this.times(), span.from, span.to, this.full());
  });

  /**
   * A range is being made, by a drag or from an hour held: until it is made or let go, what is
   * on screen is not the day's times yet, and none of them is pressed or moved.
   */
  private readonly making = computed<boolean>(() => this.drag() !== null || this.held() !== null);

  protected readonly rows = computed<readonly HourRow[]>(() => {
    const drawing = this.drawing();
    const making = this.making();
    const day = this.times();
    const full = this.full();
    const times = (drawing?.times ?? day).marked;
    return Array.from({ length: 24 }, (_, hour) => {
      const { part, time, minutes } = markAt(times, hour);
      const live = time !== null && time === drawing?.drawn;
      return {
        hour,
        part,
        classes: part === 'free' ? '' : `${part} marked${live ? ' live' : ''}`,
        minutes: part === 'between' ? '' : minutes,
        label: `${String(hour)}${minutes}`,
        range: time?.kind === 'range' ? { start: read(time.start), end: read(time.end) } : null,
        marked: part !== 'free',
        moves: part !== 'free' && part !== 'between',
        // A time at its stop is not moved: the same list comes back.
        atFirstQuarter: making || shiftQuarter(day, hour, -1, full) === day,
        atLastQuarter: making || shiftQuarter(day, hour, 1, full) === day,
      };
    });
  });

  /** The day has no time, nor one being drawn. */
  protected readonly empty = computed<boolean>(() => this.rows().every((row) => !row.marked));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('time');
  private readonly rests = viewChildren(LongPress);

  /** The hour the tip points at: the one held, while the focus is on it and the list is still. */
  protected readonly tipHour = computed<HTMLButtonElement | null>(() => {
    const held = this.held();
    if (held === null || held !== this.tabStop() || this.tipLost()) return null;
    return this.buttons()[held]?.nativeElement ?? null;
  });

  /**
   * The row a finger rests on, where its ring closes: over the whole page, since the list and the
   * window on the columns cut what leaves them. An hour between the ends of a range is not held,
   * and has no ring.
   */
  protected readonly ring = computed<RingBox | null>(() => {
    const hour = this.rests().findIndex((rest) => rest.holding());
    const row = this.buttons()[hour]?.nativeElement.parentElement;
    if (!row || this.rows()[hour]?.part === 'between') return null;
    const box = row.getBoundingClientRect();
    return {
      top: box.top,
      left: box.left,
      width: box.width,
      height: box.height,
    };
  });

  /**
   * A press on an hour: the last hour of the range from the hour held, or a press of its own.
   * During a drag it is nothing: the drag ends where the pointer is released.
   */
  protected press(hour: number): void {
    const held = this.held();
    if (held !== null) this.make({ from: held, to: hour });
    else if (!this.making()) this.times.update((times) => pressHour(times, hour, this.full()));
  }

  /** The time of an hour moves a quarter, unless a range is being made. */
  protected move(hour: number, by: -1 | 1): void {
    if (!this.making()) this.times.update((times) => shiftQuarter(times, hour, by, this.full()));
  }

  /**
   * The hour is held as an end of a range; between the ends of one nothing is, nor during a
   * drag.
   */
  protected hold(hour: number): void {
    if (this.making() || markAt(this.times().marked, hour).part === 'between') return;
    this.tipLost.set(false);
    this.held.set(hour);
  }

  /** A drag goes on, or is given up (`null`); it takes the place of an hour held. */
  protected dragged(span: RowDragSpan | null): void {
    this.held.set(null);
    this.drag.set(span);
  }

  /** The range of a drag or of the hour held is made, if it draws one, and nothing is held. */
  protected make(span: RowDragSpan): void {
    const drag = dragHours(this.times(), span.from, span.to, this.full());
    this.drag.set(null);
    this.held.set(null);
    if (drag) this.times.set(drag.times);
  }

  /** The focus leaves the column with an hour held: what is drawn is made. */
  protected left(event: FocusEvent): void {
    const held = this.held();
    if (held === null || this.host.contains(event.relatedTarget as Node | null)) return;
    this.make({ from: held, to: this.tabStop() });
  }

  /** The focus goes to another hour, if the day has it. */
  protected focus(hour: number): void {
    this.buttons()[hour]?.nativeElement.focus();
  }
}

/** `09:30` → "9:30". */
function read(time: string): string {
  return `${String(Number(time.slice(0, 2)))}${time.slice(2)}`;
}

import {
  Component,
  type ElementRef,
  Injector,
  type OnInit,
  afterNextRender,
  computed,
  inject,
  model,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { latestOptionDate } from '@qando/domain';
import { type CalendarWords, calendarWords } from '../../shared/ui/calendar-words';
import { HoldRepeat } from '../../shared/ui/hold-repeat';
import { LongPress } from '../../shared/ui/long-press';
import {
  type DateRange,
  type DateSelection,
  type Drag,
  dragDays,
  hasDates,
  pressDay,
  rangeOn,
  withoutDatesBefore,
} from './date-selection';
import { DayDrag, type DayDragSpan } from './day-drag';
import {
  type DayMove,
  type DaySpan,
  type MonthGrid,
  addMonths,
  monthGrid,
  monthOf,
  monthWithin,
  movedDay,
} from './month-grid';
import { today } from './today';

/** Where a key takes the focus from a day; `null` for the keys the calendar leaves alone. */
function moveOf(key: string): DayMove | null {
  switch (key) {
    case 'ArrowLeft':
      return { days: -1 };
    case 'ArrowRight':
      return { days: 1 };
    case 'ArrowUp':
      return { days: -7 };
    case 'ArrowDown':
      return { days: 7 };
    case 'PageUp':
      return { months: -1 };
    case 'PageDown':
      return { months: 1 };
    default:
      return null;
  }
}

/**
 * Step 2 of the creation wizard, inside its card: one month of a calendar, from today to the last
 * day an event can propose, and the arrows back to step 1 and on to the next step. A press on a
 * free day marks it as a date of its own; a press on a marked day removes it, and on any day of a
 * range, the whole range. The days outside those limits cannot be pressed, and the month arrows,
 * which repeat while held down, stop at their months. Today is read from the clock again when the
 * step is entered and on every use: after midnight the dates marked before the new today are
 * gone, and the calendar is never left on a month before it.
 *
 * A range, days in a row proposed as one option, is made in two ways. A mouse drag from a day to
 * another joins them, also across months (the mouse resting at a side of the days changes the
 * month). Without dragging, a day is held (a finger resting on it, a double-click with a mouse,
 * Shift+Enter) and the press on another day makes the range; meanwhile a text under the calendar
 * asks for the last day, the month can change, and Escape lets go. Begun on the first or the last
 * day of a range, both ways move that end. The day held, pressed again or left held when going
 * on to the next step, stays as a date of its own.
 *
 * The page holds the dates and the month on screen, so both outlive the step folding away. With
 * the keyboard, Tab reaches one day (the one used last), the arrow keys move by day and by week,
 * into the next month too, PageUp and PageDown change the month, and Enter or Space press the
 * day. Until a date is marked the arrow to the next step, still in the Tab order, does nothing
 * and tells screen readers why.
 */
@Component({
  selector: 'app-wizard-dates',
  imports: [DayDrag, HoldRepeat, LongPress, TranslocoPipe],
  styleUrl: './wizard-dates.scss',
  templateUrl: './wizard-dates.html',
  host: {
    '(document:keydown.escape)': 'held.set(null)',
    '(pointerdown)': 'lastPointer = $event.pointerType',
  },
})
export class WizardDates implements OnInit {
  /** The dates marked so far. */
  readonly selection = model.required<DateSelection>();
  /** The month on screen, as `YYYY-MM`. */
  readonly month = model.required<string>();
  /** The organizer goes back to step 1. */
  readonly back = output();
  /** Some date is marked and the organizer goes on. */
  readonly next = output();

  private readonly injector = inject(Injector);
  protected readonly words: CalendarWords = calendarWords(inject(TranslocoService).getActiveLang());
  /** Today, as the clock said when it was last read: the first day that can be proposed. */
  private readonly firstDay = signal<string>(today());
  private readonly eligible = computed<DaySpan>(() => eligibleFrom(this.firstDay()));

  /** The first day of a range being made without dragging: held, its last day not chosen yet. */
  protected readonly held = signal<string | null>(null);
  /** The mouse drag going on, as the days it is between. */
  private readonly mouseDrag = signal<DayDragSpan | null>(null);
  /** The range being made, by the mouse or from the day held; `null` without one. */
  private readonly drag = computed<Drag | null>(() => {
    const held = this.held();
    const span = this.mouseDrag() ?? (held === null ? null : { from: held, to: held });
    return span && dragDays(this.selection(), span.from, span.to);
  });
  /** A range is being made: meanwhile no marked day answers the mouse. */
  protected readonly making = computed<boolean>(() => this.drag() !== null);
  /** The drag goes to an earlier day: its arrow is drawn at the start of the row. */
  protected readonly backward = computed<boolean>(() => {
    const drag = this.drag();
    return drag !== null && drag.anchor !== drag.first;
  });

  protected readonly grid = computed<MonthGrid>(() =>
    monthGrid(this.month(), this.eligible(), this.selection(), this.drag()),
  );
  protected readonly blanks = computed<undefined[]>(() =>
    Array.from({ length: this.grid().leadingBlanks }),
  );
  protected readonly atFirstMonth = computed<boolean>(
    () => this.month() <= monthOf(this.eligible().first),
  );
  protected readonly atLastMonth = computed<boolean>(
    () => this.month() >= monthOf(this.eligible().last),
  );
  /** No date is marked, nor would the range being made leave one. */
  protected readonly empty = computed<boolean>(
    () => !hasDates(this.drag()?.result ?? this.selection()),
  );

  /** The day the mouse is over. */
  protected readonly hovered = signal<string | null>(null);
  /** The range under the mouse, lit whole; none while a range is being made. */
  protected readonly lit = computed<DateRange | null>(() => {
    const hovered = this.hovered();
    if (hovered === null || this.drag()) return null;
    return rangeOn(this.selection(), hovered) ?? null;
  });

  /** "Julio 2026": the month on screen, as the calendar's title. */
  protected readonly title = computed<string>(() => this.words.monthTitle(this.month()));

  /** The day used last, by the keyboard or a pointer: the day with the focus, or about to get it. */
  protected readonly lastUsed = signal<string | null>(null);
  /** The one day in the Tab order: the day used last while it is on screen, or the first free. */
  protected readonly tabStop = computed<string | null>(() => {
    const days = this.grid().days.filter(({ state }) => state !== 'off');
    const lastUsed = days.find(({ date }) => date === this.lastUsed());
    return (lastUsed ?? days[0])?.date ?? null;
  });

  private readonly dayButtons = viewChildren<ElementRef<HTMLButtonElement>>('dayButton');

  /** How the last pointer touched the step: a double tap is not a double-click. */
  protected lastPointer = '';
  /** The day pressed last and the dates before that press: a double-click takes it back. */
  private beforePress: { readonly date: string; readonly selection: DateSelection } | null = null;

  /** The step is entered: the required models can be read from here on. */
  ngOnInit(): void {
    this.rereadToday();
  }

  /** A click on a day: the last day of the range from the day held, or a press on its own. */
  protected press(date: string, click: MouseEvent): void {
    // The second click of a mouse's double-click: the first has pressed the day already.
    if (click.detail > 1 && this.lastPointer === 'mouse') return;
    this.rereadToday();
    // The day was drawn before midnight: it is yesterday now.
    if (date < this.firstDay()) return;
    const held = this.held();
    if (held !== null) {
      this.choose(held, date);
      return;
    }
    this.beforePress = { date, selection: this.selection() };
    this.selection.update((selection) => pressDay(selection, date));
  }

  /**
   * A mouse's double-click holds the day: its first click, which marked or removed the day, is
   * taken back. Not when that click chose the last day of a range, nor on a day that cannot be
   * held, where the double-click stays a click.
   */
  protected doubleClicked(date: string): void {
    const before = this.beforePress;
    if (this.lastPointer !== 'mouse' || before?.date !== date) return;
    if (!dragDays(before.selection, date, date)) return;
    this.selection.set(before.selection);
    this.hold(date);
  }

  /** The day becomes the first of a range; a day between the ends of a range holds nothing. */
  protected hold(date: string): void {
    this.rereadToday();
    if (date >= this.firstDay() && dragDays(this.selection(), date, date)) this.held.set(date);
  }

  /** A mouse drag goes on, or is given up (`null`); it takes the place of a day held. */
  protected dragged(span: DayDragSpan | null): void {
    this.held.set(null);
    this.mouseDrag.set(span);
  }

  /** The mouse is released: the drag's days are the dates, unless one is yesterday by now. */
  protected dropped({ from, to }: DayDragSpan): void {
    this.mouseDrag.set(null);
    this.beforePress = null;
    this.rereadToday();
    const first = this.firstDay();
    const drag = from >= first && to >= first ? dragDays(this.selection(), from, to) : null;
    if (drag) this.selection.set(drag.result);
  }

  /** A month arrow: one month back or forward, never past the first or the last month. */
  protected page(months: -1 | 1): void {
    // From the month on screen, also when today's month has changed under it.
    const wanted = addMonths(this.month(), months);
    this.rereadToday();
    this.month.set(monthWithin(wanted, this.eligible()));
  }

  /** A key on a day: the arrows and the page keys take the focus to another day. */
  protected keyed(event: KeyboardEvent, date: string): void {
    this.rereadToday();
    const move = moveOf(event.key);
    if (!move) return;
    // The page does not scroll under the calendar.
    event.preventDefault();
    // A held key repeats before the focus has moved: each press goes on from the last one's day.
    const target = movedDay(this.lastUsed() ?? date, move, this.eligible());
    this.lastUsed.set(target);
    this.month.set(monthOf(target));
    // Its button exists once its month is drawn.
    afterNextRender(
      () => {
        this.dayButtons()
          .find(({ nativeElement }) => nativeElement.dataset['date'] === target)
          ?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  protected goOn(): void {
    this.rereadToday();
    // A day still held goes on as when it is pressed again: a date of its own.
    const held = this.held();
    if (held !== null) this.choose(held, held);
    if (!this.empty()) this.next.emit();
  }

  /** The range from the day held ends on `last`. */
  private choose(held: string, last: string): void {
    const drag = dragDays(this.selection(), held, last);
    this.held.set(null);
    this.beforePress = null;
    if (drag) this.selection.set(drag.result);
  }

  /**
   * The clock is read on every use: after midnight today is another day, and the dates before it
   * are gone, as is a day held before it.
   */
  private rereadToday(): void {
    const first = today();
    this.firstDay.set(first);
    this.selection.update((selection) => withoutDatesBefore(selection, first));
    this.month.update((month) => monthWithin(month, this.eligible()));
    const held = this.held();
    if (held !== null && held < first) this.held.set(null);
  }
}

/** Today and every day up to the last one an event created today can propose. */
function eligibleFrom(first: string): DaySpan {
  return { first, last: latestOptionDate(first) };
}

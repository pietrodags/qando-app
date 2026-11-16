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
import { type DateSelection, hasDates, pressDay, withoutDatesBefore } from './date-selection';
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
 * free day marks it as a date of its own; a press on a marked day removes it. The days outside
 * those limits cannot be pressed, and the month arrows stop at their months. Today is read from
 * the clock again when the step is entered and on every use: after midnight the dates marked
 * before the new today are gone, and the calendar is never left on a month before it.
 *
 * The page holds the dates and the month on screen, so both outlive the step folding away. With
 * the keyboard, Tab reaches one day (the one used last), the arrow keys move by day and by week,
 * into the next month too, PageUp and PageDown change the month, and Enter or Space press the
 * day. Until a date is marked the arrow to the next step, still in the Tab order, does nothing
 * and tells screen readers why.
 */
@Component({
  selector: 'app-wizard-dates',
  imports: [TranslocoPipe],
  styleUrl: './wizard-dates.scss',
  templateUrl: './wizard-dates.html',
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

  protected readonly grid = computed<MonthGrid>(() =>
    monthGrid(this.month(), this.eligible(), this.selection()),
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
  protected readonly empty = computed<boolean>(() => !hasDates(this.selection()));

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

  /** The step is entered: the required models can be read from here on. */
  ngOnInit(): void {
    this.rereadToday();
  }

  protected press(date: string): void {
    this.rereadToday();
    // The day was drawn before midnight: it is yesterday now.
    if (date >= this.firstDay()) this.selection.update((selection) => pressDay(selection, date));
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
    if (!this.empty()) this.next.emit();
  }

  /**
   * The clock is read on every use: after midnight today is another day, and the dates before it
   * are gone.
   */
  private rereadToday(): void {
    const first = today();
    this.firstDay.set(first);
    this.selection.update((selection) => withoutDatesBefore(selection, first));
    this.month.update((month) => monthWithin(month, this.eligible()));
  }
}

/** Today and every day up to the last one an event created today can propose. */
function eligibleFrom(first: string): DaySpan {
  return { first, last: latestOptionDate(first) };
}

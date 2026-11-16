import {
  Component,
  type ElementRef,
  Injector,
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
import { type DateSelection, hasDates, pressDay } from './date-selection';
import {
  type DayMove,
  type DaySpan,
  type MonthGrid,
  addMonths,
  monthGrid,
  monthOf,
  movedDay,
} from './month-grid';
import { today } from './today';

// A Monday, to name the weekdays from Monday on.
const A_MONDAY = Date.UTC(2024, 0, 1);
const DAY_MS = 86_400_000;

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
 * those limits cannot be pressed, and the month arrows stop at their months.
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
export class WizardDates {
  /** The dates marked so far. */
  readonly selection = model.required<DateSelection>();
  /** The month on screen, as `YYYY-MM`. */
  readonly month = model.required<string>();
  /** The organizer goes back to step 1. */
  readonly back = output();
  /** Some date is marked and the organizer goes on. */
  readonly next = output();

  private readonly injector = inject(Injector);
  private readonly locale = inject(TranslocoService).getActiveLang();
  private readonly eligible = eligibleFrom(today());

  protected readonly grid = computed<MonthGrid>(() =>
    monthGrid(this.month(), this.eligible, this.selection()),
  );
  protected readonly blanks = computed<undefined[]>(() =>
    Array.from({ length: this.grid().leadingBlanks }),
  );
  protected readonly atFirstMonth = computed<boolean>(
    () => this.month() <= monthOf(this.eligible.first),
  );
  protected readonly atLastMonth = computed<boolean>(
    () => this.month() >= monthOf(this.eligible.last),
  );
  protected readonly empty = computed<boolean>(() => !hasDates(this.selection()));

  /** "Julio 2026": the month's name, capitalised as a title, and its year. */
  protected readonly title = computed<string>(() => {
    const first = Date.parse(`${this.month()}-01`);
    const name = new Intl.DateTimeFormat(this.locale, { month: 'long', timeZone: 'UTC' }).format(
      first,
    );
    return `${name.charAt(0).toLocaleUpperCase(this.locale)}${name.slice(1)} ${this.month().slice(0, 4)}`;
  });

  /** The day used last, by the keyboard or a pointer. */
  protected readonly lastUsed = signal<string | null>(null);
  /** The one day in the Tab order: the day used last while it is on screen, or the first free. */
  protected readonly tabStop = computed<string | null>(() => {
    const days = this.grid().days.filter(({ state }) => state !== 'off');
    const lastUsed = days.find(({ date }) => date === this.lastUsed());
    return (lastUsed ?? days[0])?.date ?? null;
  });

  private readonly dayButtons = viewChildren<ElementRef<HTMLButtonElement>>('dayButton');
  private readonly dayFormat = new Intl.DateTimeFormat(this.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  protected readonly weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(this.locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
      A_MONDAY + index * DAY_MS,
    ),
  );

  /** "lunes, 6 de julio": a date-only ISO string is read as UTC, as it is shown. */
  protected dayName(date: string): string {
    return this.dayFormat.format(Date.parse(date));
  }

  protected press(date: string): void {
    this.selection.update((selection) => pressDay(selection, date));
  }

  /** A month arrow: one month back or forward, never past the first or the last month. */
  protected page(months: -1 | 1): void {
    const stopped = months < 0 ? this.atFirstMonth() : this.atLastMonth();
    if (!stopped) this.month.update((month) => addMonths(month, months));
  }

  /** A key on a day: the arrows and the page keys take the focus to another day. */
  protected keyed(event: KeyboardEvent, date: string): void {
    const move = moveOf(event.key);
    if (!move) return;
    // The page does not scroll under the calendar.
    event.preventDefault();
    const target = movedDay(date, move, this.eligible);
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
    if (!this.empty()) this.next.emit();
  }
}

/** Today and every day up to the last one an event created today can propose. */
function eligibleFrom(first: string): DaySpan {
  return { first, last: latestOptionDate(first) };
}

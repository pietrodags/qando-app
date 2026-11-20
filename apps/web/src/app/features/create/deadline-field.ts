import {
  Component,
  type ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { type OptionDates, latestOptionDate } from '@qando/domain';
import { type CalendarWords, calendarWords } from '../../shared/ui/calendar-words';
import { type DateSelection, NO_DATES, proposedOptions } from './date-selection';
import { daysFrom } from './days-from';
import {
  type DayMove,
  type DaySpan,
  addMonths,
  monthGrid,
  monthOf,
  monthWithin,
  movedDay,
} from './month-grid';
import { today } from './today';

/** A day of the month on screen, as it is drawn. */
interface DeadlineDay {
  readonly date: string;
  readonly day: number;
  /** Before today or after the last day a deadline can be: it cannot be chosen. */
  readonly off: boolean;
  /** One of the days the dates propose: ringed. */
  readonly proposed: boolean;
  /** The deadline: filled. */
  readonly chosen: boolean;
  /** The ids of the legend's lines that tell what the day is; `null` for a day that is nothing. */
  readonly legend: string | null;
}

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
 * The deadline of an event, chosen on a calendar: a field, named by the label given as its
 * content and by the day it shows ("vie 27 nov 2026"), unfolds under it a month of a calendar
 * drawn as the wizard's dates are, which pushes down what comes after it. The days from today to
 * the last one an event can propose can be chosen (`latestOptionDate`); the days the dates
 * propose have a green ring and the deadline is filled, as the legend under the calendar says
 * and screen readers hear with each day. A day pressed is the deadline and folds the calendar;
 * the field pressed again, or Escape, folds it unchanged; either way the focus is back on the
 * field. The calendar unfolds on the deadline's month. With the keyboard, Tab reaches one day
 * (the one used last, the deadline, or else the first that can be chosen), the arrow keys move
 * by day and by week, into the next month too, PageUp and PageDown change the month, and Enter
 * or Space press the day. Today is read from the clock each time the calendar unfolds and on
 * every use.
 */
@Component({
  selector: 'app-deadline-field',
  imports: [TranslocoPipe],
  styleUrl: './deadline-field.scss',
  templateUrl: './deadline-field.html',
  host: { '(keydown.escape)': 'fold()' },
})
export class DeadlineField {
  /** The deadline, as `YYYY-MM-DD`. */
  readonly value = model.required<string>();
  /** The dates the event proposes: their days are ringed on the calendar. */
  readonly proposed = input.required<DateSelection>();

  private readonly injector = inject(Injector);
  protected readonly words: CalendarWords = calendarWords(inject(TranslocoService).getActiveLang());

  /** The calendar is unfolded. */
  protected readonly open = signal(false);
  /** The month on screen, as `YYYY-MM`. */
  protected readonly month = signal('');
  /** Today, as the clock said when it was last read: the first day that can be chosen. */
  private readonly firstDay = signal<string>(today());
  private readonly eligible = computed<DaySpan>(() => ({
    first: this.firstDay(),
    last: latestOptionDate(this.firstDay()),
  }));

  /** Every day the dates propose, of their own, in ranges and in saved ranges. */
  private readonly proposedDays = computed<ReadonlySet<string>>(
    () => new Set(proposedOptions(this.proposed()).flatMap(({ dates }) => daysOf(dates))),
  );
  private readonly grid = computed(() => monthGrid(this.month(), this.eligible(), NO_DATES));
  protected readonly blanks = computed<undefined[]>(() =>
    Array.from({ length: this.grid().leadingBlanks }),
  );
  protected readonly days = computed<readonly DeadlineDay[]>(() =>
    this.grid().days.map(({ date, day, state }) => {
      const proposed = this.proposedDays().has(date);
      const chosen = date === this.value();
      const lines = [
        ...(proposed ? ['deadline-proposed'] : []),
        ...(chosen ? ['deadline-chosen'] : []),
      ];
      return {
        date,
        day,
        off: state === 'off',
        proposed,
        chosen,
        legend: lines.length > 0 ? lines.join(' ') : null,
      };
    }),
  );
  /** "Noviembre 2026": the month on screen, as the calendar's title. */
  protected readonly title = computed<string>(() => this.words.monthTitle(this.month()));
  protected readonly atFirstMonth = computed<boolean>(
    () => this.month() <= monthOf(this.eligible().first),
  );
  protected readonly atLastMonth = computed<boolean>(
    () => this.month() >= monthOf(this.eligible().last),
  );

  /** The day used last with the keyboard or a pointer, while the calendar is unfolded. */
  protected readonly lastUsed = signal<string | null>(null);
  /** The one day in the Tab order: the day used last, the deadline, or the first that can be. */
  protected readonly tabStop = computed<string | null>(() => {
    const days = this.days().filter(({ off }) => !off);
    const found = (date: string | null) => days.find((day) => day.date === date);
    return (found(this.lastUsed()) ?? found(this.value()) ?? days[0])?.date ?? null;
  });

  private readonly field = viewChild.required<ElementRef<HTMLButtonElement>>('field');
  private readonly dayButtons = viewChildren<ElementRef<HTMLButtonElement>>('dayButton');

  /** The field: unfolds the calendar on the deadline's month, or folds it. */
  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.rereadToday();
    this.lastUsed.set(null);
    this.month.set(monthWithin(monthOf(this.value()), this.eligible()));
    this.open.set(true);
  }

  /** Escape: the calendar folds unchanged, the focus back on the field. */
  protected fold(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.field().nativeElement.focus();
  }

  /** A day pressed: it is the deadline, and the calendar folds. */
  protected choose(date: string): void {
    this.rereadToday();
    // The day was drawn before midnight: it is yesterday now.
    if (date < this.firstDay()) return;
    this.value.set(date);
    this.fold();
  }

  /** A month arrow: one month back or forward, never past the first or the last month. */
  protected page(months: -1 | 1): void {
    const wanted = addMonths(this.month(), months);
    this.rereadToday();
    this.month.set(monthWithin(wanted, this.eligible()));
  }

  /** A key on a day: the arrows and the page keys take the focus to another day. */
  protected keyed(event: KeyboardEvent, date: string): void {
    const move = moveOf(event.key);
    if (!move) return;
    // The page does not scroll under the calendar.
    event.preventDefault();
    this.rereadToday();
    // A held key repeats before the focus has moved: each press goes on from the last one's day.
    const target = movedDay(this.lastUsed() ?? date, move, this.eligible());
    this.month.set(monthOf(target));
    this.lastUsed.set(target);
    afterNextRender(
      () => {
        this.dayButtons()
          .find(({ nativeElement }) => nativeElement.dataset['date'] === target)
          ?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  /** Today is read again: after midnight, yesterday can no longer be chosen. */
  private rereadToday(): void {
    this.firstDay.set(today());
  }
}

/** The days of an option's dates, both ends of a range included. */
function daysOf(dates: OptionDates): string[] {
  if (dates.kind === 'single') return [dates.date];
  const days: string[] = [];
  for (let day = dates.start; day <= dates.end; day = daysFrom(day, 1)) days.push(day);
  return days;
}

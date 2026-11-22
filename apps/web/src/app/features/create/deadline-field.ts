import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  model,
  type WritableSignal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { latestOptionDate } from '@qando/domain';
import { type CalendarWords, calendarWords } from '../../shared/ui/calendar-words';
import { NO_DATES } from './date-selection';
import { type DatePart, type DaySpan, monthGrid, withPart } from './month-grid';
import { today } from './today';

/** A date in its three parts, as its selects show them. */
interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** A month a select offers: its number and its name ("noviembre"). */
interface MonthChoice {
  readonly month: number;
  readonly name: string;
}

/**
 * The deadline of an event, chosen with three selects, its day, its month and its year, named
 * together by the element of the page given (`labelledBy`, its ID). They offer only the dates that can be chosen, from
 * today to the last one an event can propose (`latestOptionDate`): the days of the month shown,
 * the months of the year shown and the years between. A part chosen that leaves the date out
 * (31 January to February, December to a year that ends in November) moves it to the nearest
 * date that can be chosen. Today is read from the clock when a select is reached and on every
 * choice, in the time zone given (the event's, once it exists) or else the person's own; a
 * deadline that became yesterday at midnight is still shown, and offered, until another one is
 * chosen.
 */
@Component({
  selector: 'app-deadline-field',
  imports: [NgTemplateOutlet, TranslocoPipe],
  styleUrl: './deadline-field.scss',
  templateUrl: './deadline-field.html',
})
export class DeadlineField {
  /** The deadline, as `YYYY-MM-DD`. */
  readonly value = model.required<string>();
  /** The ID of what names the three selects together: the question or help line over them. */
  readonly labelledBy = input.required<string>();
  /** The zone whose clocks say what today is; the person's own without one. */
  readonly timeZone = input<string>();

  protected readonly words: CalendarWords = calendarWords(inject(TranslocoService).getActiveLang());

  /** Today, as the clock said when it was last read. */
  // Typed on the field: what the template reads keeps its type whatever a mutant does inside.
  private readonly firstDay: WritableSignal<string> = linkedSignal<string | undefined, string>({
    source: () => this.timeZone(),
    computation: (zone) => today(zone),
  });
  /** What the selects offer: from today, or from a deadline left behind by midnight. */
  private readonly span = computed<DaySpan>(() => {
    const now = this.firstDay();
    return { first: this.value() < now ? this.value() : now, last: latestOptionDate(now) };
  });

  /** The deadline's parts, as the selects show them chosen. */
  protected readonly chosen = computed<DateParts>(() => partsOf(this.value()));
  protected readonly years = computed<number[]>(() =>
    between(partsOf(this.span().first).year, partsOf(this.span().last).year),
  );
  protected readonly months = computed<MonthChoice[]>(() => {
    const { year } = this.chosen();
    const first = partsOf(this.span().first);
    const last = partsOf(this.span().last);
    return between(year === first.year ? first.month : 1, year === last.year ? last.month : 12).map(
      (month) => ({ month, name: this.words.monthName(`${String(year)}-${twoDigits(month)}`) }),
    );
  });
  /** The days of the month shown that can be chosen. */
  protected readonly days = computed<number[]>(() =>
    monthGrid(this.value().slice(0, 7), this.span(), NO_DATES)
      .days.filter(({ state }) => state !== 'off')
      .map(({ day }) => day),
  );

  /** A part chosen in its select: the deadline with it, or the nearest date that can be chosen. */
  protected choose(part: DatePart, picked: string): void {
    this.rereadToday();
    const first = this.firstDay();
    this.value.set(
      withPart(this.value(), part, Number(picked), { first, last: latestOptionDate(first) }),
    );
  }

  /** Today is read again: after midnight, yesterday is no longer offered. */
  protected rereadToday(): void {
    this.firstDay.set(today(this.timeZone()));
  }
}

function partsOf(date: string): DateParts {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/** The whole numbers from `first` to `last`, both included. */
function between(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

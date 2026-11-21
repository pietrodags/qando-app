import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, model, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { latestOptionDate } from '@qando/domain';
import { type CalendarWords, calendarWords } from '../../shared/ui/calendar-words';
import { type DaySpan } from './month-grid';
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
 * together by the label given as its content. They offer only the dates that can be chosen, from
 * today to the last one an event can propose (`latestOptionDate`): the days of the month shown,
 * the months of the year shown and the years between. A part chosen that leaves the date out
 * (31 January to February, December to a year that ends in November) moves it to the nearest
 * date that can be chosen. Today is read from the clock when a select is reached and on every
 * choice; a deadline that became yesterday at midnight is still shown, and offered, until
 * another one is chosen.
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

  protected readonly words: CalendarWords = calendarWords(inject(TranslocoService).getActiveLang());

  /** Today, as the clock said when it was last read. */
  private readonly firstDay = signal<string>(today());
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
  protected readonly days = computed<number[]>(() => {
    const { year, month } = this.chosen();
    const first = partsOf(this.span().first);
    const last = partsOf(this.span().last);
    const sameMonth = (parts: DateParts): boolean => parts.year === year && parts.month === month;
    return between(
      sameMonth(first) ? first.day : 1,
      sameMonth(last) ? last.day : daysIn(year, month),
    );
  });

  /** A part chosen in its select: the deadline with it, or the nearest date that can be chosen. */
  protected choose(part: keyof DateParts, picked: string): void {
    this.rereadToday();
    const parts: DateParts = { ...this.chosen(), ...{ [part]: Number(picked) } };
    const { year, month, day } = parts;
    const date = `${String(year)}-${twoDigits(month)}-${twoDigits(Math.min(day, daysIn(year, month)))}`;
    const first = this.firstDay();
    const last = latestOptionDate(first);
    this.value.set(date < first ? first : date > last ? last : date);
  }

  /** Today is read again: after midnight, yesterday is no longer offered. */
  protected rereadToday(): void {
    this.firstDay.set(today());
  }
}

function partsOf(date: string): DateParts {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/** The days of a month, 28 to 31. */
function daysIn(year: number, month: number): number {
  // Day 0 of the next month is the month's last day.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The whole numbers from `first` to `last`, both included. */
function between(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

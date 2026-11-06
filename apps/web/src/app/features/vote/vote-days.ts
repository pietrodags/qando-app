import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Option } from '@qando/contracts';
import type { VoteState } from '@qando/domain';
import { LongPress } from '../../shared/ui/long-press';
import { type Answers, dayState, dayToggled, toggled, withPreferred } from './answers';
import { type CalendarMonth, calendarMonths } from './calendar-months';

/** Touch screens get the touch instructions; a mouse keeps the double-click ones. */
const TOUCH_QUERY = '(pointer: coarse)';

const STATES: readonly VoteState[] = ['available', 'preferred', 'unavailable'];
// With times the preferred answer is given to a time, in step 3.
const DAY_STATES: readonly VoteState[] = ['available', 'unavailable'];

// A Monday, to name the weekdays from Monday on.
const A_MONDAY = Date.UTC(2024, 0, 1);
const DAY_MS = 86_400_000;

let nextHintId = 0;

/**
 * Step 2 of the voting page: a calendar, a month at a time, where the voter answers each
 * proposed day. A tap or click toggles available ↔ unavailable; the preferred day (one at most)
 * is chosen by a long-press on touch, a double-click with a mouse or Shift+Enter. A range is one
 * option: any of its days answers it. Back leaves through the first month, and the check on the
 * last month says the days are answered.
 *
 * In an event with times, a day stands for all of its times: it is unavailable when every one of
 * them is, a tap turns them all unavailable or all available again, and the preferred answer is
 * left to the times. The last month then goes on to them, unless no day is possible.
 */
@Component({
  selector: 'app-vote-days',
  imports: [LongPress, TranslocoPipe],
  styleUrl: './vote-days.scss',
  templateUrl: './vote-days.html',
})
export class VoteDays {
  /** The event's options, in chronological order. */
  readonly options = input.required<readonly Option[]>();
  /** One answer per option, shared with the page. */
  readonly answers = model.required<Answers>();
  /** Back from the first month: to step 1. */
  readonly back = output();
  /** The check on the last month: the days are answered. */
  readonly done = output();
  /** The arrow on the last month of an event with times: on to choose the times. */
  readonly toTimes = output();

  private readonly locale = inject(TranslocoService).getActiveLang();

  protected readonly touch = window.matchMedia(TOUCH_QUERY).matches;
  private readonly withTimes = computed(() => this.options().some(({ time }) => time !== null));
  protected readonly states = computed(() => (this.withTimes() ? DAY_STATES : STATES));
  protected readonly instructions = computed(() => {
    if (this.withTimes()) {
      return this.touch
        ? 'vote.days.instructionsWithTimesTouch'
        : 'vote.days.instructionsWithTimesMouse';
    }
    return this.touch ? 'vote.days.instructionsTouch' : 'vote.days.instructionsMouse';
  });
  protected readonly keyboardHint = computed(() =>
    this.withTimes() ? 'vote.days.keyboardHintWithTimes' : 'vote.days.keyboardHint',
  );
  /** The last month goes on to the times: the event has them and some day is possible. */
  protected readonly goesToTimes = computed(
    () => this.withTimes() && this.options().some(({ id }) => this.answers()[id] !== 'unavailable'),
  );
  protected readonly hintId = `vote-days-hint-${String((nextHintId += 1))}`;
  protected readonly weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(this.locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
      A_MONDAY + index * DAY_MS,
    ),
  );
  /** How the last pointer touched the calendar: a double tap is not a double-click. */
  protected lastPointer = '';

  protected readonly months = computed(() => calendarMonths(this.options()));
  // The template only reads plain values of computed signals: a mutant that makes one return
  // nothing must still compile.
  protected readonly pageCount = computed(() => this.months().length);
  protected readonly severalPages = computed(() => this.pageCount() > 1);
  protected readonly page = signal(0);
  /** The option under the mouse: all of its days lift together. */
  protected readonly hovered = signal<string | null>(null);
  protected readonly month = computed(() => this.months()[this.page()]);
  protected readonly isLastPage = computed(() => this.page() >= this.pageCount() - 1);
  private readonly dayFormat = new Intl.DateTimeFormat(this.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  /** "Julio 2026": the month's name, capitalised as a title, and its year. */
  protected monthTitle(month: CalendarMonth): string {
    const name = new Intl.DateTimeFormat(this.locale, { month: 'long', timeZone: 'UTC' }).format(
      Date.UTC(month.year, month.month - 1, 1),
    );
    return `${name.charAt(0).toLocaleUpperCase(this.locale)}${name.slice(1)} ${String(month.year)}`;
  }

  protected blanksOf(month: CalendarMonth): undefined[] {
    return Array.from({ length: month.leadingBlanks });
  }

  /** "lunes, 6 de julio": a date-only ISO string is read as UTC, as it is shown. */
  protected dayName(date: string): string {
    return this.dayFormat.format(Date.parse(date));
  }

  /** The answer a day shows: its option's, or, with times, the one its times make. */
  protected stateOf(optionIds: readonly string[]): VoteState | undefined {
    const [first = ''] = optionIds;
    return this.withTimes() ? dayState(this.answers(), optionIds) : this.answers()[first];
  }

  protected toggle(optionIds: readonly string[]): void {
    const [first = ''] = optionIds;
    this.answers.update((answers) =>
      this.withTimes() ? dayToggled(answers, optionIds) : toggled(answers, first),
    );
  }

  protected prefer(optionIds: readonly string[]): void {
    const [first = ''] = optionIds;
    if (!this.withTimes()) this.answers.update((answers) => withPreferred(answers, first));
  }

  protected goBack(): void {
    if (this.page() > 0) this.page.update((page) => page - 1);
    else this.back.emit();
  }

  protected goForward(): void {
    if (!this.isLastPage()) this.page.update((page) => page + 1);
    else if (this.goesToTimes()) this.toTimes.emit();
    else this.done.emit();
  }
}

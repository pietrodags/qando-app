import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Option } from '@qando/contracts';
import type { VoteState } from '@qando/domain';
import { LongPress } from '../../shared/ui/long-press';
import { type Answers, toggled, withPreferred } from './answers';
import { type CalendarMonth, calendarMonths } from './calendar-months';

/** Touch screens get the touch instructions; a mouse keeps the double-click ones. */
const TOUCH_QUERY = '(pointer: coarse)';

const STATES: readonly VoteState[] = ['available', 'preferred', 'unavailable'];

// A Monday, to name the weekdays from Monday on.
const A_MONDAY = Date.UTC(2024, 0, 1);
const DAY_MS = 86_400_000;

let nextHintId = 0;

/**
 * Step 2 of the voting page for events without times: a calendar, a month at a time, where the
 * voter answers each proposed day. A tap or click toggles available ↔ unavailable; the preferred
 * day (one at most) is chosen by a long-press on touch, a double-click with a mouse or
 * Shift+Enter. A range is one option: any of its days answers it. Back leaves through the first
 * month, and the check on the last month says the days are answered.
 */
@Component({
  selector: 'app-vote-days',
  imports: [LongPress, TranslocoPipe],
  styleUrl: './vote-days.scss',
  template: `
    <p class="instructions">
      {{ (touch ? 'vote.days.instructionsTouch' : 'vote.days.instructionsMouse') | transloco }}
    </p>
    <ul class="legend">
      @for (state of states; track state) {
        <li>
          <span class="swatch {{ state }}"></span>{{ 'vote.days.state.' + state | transloco }}
        </li>
      }
    </ul>
    <p class="visually-hidden" [id]="hintId">{{ 'vote.days.keyboardHint' | transloco }}</p>

    @if (month(); as month) {
      <div class="calendar">
        <h2 class="month">{{ monthTitle(month) }}</h2>
        <div class="grid" (pointerdown)="lastPointer = $event.pointerType">
          @for (weekday of weekdays; track $index) {
            <span class="weekday" aria-hidden="true">{{ weekday }}</span>
          }
          @for (blank of blanksOf(month); track $index) {
            <span class="blank"></span>
          }
          @for (day of month.days; track day.date) {
            @if (day.optionId; as optionId) {
              <button
                type="button"
                class="day {{ answers()[optionId] }}"
                [class.joins-previous]="day.joinsPrevious"
                [class.joins-next]="day.joinsNext"
                [class.cut-before]="day.cutBefore"
                [class.cut-after]="day.cutAfter"
                [attr.aria-label]="
                  dayName(day.date) + ': ' + ('vote.days.state.' + answers()[optionId] | transloco)
                "
                [attr.aria-describedby]="hintId"
                appLongPress
                (longPress)="prefer(optionId)"
                (click)="toggle(optionId)"
                (dblclick)="lastPointer === 'touch' || prefer(optionId)"
                (keydown.shift.enter)="$event.preventDefault(); prefer(optionId)"
              >
                {{ day.day }}
              </button>
            } @else {
              <span class="day">{{ day.day }}</span>
            }
          }
        </div>
      </div>
    } @else {
      <p class="no-dates">{{ 'vote.days.noDates' | transloco }}</p>
    }

    <nav class="nav">
      <button
        type="button"
        class="nav-button"
        [attr.aria-label]="(page() > 0 ? 'vote.days.previousMonth' : 'vote.days.back') | transloco"
        (click)="goBack()"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <!-- Heroicons outline: chevron-left / arrow-left -->
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            [attr.d]="
              page() > 0 ? 'M15.75 19.5 8.25 12l7.5-7.5' : 'M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18'
            "
          />
        </svg>
      </button>
      @if (severalPages()) {
        <span class="page-indicator" [class.last]="isLastPage()">
          {{ page() + 1 }} / {{ pageCount() }}
        </span>
      }
      <button
        type="button"
        class="nav-button"
        [attr.aria-label]="(isLastPage() ? 'vote.days.done' : 'vote.days.nextMonth') | transloco"
        (click)="goForward()"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <!-- Heroicons outline: check / chevron-right -->
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            [attr.d]="isLastPage() ? 'm4.5 12.75 6 6 9-13.5' : 'm8.25 4.5 7.5 7.5-7.5 7.5'"
          />
        </svg>
      </button>
    </nav>
  `,
})
export class VoteDays {
  /** The event's options, in chronological order; none of them has a time. */
  readonly options = input.required<readonly Option[]>();
  /** One answer per option, shared with the page. */
  readonly answers = model.required<Answers>();
  /** Back from the first month: to step 1. */
  readonly back = output();
  /** The check on the last month: the days are answered. */
  readonly done = output();

  private readonly locale = inject(TranslocoService).getActiveLang();

  protected readonly touch = window.matchMedia(TOUCH_QUERY).matches;
  protected readonly states = STATES;
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

  protected toggle(optionId: string): void {
    this.answers.update((answers) => toggled(answers, optionId));
  }

  protected prefer(optionId: string): void {
    this.answers.update((answers) => withPreferred(answers, optionId));
  }

  protected goBack(): void {
    if (this.page() > 0) this.page.update((page) => page - 1);
    else this.back.emit();
  }

  protected goForward(): void {
    if (this.isLastPage()) this.done.emit();
    else this.page.update((page) => page + 1);
  }
}

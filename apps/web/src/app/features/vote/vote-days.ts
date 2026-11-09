import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Option } from '@qando/contracts';
import type { VoteState } from '@qando/domain';
import { chipLabel, DateChip } from '../../shared/ui/date-chip';
import { Dialog } from '../../shared/ui/dialog';
import { LongPress } from '../../shared/ui/long-press';
import { Tooltip } from '../../shared/ui/tooltip';
import { type Answers, dayState, dayToggled, toggled, withPreferred } from './answers';
import {
  type CalendarDay,
  type CalendarMonth,
  type DateChoice,
  type DayGrid,
  type Overlap,
  type Shape,
  calendarMonths,
  shapeIn,
  stripOf,
} from './calendar-months';
import { type HourPreview, hourPreview } from './hour-preview';

/** Touch screens get the touch instructions; a mouse keeps the double-click ones. */
const TOUCH_QUERY = '(pointer: coarse)';
/** From the tablet breakpoint the chips are below the calendar; below it, in a modal. */
const WIDE_QUERY = '(min-width: 650px)';

const STATES: readonly VoteState[] = ['available', 'preferred', 'unavailable'];
// With times the preferred answer is given to a time, in step 3.
const DAY_STATES: readonly VoteState[] = ['available', 'unavailable'];

// A Monday, to name the weekdays from Monday on.
const A_MONDAY = Date.UTC(2024, 0, 1);
const DAY_MS = 86_400_000;

let nextHintId = 0;

/** The options whose times are previewed, and the day or chip the preview points at. */
interface Previewed {
  readonly anchor: HTMLElement;
  readonly optionIds: readonly string[];
}

/** An overlap open in the modal and its days: a new one each time the modal opens. */
interface Opened {
  readonly overlap: Overlap;
  readonly strip: DayGrid;
}

/**
 * Step 2 of the voting page: a calendar, a month at a time, where the voter answers each
 * proposed day. A tap or click toggles available ↔ unavailable; the preferred day (one at most)
 * is chosen by a long-press on touch, a double-click with a mouse or Shift+Enter. A range is one
 * option: any of its days answers it. Back leaves through the first month, and the check on the
 * last month says the days are answered.
 *
 * In an event with times, a day stands for all of its times: it is unavailable when every one of
 * them is, a tap turns them all unavailable or all available again, and the preferred answer is
 * left to the times. The last month then goes on to them, unless no day is possible. Over a day
 * that is not unavailable, the mouse, or a finger resting on it, previews its times above it.
 *
 * Options that share days are drawn as one outline that answers nothing, and each one is answered
 * by a chip, with the same gestures as a day. From the tablet breakpoint the chips are below the
 * calendar: the mouse over a chip, or the keyboard focus on it, paint its days in its answer, and
 * the mouse over an outlined day lifts the chips that contain it. Below it, a tap on an outlined
 * day opens its overlap in a modal: its days as a strip and its chips, the last one answered
 * painted in the strip; the outline shows the answers once it closes.
 */
@Component({
  selector: 'app-vote-days',
  imports: [DateChip, Dialog, LongPress, NgTemplateOutlet, Tooltip, TranslocoPipe],
  styleUrl: './vote-days.scss',
  templateUrl: './vote-days.html',
  host: {
    '[class.with-times]': 'withTimes()',
    '(document:keydown.escape)': 'previewed.set(null)',
    '(pointerdown)': 'lastPointer = $event.pointerType',
    '(document:pointerdown)': 'previewed.set(null); keyboardLast = false',
    '(document:keydown)': 'keyboardLast = true',
  },
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
  protected readonly withTimes = computed(() => this.options().some(({ time }) => time !== null));
  protected readonly states = computed(() => (this.withTimes() ? DAY_STATES : STATES));
  protected readonly instructions = computed(() => {
    if (this.withTimes()) {
      return this.touch
        ? 'vote.days.instructionsWithTimesTouch'
        : 'vote.days.instructionsWithTimesMouse';
    }
    return this.touch ? 'vote.days.instructionsTouch' : 'vote.days.instructionsMouse';
  });
  protected readonly chipsHeader = this.touch
    ? 'vote.days.overlapsTouch'
    : 'vote.days.overlapsMouse';
  protected readonly keyboardHint = computed(() =>
    this.withTimes() ? 'vote.days.keyboardHintWithTimes' : 'vote.days.keyboardHint',
  );
  /** The last month goes on to the times: the event has them and some day is possible. */
  protected readonly goesToTimes = computed(
    () => this.withTimes() && this.options().some(({ id }) => this.answers()[id] !== 'unavailable'),
  );
  protected readonly hintId = `vote-days-hint-${String((nextHintId += 1))}`;
  protected readonly previewId = `vote-days-preview-${String(nextHintId)}`;
  protected readonly weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(this.locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
      A_MONDAY + index * DAY_MS,
    ),
  );
  /** How the last pointer touched the calendar: a double tap is not a double-click. */
  protected lastPointer = '';
  /** The page was last used with keys, not a pointer: a focus then comes from the keyboard. */
  protected keyboardLast = false;

  protected readonly months = computed(() => calendarMonths(this.options()));
  // The template only reads plain values of computed signals: a mutant that makes one return
  // nothing must still compile.
  protected readonly pageCount = computed(() => this.months().length);
  protected readonly severalPages = computed(() => this.pageCount() > 1);
  protected readonly page = signal(0);
  protected readonly previewed = signal<Previewed | null>(null);
  protected readonly preview = computed<HourPreview>(() => {
    const ids = new Set(this.previewed()?.optionIds);
    return hourPreview(this.options().flatMap(({ id, time }) => (ids.has(id) ? [time] : [])));
  });
  /** The option under the mouse: all of its days lift together. */
  protected readonly hovered = signal<string | null>(null);
  protected readonly month = computed(() => this.months()[this.page()]);
  /** The chip whose days are painted in its answer over their outline. */
  protected readonly painted = signal<DateChoice | null>(null);
  protected readonly paintShape = computed<ReadonlyMap<string, Shape>>(() => {
    const [month, painted] = [this.month(), this.painted()];
    return month && painted ? shapeIn(month, painted) : new Map<string, Shape>();
  });
  /** The chips of the outlined day under the mouse: they lift. */
  protected readonly liftedChips = signal<readonly DateChoice[]>([]);
  private readonly wide = signal(window.matchMedia(WIDE_QUERY).matches);
  /** Below the tablet breakpoint: an overlap opens in a modal. */
  protected readonly phone = computed(() => !this.wide());
  /** The overlap open in the modal; `null` while it is closed. */
  protected readonly opened = signal<Opened | null>(null);
  /**
   * The modal of each opening: one opened again before the page removed the one just closed
   * (back, then a tap at once) is a new dialog, and the old one's late `close` leaves it alone.
   */
  protected readonly openings = computed<readonly Opened[]>(() => {
    const opened = this.opened();
    return opened === null ? [] : [opened];
  });
  /** The chip last answered in the modal, painted in its strip. */
  protected readonly stripPainted = signal<DateChoice | null>(null);
  protected readonly stripPaint = computed<ReadonlyMap<string, Shape>>(() => {
    const [opened, painted] = [this.opened(), this.stripPainted()];
    return opened && painted ? shapeIn(opened.strip, painted) : new Map<string, Shape>();
  });
  protected readonly isLastPage = computed(() => this.page() >= this.pageCount() - 1);
  private readonly dayFormat = new Intl.DateTimeFormat(this.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  constructor() {
    const query = window.matchMedia(WIDE_QUERY);
    // A screen turned wide shows the chips below the calendar: the modal has no place there.
    const changed = (event: MediaQueryListEvent): void => {
      this.wide.set(event.matches);
      this.close();
    };
    query.addEventListener('change', changed);
    inject(DestroyRef).onDestroy(() => {
      query.removeEventListener('change', changed);
    });
  }

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

  /**
   * "Mar 7 – Vie 10, martes, 7 de julio – viernes, 10 de julio": a chip as it is read out, what it
   * shows first (WCAG 2.5.3), then its dates in full.
   */
  protected chipName(chip: DateChoice): string {
    const ends = chip.start === chip.end ? [chip.start] : [chip.start, chip.end];
    const dates = ends.map((date) => this.dayName(date)).join(' – ');
    return `${chipLabel(chip.start, chip.end, this.locale)}, ${dates}`;
  }

  /**
   * The outline of a day in options that overlap: preferred when one of them is, unavailable
   * when all of them are.
   */
  protected outlineState(overlaps: readonly DateChoice[]): VoteState {
    const states = overlaps.map(({ optionIds }) => this.stateOf(optionIds));
    if (states.includes('preferred')) return 'preferred';
    return states.every((state) => state === 'unavailable') ? 'unavailable' : 'available';
  }

  /** Opens the overlap of an outlined day in the modal, with nothing painted yet. */
  protected open(day: CalendarDay): void {
    if (!day.overlap) return;
    this.opened.set({ overlap: day.overlap, strip: stripOf(day.overlap) });
    this.stripPainted.set(null);
  }
  /** The modal of `opening` was closed: unless another overlap was opened since. */
  protected closed(opening: Opened): void {
    if (this.opened() === opening) this.close();
  }
  /** Closing the modal hides what was open in it: its paint and a preview of times. */
  protected close(): void {
    this.opened.set(null);
    this.previewed.set(null);
  }

  /** In the modal, the chip just answered paints its days in the strip. */
  private paintInStrip(chip: DateChoice): void {
    this.stripPainted.set(chip);
  }

  protected chipTapped(chip: DateChoice): void {
    this.toggle(chip.optionIds);
    this.paintInStrip(chip);
  }

  protected chipPressed(anchor: HTMLElement, chip: DateChoice): void {
    this.pressed(anchor, chip.optionIds);
    this.paintInStrip(chip);
  }

  protected chipPreferred(chip: DateChoice): void {
    this.prefer(chip.optionIds);
    this.paintInStrip(chip);
  }

  /** The mouse over a chip paints its days, and previews its times as a day does. */
  protected chipEntered(event: PointerEvent, chip: DateChoice): void {
    if (event.pointerType !== 'mouse') return;
    this.painted.set(chip);
    this.pointerEntered(event, chip.optionIds);
  }

  protected chipLeft(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.painted.set(null);
    this.pointerLeft(event);
  }

  /** The keyboard on a chip paints its days; a tap or click focuses it too, but paints nothing. */
  protected chipFocused(chip: DateChoice): void {
    if (this.keyboardLast) this.painted.set(chip);
  }

  /** Leaving a chip unpaints it, unless another chip is painted by now. */
  protected chipBlurred(chip: DateChoice): void {
    if (this.painted() === chip) this.painted.set(null);
  }
  /** The mouse over an outlined day lifts its chips; a finger passing over it does not. */
  protected outlinedEntered(event: PointerEvent, overlaps: readonly DateChoice[]): void {
    if (event.pointerType === 'mouse') this.liftedChips.set(overlaps);
  }

  /** The answer a day shows: its option's, or, with times, the one its times make. */
  protected stateOf(optionIds: readonly string[]): VoteState | undefined {
    const [first = ''] = optionIds;
    return this.withTimes() ? dayState(this.answers(), optionIds) : this.answers()[first];
  }

  protected toggle(optionIds: readonly string[]): void {
    this.previewed.set(null);
    const [first = ''] = optionIds;
    this.answers.update((answers) =>
      this.withTimes() ? dayToggled(answers, optionIds) : toggled(answers, first),
    );
  }

  /** A long-press: the preferred day, or, with times, a look at the day's times. */
  protected pressed(anchor: HTMLElement, optionIds: readonly string[]): void {
    if (this.withTimes()) this.showPreview(anchor, optionIds);
    else this.prefer(optionIds);
  }

  protected prefer(optionIds: readonly string[]): void {
    const [first = ''] = optionIds;
    if (!this.withTimes()) this.answers.update((answers) => withPreferred(answers, first));
  }

  /** The mouse over a day previews its times; a tap passing over it does not. */
  protected pointerEntered(event: PointerEvent, optionIds: readonly string[]): void {
    if (event.pointerType === 'mouse' && event.currentTarget instanceof HTMLElement) {
      this.showPreview(event.currentTarget, optionIds);
    }
  }

  /**
   * Leaving the day hides its preview, and leaving the preview too, unless the mouse goes from
   * one to the other: it can rest on the preview to read it. A finger leaves as it lifts: its
   * preview stays until the next touch.
   */
  protected pointerLeft(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    const into = event.relatedTarget;
    const anchor = this.previewed()?.anchor;
    const stays =
      into instanceof Node &&
      (into === anchor || (into instanceof Element && into.closest('[role="tooltip"]') !== null));
    if (!stays) this.previewed.set(null);
  }

  private showPreview(anchor: HTMLElement, optionIds: readonly string[]): void {
    if (this.withTimes() && this.stateOf(optionIds) !== 'unavailable') {
      this.previewed.set({ anchor, optionIds });
    }
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

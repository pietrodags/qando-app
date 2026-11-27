import {
  Component,
  ElementRef,
  type WritableSignal,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
  model,
  output,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { zoneCity } from './display';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Option } from '@qando/contracts';
import type { VoteState } from '@qando/domain';
import { ColumnHeader } from '../../shared/ui/column-header';
import { Dialog } from '../../shared/ui/dialog';
import { LongPress } from '../../shared/ui/long-press';
import { screenMatches } from '../../shared/ui/screen-matches';
import { screenRoom } from '../../shared/ui/screen-room';
import { ScrollFold } from '../../shared/ui/scroll-fold';
import { StepPager } from '../../shared/ui/step-pager';
import { type Answers, toggled, withPreferred } from './answers';
import { type TimeBlock, type TimeColumn, type TimePage, timePages } from './time-pages';

/** Touch screens get the touch instructions; a mouse keeps the double-click ones. */
const TOUCH_QUERY = '(pointer: coarse)';
/** From this width (the tablet breakpoint) four columns fit; below it, three. */
const WIDE_QUERY = '(min-width: 650px)';
/**
 * Below the narrowest width a page is laid out for, two columns of their usual width: a screen
 * that narrow is mostly one whose person made everything larger to read it better.
 */
const NARROWEST_QUERY = '(max-width: 319.98px)';

const STATES: readonly VoteState[] = ['available', 'preferred', 'unavailable'];

let nextHintId = 0;

/** `18:30` → the hour without its leading zero and the minutes, drawn smaller. */
interface ClockTime {
  readonly hour: string;
  readonly minutes: string;
}

/** A column's first day and, for a range of days, its last one. */
interface ColumnDays {
  readonly start: string;
  readonly end: string | null;
}

/**
 * A column open in the modal, and the time to bring into sight (`null`: its first): a new one
 * each time the modal opens.
 */
interface Expanded {
  readonly column: TimeColumn;
  readonly reveal: number | null;
}

/**
 * Step 3 of the voting page, for events with times: a column for each day (or range of days) the
 * voter can make, as step 2 left them, with the event's options of that day as the organizer
 * chose them: a time, a range of times, or the whole day. A tap or click toggles
 * available ↔ unavailable; the preferred option (one in the whole vote) is chosen by a long-press
 * on touch, a double-click with a mouse or Shift+Enter. Three columns at a time on a phone,
 * narrower when the card leaves less room, two of their usual width under 320 px, and four from
 * a tablet; back leaves through the first page, and the check on the last page says
 * the times are answered. The times are the event's clock, which the year row names when the
 * browser keeps another one. A column longer than 10 units scrolls inside its box, a time at a
 * time with ︿ ﹀ or freely with a finger; the other columns of its page keep the arrow rows
 * empty, so every box starts at the same height. On a phone a column is also never so tall that
 * the step's buttons leave the screen: it scrolls the times that do not fit, and a tap on its
 * header or on ︿ ﹀ opens the whole day in a modal (at the time the arrow would have shown),
 * where it is answered the same way.
 */
@Component({
  selector: 'app-vote-times',
  imports: [
    ColumnHeader,
    Dialog,
    LongPress,
    NgTemplateOutlet,
    ScrollFold,
    StepPager,
    TranslocoPipe,
  ],
  styleUrl: './vote-times.scss',
  templateUrl: './vote-times.html',
})
export class VoteTimes {
  /** The event's options, in chronological order. */
  readonly options = input.required<readonly Option[]>();
  /** One answer per option, shared with the page. */
  readonly answers = model.required<Answers>();
  /** The event's IANA time zone, which its times are read in. */
  readonly timeZone = input.required<string>();
  /** Back from the first page: to step 2. */
  readonly back = output();
  /** The check on the last page: the times are answered. */
  readonly done = output();

  private readonly transloco = inject(TranslocoService);
  private readonly locale = this.transloco.getActiveLang();

  protected readonly touch = window.matchMedia(TOUCH_QUERY).matches;
  protected readonly states = STATES;
  protected readonly hintId = `vote-times-hint-${String((nextHintId += 1))}`;
  /** How the last pointer touched a time: a double tap is not a double-click. */
  protected lastPointer = '';

  private readonly wide = screenMatches(WIDE_QUERY);
  private readonly narrowest = screenMatches(NARROWEST_QUERY);
  /** How many columns a page holds. */
  protected readonly perPage = computed<number>(() => {
    if (this.wide()) return 4;
    return this.narrowest() ? 2 : 3;
  });
  /** Below the tablet breakpoint: a long column opens in a modal. */
  protected readonly phone = computed(() => !this.wide());
  /** The column open in the modal; `null` while it is closed. */
  protected readonly expanded = signal<Expanded | null>(null);
  protected readonly openings = computed<readonly Expanded[]>(() => {
    const expanded = this.expanded();
    return expanded === null ? [] : [expanded];
  });
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');
  /**
   * The answers as the voter came into the step: they decide which days have a column, so a day
   * whose last time turns unavailable keeps its column until the step is opened again. A
   * computed signal that tracks nothing is read once and then kept.
   */
  private readonly entryAnswers = computed(() => untracked(this.answers));
  private readonly pages = computed<readonly TimePage[]>(() =>
    timePages(this.options(), this.entryAnswers(), this.perPage()),
  );
  // The template only reads plain values of computed signals: a mutant that makes one return
  // nothing must still compile.
  protected readonly pageCount = computed<number>(() => this.pages().length);
  /** Back on the first page when a page comes to hold more or fewer columns: the pages are others. */
  protected readonly page: WritableSignal<number> = linkedSignal<number, number>({
    source: this.perPage,
    computation: () => 0,
  });
  protected readonly columns = computed<readonly TimeColumn[]>(
    () => this.pages()[this.page()]?.columns ?? [],
  );
  private readonly scrollers = viewChildren(ScrollFold);
  private readonly foldRows = viewChildren<ElementRef<HTMLElement>>('foldRow');
  /** Some column of the page scrolls: every column keeps a row for its ︿ and its ﹀. */
  protected readonly folds = computed(() => this.scrollers().some((box) => box.folded()));
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /**
   * On a phone, the most a column's box may measure for the buttons to stay in sight. Only the
   * page's boxes count, not the modal's.
   */
  protected readonly boxLimit = screenRoom(
    this.host,
    { boxes: '.columns .blocks', end: '.nav' },
    () => {
      // Read for the measure to be taken again when the page of columns changes, and after the
      // render in which the rows of the arrows come or go, before the browser draws the boxes.
      this.columns();
      this.foldRows();
      return !this.wide();
    },
  );
  /** The years of the page: the first one on the left, a second one on the right. */
  protected readonly firstYear = computed(() => this.pages()[this.page()]?.years[0] ?? '');
  protected readonly secondYear = computed(() => this.pages()[this.page()]?.years[1] ?? '');
  /** "Madrid" when the browser keeps another clock than the event's; null when it keeps it. */
  protected readonly zoneCity = computed(() => zoneCity(this.timeZone()));

  private readonly dayFormat = new Intl.DateTimeFormat(this.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  constructor() {
    // Once the modal is open (the dialog opens in the write phase), the time to show scrolls in.
    afterRenderEffect({
      read: () => {
        const box = this.sheet()?.nativeElement;
        const reveal = untracked(this.expanded)?.reveal ?? null;
        if (box === undefined || reveal === null) return;
        box.children[reveal]?.scrollIntoView({ block: 'nearest' });
      },
    });
  }

  /** Opens the column in the modal, with its time `reveal` in sight. */
  protected expand(column: TimeColumn, reveal: number | null): void {
    this.expanded.set({ column, reveal });
  }

  /** The modal of `opening` was closed: unless another column was opened since. */
  protected closed(opening: Expanded): void {
    this.expanded.update((current) => (current === opening ? null : current));
  }

  /** The days a column's header shows. */
  protected daysOf(column: TimeColumn): ColumnDays {
    const { dates } = column;
    return dates.kind === 'single'
      ? { start: dates.date, end: null }
      : { start: dates.start, end: dates.end };
  }

  /** "lunes, 6 de julio, 18:00 a 20:30: Disponible": a time's day, time and answer. */
  protected blockName(column: TimeColumn, block: TimeBlock): string {
    const state = this.answers()[block.optionId] ?? 'available';
    const stateName: string = this.transloco.translate(`vote.days.state.${state}`);
    return this.transloco.translate('vote.times.block', {
      date: this.datesName(column),
      time: this.timeName(block.time),
      state: stateName,
    });
  }

  /** "lunes, 6 de julio", or both ends of a range of days. */
  protected datesName(column: TimeColumn): string {
    const { start, end } = this.daysOf(column);
    const named = (date: string): string => this.dayFormat.format(Date.parse(date));
    return end === null ? named(start) : this.span(named(start), named(end));
  }

  /**
   * "9:00", "18:00–20:30" or "Sin horario". A range keeps its times together, as the block shows
   * them, so a voice user can say what they see (WCAG 2.5.3).
   */
  private timeName(time: Option['time']): string {
    if (time === null) return this.transloco.translate('common.noTime');
    if (time.kind === 'single') return this.label(time.at);
    return this.transloco.translate('vote.times.timeSpan', {
      start: this.label(time.start),
      end: this.label(time.end),
    });
  }

  protected clock(time: string): ClockTime {
    return { hour: String(Number(time.slice(0, 2))), minutes: time.slice(3) };
  }

  protected toggle(optionId: string): void {
    this.answers.update((answers) => toggled(answers, optionId));
  }

  protected prefer(optionId: string): void {
    this.answers.update((answers) => withPreferred(answers, optionId));
  }

  private span(start: string, end: string): string {
    return this.transloco.translate('vote.times.span', { start, end });
  }

  private label(time: string): string {
    const { hour, minutes } = this.clock(time);
    return `${hour}:${minutes}`;
  }
}

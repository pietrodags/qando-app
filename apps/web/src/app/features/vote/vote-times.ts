import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
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
import { Dialog } from '../../shared/ui/dialog';
import { LongPress } from '../../shared/ui/long-press';
import { ScrollFold } from '../../shared/ui/scroll-fold';
import { type Answers, toggled, withPreferred } from './answers';
import { type TimeBlock, type TimeColumn, type TimePage, timePages } from './time-pages';

/** Touch screens get the touch instructions; a mouse keeps the double-click ones. */
const TOUCH_QUERY = '(pointer: coarse)';
/** From this width (the tablet breakpoint) four columns fit; below it, three. */
const WIDE_QUERY = '(min-width: 650px)';

/** Room left under the step's buttons on a phone. */
const PHONE_BOTTOM_ROOM_PX = 10;

const STATES: readonly VoteState[] = ['available', 'preferred', 'unavailable'];

let nextHintId = 0;

/** `18:30` → the hour without its leading zero and the minutes, drawn smaller. */
interface ClockTime {
  readonly hour: string;
  readonly minutes: string;
}

/** A column open in the modal, and the time to bring into sight (`null`: its first). */
interface Expanded {
  readonly column: TimeColumn;
  readonly reveal: number | null;
}

/**
 * Step 3 of the voting page, for events with times: a column for each day (or range of days) the
 * voter can make, as step 2 left them, with the event's options of that day as the organizer
 * chose them: a time, a range of times, or the whole day. A tap or click toggles
 * available ↔ unavailable; the preferred option (one in the whole vote) is chosen by a long-press
 * on touch, a double-click with a mouse or Shift+Enter. Three columns fit at a time on a phone
 * and four from a tablet; back leaves through the first page, and the check on the last page says
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
  imports: [Dialog, LongPress, NgTemplateOutlet, ScrollFold, TranslocoPipe],
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

  private readonly wide = signal(false);
  /** Below the tablet breakpoint: a long column opens in a modal. */
  protected readonly phone = computed(() => !this.wide());
  /** The column open in the modal; `null` while it is closed. */
  protected readonly expanded = signal<Expanded | null>(null);
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');
  /**
   * The answers as the voter came into the step: they decide which days have a column, so a day
   * whose last time turns unavailable keeps its column until the step is opened again. A
   * computed signal that tracks nothing is read once and then kept.
   */
  private readonly entryAnswers = computed(() => untracked(this.answers));
  private readonly pages = computed<readonly TimePage[]>(() =>
    timePages(this.options(), this.entryAnswers(), this.wide() ? 4 : 3),
  );
  // The template only reads plain values of computed signals: a mutant that makes one return
  // nothing must still compile.
  protected readonly pageCount = computed(() => this.pages().length);
  protected readonly severalPages = computed(() => this.pageCount() > 1);
  /** Back on the first page when the screen turns wider or narrower: the pages are others. */
  protected readonly page = signal(0);
  protected readonly isLastPage = computed(() => this.page() >= this.pageCount() - 1);
  protected readonly columns = computed<readonly TimeColumn[]>(
    () => this.pages()[this.page()]?.columns ?? [],
  );
  private readonly scrollers = viewChildren(ScrollFold);
  /** Some column of the page scrolls: every column keeps a row for its ︿ and its ﹀. */
  protected readonly folds = computed(() => this.scrollers().some((box) => box.folded()));
  /** On a phone, the most a column's box may measure for the buttons to stay in sight. */
  protected readonly boxLimit = signal<number | null>(null);
  private readonly screenHeight = signal(window.innerHeight);
  /** Bumped when the step or the page changes size: the arrow rows, a late font, a step above. */
  private readonly layoutChanges = signal(0);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
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
  private readonly monthFormat = new Intl.DateTimeFormat(this.locale, {
    month: 'short',
    timeZone: 'UTC',
  });
  private readonly weekdayFormat = new Intl.DateTimeFormat(this.locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });

  constructor() {
    const query = window.matchMedia(WIDE_QUERY);
    this.wide.set(query.matches);
    const changed = (event: MediaQueryListEvent): void => {
      this.wide.set(event.matches);
      this.page.set(0);
    };
    query.addEventListener('change', changed);
    const resized = (): void => {
      this.screenHeight.set(window.innerHeight);
    };
    window.addEventListener('resize', resized);
    // Older browsers without it keep the first measure.
    const observer =
      'ResizeObserver' in window
        ? new ResizeObserver(() => {
            this.layoutChanges.update((count) => count + 1);
          })
        : undefined;
    observer?.observe(this.host);
    observer?.observe(document.body);
    inject(DestroyRef).onDestroy(() => {
      query.removeEventListener('change', changed);
      window.removeEventListener('resize', resized);
      observer?.disconnect();
    });
    // Measured again when the page, the screen or anything around the boxes changes size; the
    // boxes' own height never changes the room they have, so the measure settles.
    afterRenderEffect(() => {
      this.columns();
      this.layoutChanges();
      const screen = this.screenHeight();
      this.boxLimit.set(this.wide() ? null : this.roomFor(screen));
    });
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

  /**
   * The height the boxes may take for the step's buttons to end above the bottom of a screen
   * `screen` pixels tall, with the page scrolled to its top: what is left between the boxes' top
   * and what goes below the longest box. Only the page's boxes count, not the modal's.
   */
  private roomFor(screen: number): number | null {
    const boxes = Array.from(this.host.querySelectorAll('.columns .blocks'), (box) =>
      box.getBoundingClientRect(),
    );
    const nav = this.host.querySelector('.nav')?.getBoundingClientRect();
    const [first] = boxes;
    if (first === undefined || nav === undefined) return null;
    const below = nav.bottom - Math.max(...boxes.map(({ bottom }) => bottom));
    const top = pageTop(this.host) + first.top - this.host.getBoundingClientRect().top;
    return Math.floor(screen - PHONE_BOTTOM_ROOM_PX - top - below);
  }

  /** The ends of a column's days: the same date twice for a single day. */
  protected endsOf(column: TimeColumn): readonly string[] {
    const { dates } = column;
    return dates.kind === 'single' ? [dates.date] : [dates.start, dates.end];
  }

  /** `2026-07-06` → "Jul", "6", "Lun": three letters of the month and weekday, as titles. */
  protected headerOf(date: string): { month: string; day: number; weekday: string } {
    const time = Date.parse(date);
    return {
      month: this.titled(this.monthFormat.format(time)),
      day: new Date(time).getUTCDate(),
      weekday: this.titled(this.weekdayFormat.format(time)),
    };
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
    const [start = '', end] = this.endsOf(column).map((date) =>
      this.dayFormat.format(Date.parse(date)),
    );
    return end === undefined ? start : this.span(start, end);
  }

  /** "9:00", "18:00 a 20:30" or "Sin horario". */
  private timeName(time: Option['time']): string {
    if (time === null) return this.transloco.translate('common.noTime');
    if (time.kind === 'single') return this.label(time.at);
    return this.span(this.label(time.start), this.label(time.end));
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

  protected goBack(): void {
    if (this.page() > 0) this.page.update((page) => page - 1);
    else this.back.emit();
  }

  protected goForward(): void {
    if (this.isLastPage()) this.done.emit();
    else this.page.update((page) => page + 1);
  }

  private span(start: string, end: string): string {
    return this.transloco.translate('vote.times.span', { start, end });
  }

  private label(time: string): string {
    const { hour, minutes } = this.clock(time);
    return `${hour}:${minutes}`;
  }

  private titled(name: string): string {
    const short = name.replace('.', '').slice(0, 3);
    return `${short.charAt(0).toLocaleUpperCase(this.locale)}${short.slice(1)}`;
  }
}

/** How far down the page an element starts, whatever moves it while a step slides in. */
function pageTop(element: HTMLElement): number {
  let top = 0;
  for (let at: Element | null = element; at instanceof HTMLElement; at = at.offsetParent) {
    top += at.offsetTop;
  }
  return top;
}

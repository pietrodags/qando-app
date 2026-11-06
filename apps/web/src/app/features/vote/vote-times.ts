import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Option } from '@qando/contracts';
import type { VoteState } from '@qando/domain';
import { LongPress } from '../../shared/ui/long-press';
import { type Answers, toggled, withPreferred } from './answers';
import { type TimeBlock, type TimeColumn, timePages } from './time-pages';

/** Touch screens get the touch instructions; a mouse keeps the double-click ones. */
const TOUCH_QUERY = '(pointer: coarse)';
/** From this width (the tablet breakpoint) four columns fit; below it, three. */
const WIDE_QUERY = '(min-width: 650px)';

const STATES: readonly VoteState[] = ['available', 'preferred', 'unavailable'];

let nextHintId = 0;

/** `18:30` → the hour without its leading zero and the minutes, drawn smaller. */
interface ClockTime {
  readonly hour: string;
  readonly minutes: string;
}

/**
 * Step 3 of the voting page, for events with times: a column for each day (or range of days) the
 * voter can make, as step 2 left them, with the event's options of that day as the organizer
 * chose them: a time, a range of times, or the whole day. A tap or click toggles
 * available ↔ unavailable; the preferred option (one in the whole vote) is chosen by a long-press
 * on touch, a double-click with a mouse or Shift+Enter. Three columns fit at a time on a phone
 * and four from a tablet; back leaves through the first page, and the check on the last page says
 * the times are answered. The times are the event's clock, which the year row names when the
 * browser keeps another one.
 */
@Component({
  selector: 'app-vote-times',
  imports: [LongPress, TranslocoPipe],
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
  /**
   * The answers as the voter came into the step: they decide which days have a column, so a day
   * whose last time turns unavailable keeps its column until the step is opened again. A
   * computed signal that tracks nothing is read once and then kept.
   */
  private readonly entryAnswers = computed(() => untracked(this.answers));
  private readonly pages = computed(() =>
    timePages(this.options(), this.entryAnswers(), this.wide() ? 4 : 3),
  );
  // The template only reads plain values of computed signals: a mutant that makes one return
  // nothing must still compile.
  protected readonly pageCount = computed(() => this.pages().length);
  protected readonly severalPages = computed(() => this.pageCount() > 1);
  /** Back on the first page when the screen turns wider or narrower: the pages are others. */
  protected readonly page = linkedSignal({ source: this.wide, computation: () => 0 });
  protected readonly isLastPage = computed(() => this.page() >= this.pageCount() - 1);
  protected readonly columns = computed(() => this.pages()[this.page()]?.columns ?? []);
  /** The years of the page: the first one on the left, a second one on the right. */
  protected readonly firstYear = computed(() => this.pages()[this.page()]?.years[0] ?? '');
  protected readonly secondYear = computed(() => this.pages()[this.page()]?.years[1] ?? '');
  /** "Madrid" when the browser keeps another clock than the event's; null when it keeps it. */
  protected readonly zoneCity = computed(() => {
    const zone = this.timeZone();
    if (zone === Intl.DateTimeFormat().resolvedOptions().timeZone) return null;
    return (zone.split('/').pop() ?? zone).replaceAll('_', ' ');
  });

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
    };
    query.addEventListener('change', changed);
    inject(DestroyRef).onDestroy(() => {
      query.removeEventListener('change', changed);
    });
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
  private datesName(column: TimeColumn): string {
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

import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ColumnHeader } from '../../shared/ui/column-header';
import { ScrollFold } from '../../shared/ui/scroll-fold';
import { TOUCH_QUERY, screenMatches } from '../../shared/ui/screen-matches';
import { screenRoom } from '../../shared/ui/screen-room';
import { StepPager } from '../../shared/ui/step-pager';
import { STEP_CARD } from '../../shared/ui/step-stack';
import { foldOf } from '../vote/time-pages';
import { clockLabel } from '../vote/display';
import { ColumnStrip, columnsOnScreen } from './column-strip';
import { type DateSelection, isFull, withTimes } from './date-selection';
import { type DayTime, type DayTimes, timesOf } from './day-times';
import { HourColumn } from './hour-column';
import { OptionCounter } from './option-counter';
import { SaveOffer } from './save-offer';
import { type ColumnWindow, type TimeColumn, columnWindow } from './time-columns';

/**
 * From this width (the tablet breakpoint) the hours of the open column keep their own height;
 * below it, they show the hours that leave the step's card on screen.
 */
const WIDE_QUERY = '(min-width: 650px)';

/** A time as drawn: its hour, and its minutes in small. */
interface Clock {
  readonly hour: string;
  readonly minutes: string;
}

/** One option of a column, as it will be voted: a time, a range of times, or the whole day. */
type SummaryOption =
  | { readonly kind: 'single'; readonly key: string; readonly name: string; readonly at: Clock }
  | {
      readonly kind: 'range';
      readonly key: string;
      readonly name: string;
      readonly start: Clock;
      readonly end: Clock;
    }
  | { readonly kind: 'whole-day'; readonly key: string };

/** A column as the step shows it: its options, and its name for screen readers. */
type SummaryColumn = TimeColumn & {
  readonly key: string;
  readonly name: string;
  /** Its "Editar", as screen readers hear it: a range of days has none. */
  readonly edit?: string;
  readonly options: readonly SummaryOption[];
  /** How many options show before the column scrolls; `null` when they all do. */
  readonly fold: number | null;
};

/**
 * The summary of the wizard, the step after the times, inside its card: every option as it will
 * be voted, for the organizer to look over before the last step. The columns are the times
 * step's, in its order (`columnWindow`), and as many on screen (`ColumnStrip`): a date of its own
 * lists its times once each, marked and saved, by when they start and then by when they end, or
 * "Sin horario" without any; a range of days is one option, "Sin horario". Each option is drawn
 * as the voting page draws it, and a column longer than the voting page shows scrolls inside its
 * box under ︿ and ﹀, which the keyboard reaches by the box itself. Each column is a list named
 * after its day ("lunes, 6 de julio"); a time range is heard as "20:00–22:00". The step's two round arrows move the
 * columns one at a time, on and on while held (`StepPager`): back to the times from the first
 * columns, on from the last. It always opens on its first columns. Over the columns, the year
 * of the days on screen, a second year when they reach into it, and between them the options
 * counter, as on the steps before it.
 *
 * A column of a date of its own is corrected in place: pressed anywhere (but on its ︿ ﹀), or
 * with its "Editar", which the keyboard reaches and the mouse shows over the column, it becomes
 * the times step's column of its day (`HourColumn`), in its place among the others, and what is
 * corrected there is given to the dates at once. Below 650 px its hours are those that leave the
 * card on screen, and without a mouse the row of the button that shows the "+" of its marked
 * times (`SaveOffer`) is over the arrows while it is open. It closes, with what was corrected,
 * with its check ("Listo") or Escape, which give the focus back to its "Editar", with a press
 * anywhere outside it, which opens the column pressed if it is one, and when the columns move.
 * A range of days has nothing to correct.
 */
@Component({
  selector: 'app-wizard-summary',
  imports: [
    ColumnHeader,
    ColumnStrip,
    HourColumn,
    OptionCounter,
    SaveOffer,
    ScrollFold,
    StepPager,
    TranslocoPipe,
  ],
  styleUrl: './wizard-summary.scss',
  templateUrl: './wizard-summary.html',
  host: {
    '(document:keydown.escape)': 'closeBack()',
    '(document:click)': 'clicked($event)',
  },
})
export class WizardSummary {
  /** The dates chosen, with their times, as corrected on a column opened here. */
  readonly selection = model.required<DateSelection>();
  /** The organizer goes back to the times. */
  readonly back = output();
  /** The organizer goes on to the next step. */
  readonly next = output();

  private readonly transloco = inject(TranslocoService);
  private readonly dayFormat = new Intl.DateTimeFormat(this.transloco.getActiveLang(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  /** How many columns are on screen at a time. */
  protected readonly visible = columnsOnScreen();
  /** The first column the organizer asked to see: the window says where it can be. */
  protected readonly asked = signal(0);
  private readonly window = computed<ColumnWindow>(() =>
    columnWindow(this.selection(), this.asked(), this.visible()),
  );
  protected readonly first = computed<number>(() => this.window().first);
  protected readonly places = computed<number>(() => this.window().places);
  protected readonly columns = computed<readonly SummaryColumn[]>(() =>
    this.window().columns.map((column) => this.viewOf(column)),
  );
  /** The years of the days on screen: the first one at the start of the row, a second at its end. */
  protected readonly firstYear = computed<string>(() => this.window().years[0] ?? '');
  protected readonly secondYear = computed<string>(() => this.window().years[1] ?? '');

  /** The device has no mouse: the column to correct is touched, and its "+" asked for. */
  protected readonly touch = window.matchMedia(TOUCH_QUERY).matches;
  /** The day whose column is open to correct; `null` while none is. */
  protected readonly opened = signal<string | null>(null);
  /** The event takes no more options: the open column marks nothing that would add one. */
  protected readonly full = computed<boolean>(() => isFull(this.selection()));
  /** Without a mouse, the button that shows the "+" of the open column's marked times. */
  private readonly offer = viewChild(SaveOffer);
  /** The "+" of the open column's marked times are shown. */
  protected readonly saving = computed<boolean>(() => this.offer()?.shown() ?? false);
  /** The open column has a marked time: there is a "+" to show. */
  protected readonly savable = computed<boolean>(() => {
    const opened = this.opened();
    return opened !== null && (this.selection().times[opened]?.marked.length ?? 0) > 0;
  });

  private readonly wide = screenMatches(WIDE_QUERY);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** Below 650 px, the most the open column's hours may measure for the card to end on screen. */
  protected readonly room = screenRoom(
    this.host,
    { boxes: '.hours', end: STEP_CARD },
    () => !this.wide(),
  );

  /** The columns move, by the step's arrows or a finger: the open one closes. */
  protected moveTo(place: number): void {
    this.opened.set(null);
    this.asked.set(place);
  }

  protected setTimes(date: string, times: DayTimes): void {
    this.selection.update((selection) => withTimes(selection, date, times));
  }

  /**
   * A click inside the open column, or on the button of its "+", leaves it open; on a column of
   * a date (but on its ︿ ﹀) it opens that column, the focus on it; anywhere else it closes it.
   */
  protected clicked(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('.open, app-save-offer')) return;
    const column = target.closest('.fold-arrow')
      ? null
      : target.closest<HTMLElement>('[data-opens]');
    const date = column && this.host.contains(column) ? (column.dataset['opens'] ?? null) : null;
    this.opened.set(date);
    if (date !== null) this.focusOnceDrawn('.open app-hour-column');
  }

  /** The check, or Escape: the open column closes, and the focus is back on its "Editar". */
  protected closeBack(): void {
    const date = this.opened();
    if (date === null) return;
    this.opened.set(null);
    this.focusOnceDrawn(`[data-opens="${date}"] .edit`);
  }

  /** The focus goes to the first of the step that matches, once the page shows it. */
  private focusOnceDrawn(selector: string): void {
    afterNextRender(
      () => {
        this.host.querySelector<HTMLElement>(selector)?.focus();
      },
      { injector: this.injector },
    );
  }

  private viewOf(column: TimeColumn): SummaryColumn {
    if (column.kind === 'range') {
      const name = this.transloco.translate('create.times.rangeName', {
        start: this.dayName(column.start),
        end: this.dayName(column.end),
      });
      return { ...column, key: `${column.start}/${column.end}`, name, ...this.optionsOf([]) };
    }
    const times = timesOf(column.times);
    const name = this.dayName(column.date);
    return {
      ...column,
      key: column.date,
      name,
      edit: this.transloco.translate('create.summary.editColumn', { day: name }),
      ...this.optionsOf(times),
    };
  }

  /** The options of a column with these times, or of the whole day without any. */
  private optionsOf(times: readonly DayTime[]): Pick<SummaryColumn, 'options' | 'fold'> {
    if (times.length === 0) return { options: [{ kind: 'whole-day', key: 'day' }], fold: null };
    return { options: times.map((time) => this.optionOf(time)), fold: foldOf(times) };
  }

  private optionOf(time: DayTime): SummaryOption {
    if (time.kind === 'single') {
      return { kind: 'single', key: time.at, name: clockLabel(time.at), at: clockOf(time.at) };
    }
    const name = this.transloco.translate('vote.times.timeSpan', {
      start: clockLabel(time.start),
      end: clockLabel(time.end),
    });
    return {
      kind: 'range',
      key: `${time.start}-${time.end}`,
      name,
      start: clockOf(time.start),
      end: clockOf(time.end),
    };
  }

  /** `2026-06-20` → "sábado, 20 de junio". */
  private dayName(date: string): string {
    return this.dayFormat.format(Date.parse(date));
  }
}

/** `09:30` → 9 and :30. */
function clockOf(time: string): Clock {
  return { hour: String(Number(time.slice(0, 2))), minutes: time.slice(2) };
}

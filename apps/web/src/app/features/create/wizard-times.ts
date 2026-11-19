import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  type WritableSignal,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
  model,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ColumnHeader } from '../../shared/ui/column-header';
import { screenRoom } from '../../shared/ui/screen-room';
import { SideSlide } from '../../shared/ui/side-slide';
import { StepPager } from '../../shared/ui/step-pager';
import { STEP_CARD } from '../../shared/ui/step-stack';
import { type DateSelection, isFull, withTimes } from './date-selection';
import type { DayTimes } from './day-times';
import { HourColumn } from './hour-column';
import { OptionCounter } from './option-counter';
import { type ColumnWindow, type TimeColumn, columnWindow } from './time-columns';

/** From this width (the tablet breakpoint) four columns fit; below it, three. */
const WIDE_QUERY = '(min-width: 650px)';

/** A device with no mouse: nothing hovers, or its pointer is a finger. */
const TOUCH_QUERY = '(hover: none), (pointer: coarse)';

/** A finger has passed a column once it has gone more than this part of the way to it. */
const PASSED = 0.25;

/** A column as the step shows it: what tells it from the others, and its name for screen readers. */
type ColumnView = TimeColumn & { readonly key: string; readonly name: string };

/**
 * Step 3 of the wizard, inside its card, reached when times are asked for: the times of each date
 * of its own. Under the label, a column for each date, range and saved range, by first day: a
 * date has its day over the 24 hours, where a press marks a time (`HourColumn`); a range only
 * says it has no times. Four columns are on screen at a time from 650 px and three below, and
 * the two round arrows of the step move them one column at a time, on and on while held, before
 * they leave it (`StepPager`): back to step 2 from the first columns, on from the last. The
 * columns are all in one row that slides behind a window as wide as the ones on screen; the rest
 * are out of reach of the mouse, the keyboard and screen readers, and come back as they were
 * left. A finger that slides sideways over the columns moves their row with it, as far as the
 * first column and the last, and when it lifts the row settles on the column it brought: one for
 * each column passed, the next counting once the finger is over a quarter of the way to it. When the screen turns wider or narrower the first column on screen stays, as far as the
 * last ones allow. Over the columns, the year of the days on screen, a
 * second year at the end of the row when they reach into it, and between them the options
 * counter, since every time is an option. Below 650 px the columns show the hours that leave the
 * whole card on screen with the page at its top. Each column is a group named after its day
 * ("sábado, 20 de junio"); the headers are for the eye only. A marked time is saved with its "+"
 * and waits in a pill under its column (`HourColumn`): a mouse finds each "+" on its time, and
 * without a mouse a button over the forward arrow shows the "+" of every marked time on screen,
 * in red, until one is pressed, the times change, a press lands anywhere else or Escape.
 */
@Component({
  selector: 'app-wizard-times',
  imports: [ColumnHeader, HourColumn, OptionCounter, SideSlide, StepPager, TranslocoPipe],
  styleUrl: './wizard-times.scss',
  templateUrl: './wizard-times.html',
  host: {
    '(document:keydown.escape)': 'letGo()',
    '(document:click)': 'clicked($event)',
  },
})
export class WizardTimes {
  /** The dates chosen in step 2, with the times marked so far. */
  readonly selection = model.required<DateSelection>();
  /** The organizer goes back to step 2. */
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

  private readonly wide = signal(false);
  /** How many columns are on screen at a time. */
  protected readonly visible = computed<number>(() => (this.wide() ? 4 : 3));
  /** The first column the organizer asked to see: the window says where it can be. */
  protected readonly asked = signal(0);
  private readonly window = computed<ColumnWindow>(() =>
    columnWindow(this.selection(), this.asked(), this.visible()),
  );
  protected readonly first = computed<number>(() => this.window().first);
  protected readonly places = computed<number>(() => this.window().places);
  /** How many columns a finger sliding sideways has brought so far, part of one too; `null` without one. */
  protected readonly brought = signal<number | null>(null);
  /** How many columns the row is moved to its start: with the finger, never past its two ends. */
  protected readonly moved = computed<number>(() =>
    Math.min(Math.max(this.first() + (this.brought() ?? 0), 0), this.places() - 1),
  );
  protected readonly columns = computed<readonly ColumnView[]>(() =>
    this.window().columns.map((column) => this.viewOf(column)),
  );
  /** The event takes no more options: a column marks nothing that would add one. */
  protected readonly full = computed<boolean>(() => isFull(this.selection()));
  /**
   * The day on whose column a saved time is being edited, `null` while none is: the pills of
   * the other columns have no "−" meanwhile, and outline nothing under the mouse.
   */
  protected readonly editedOn = signal<string | null>(null);
  /** The device has no mouse: the "+" of the marked times are asked for with the step's button. */
  protected readonly touch = window.matchMedia(TOUCH_QUERY).matches;
  /**
   * Without a mouse: the "+" of every marked time are shown, asked for with the button over the
   * forward arrow, which gives way to them; they hide again, and the button is back, when the
   * times change, as when one is saved.
   */
  protected readonly adding: WritableSignal<boolean> = linkedSignal<DateSelection, boolean>({
    source: this.selection,
    computation: () => false,
  });
  /** Some day on screen has a marked time: there is a "+" to show. */
  protected readonly savable = computed<boolean>(() =>
    this.columns().some(
      (column) => column.onScreen && column.kind === 'day' && column.times.marked.length > 0,
    ),
  );
  /** The years of the days on screen: the first one at the start of the row, a second at its end. */
  protected readonly firstYear = computed<string>(() => this.window().years[0] ?? '');
  protected readonly secondYear = computed<string>(() => this.window().years[1] ?? '');

  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /**
   * Below 650 px, the most a column's list may measure for the step's card to end on screen. The
   * place of a column's trash is left out: kept only where this room spares it, it never takes an
   * hour from the lists, and the trash that comes where it is not kept makes the step taller.
   */
  protected readonly room = screenRoom(
    this.host,
    { boxes: '.hours', end: STEP_CARD, aside: '.clear-place' },
    () => !this.wide(),
  );

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

  /** The edit of a saved time begins or ends on the column of a day. */
  protected setEdited(date: string, editing: boolean): void {
    // One that ends after another has begun leaves that other's.
    if (editing) this.editedOn.set(date);
    else if (this.editedOn() === date) this.editedOn.set(null);
  }

  protected setTimes(date: string, times: DayTimes): void {
    this.selection.update((selection) => withTimes(selection, date, times));
  }

  /**
   * The button over the forward arrow, without a mouse: the "+" of every marked time on screen
   * show in its place, the first one taking the focus it had.
   */
  protected showSaves(): void {
    this.adding.set(true);
    this.focusOnceDrawn('.save.offered');
  }

  /** Escape: the "+" asked for hide, and their button is back with the focus one may have had. */
  protected letGo(): void {
    if (!this.adding()) return;
    this.adding.set(false);
    this.focusOnceDrawn('.adder');
  }

  /**
   * A click anywhere on the page hides the "+" asked for, except on one of them, which saves,
   * and on the button that has just shown them; whatever was pressed does what it does.
   */
  protected clicked(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('.save, .adder')) this.adding.set(false);
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

  /** A finger slides sideways, `by` pixels from where it was put down: the row goes with it. */
  protected slide(by: number): void {
    this.brought.set(-by / this.stride());
  }

  /** The finger lifts `by` pixels from where it was put down: the row settles on a column. */
  protected settle(by: number): void {
    const stride = this.stride();
    const passed = Math.ceil(Math.abs(by) / stride - PASSED) * Math.sign(by);
    this.brought.set(null);
    this.asked.set(this.first() - passed);
  }

  /** How far a column starts from the one before it, in pixels; without a second one, no way. */
  private stride(): number {
    const [first, second] = this.host.querySelectorAll('.column');
    if (!first || !second) return Infinity;
    return second.getBoundingClientRect().left - first.getBoundingClientRect().left;
  }

  private viewOf(column: TimeColumn): ColumnView {
    if (column.kind === 'day') {
      return { ...column, key: column.date, name: this.dayName(column.date) };
    }
    const start = this.dayName(column.start);
    const end = this.dayName(column.end);
    return {
      ...column,
      key: `${column.start}/${column.end}`,
      name: this.transloco.translate('create.times.rangeName', { start, end }),
    };
  }

  /** `2026-06-20` → "sábado, 20 de junio". */
  private dayName(date: string): string {
    return this.dayFormat.format(Date.parse(date));
  }
}

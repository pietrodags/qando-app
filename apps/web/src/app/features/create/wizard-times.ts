import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ColumnHeader } from '../../shared/ui/column-header';
import { TOUCH_QUERY, screenMatches } from '../../shared/ui/screen-matches';
import { screenRoom } from '../../shared/ui/screen-room';
import { StepPager } from '../../shared/ui/step-pager';
import { STEP_CARD } from '../../shared/ui/step-stack';
import { ColumnStrip, columnsOnScreen } from './column-strip';
import { type DateSelection, isFull, withTimes } from './date-selection';
import type { DayTimes } from './day-times';
import { HourColumn } from './hour-column';
import { OptionCounter } from './option-counter';
import { PartHandover } from './part-handover';
import { SaveOffer } from './save-offer';
import { type ColumnWindow, type TimeColumn, columnWindow } from './time-columns';

/**
 * From this width (the tablet breakpoint) the lists of hours keep their own height; below it, they
 * show the hours that leave the step's card on screen.
 */
const WIDE_QUERY = '(min-width: 650px)';

/** A column as the step shows it: what tells it from the others, and its name for screen readers. */
type ColumnView = TimeColumn & { readonly key: string; readonly name: string };

/**
 * Step 3 of the wizard, inside its card, reached when times are asked for: the times of each date
 * of its own, before their summary (`WizardSummary`) takes their place in the same card, on the
 * same columns. Under the label, a column for each date, range and saved range, by first day: a
 * date has its day over the 24 hours, where a press marks a time (`HourColumn`); a range only
 * says it has no times. Four columns are on screen at a time from 650 px, three below, narrower
 * when the card leaves less room, and two of their usual width under 320 px; the two round arrows of the step move them one column at a time, on and on while held, before
 * they leave it (`StepPager`): back to step 2 from the first columns, on to the summary from the
 * last. The
 * columns are all in one row that slides behind a window as wide as the ones on screen
 * (`ColumnStrip`, which a finger sliding sideways moves too); the rest are out of reach of the
 * mouse, the keyboard and screen readers, and come back as they were left. When the screen
 * turns wider or narrower the first column on screen stays, as far as the
 * last ones allow. Beside the columns, level with their months, the year of the days on screen,
 * and a second one by the last when they reach into it, upright in the card's margin where the
 * columns leave them no room; over the arrows the options counter, since every time is an option
 * (without a mouse, in the middle of the row of the button that shows the "+"). Below 650 px the columns show the hours that leave the
 * whole card on screen with the page at its top. Each column is a group named after its day
 * ("sábado, 20 de junio"); the headers are for the eye only. A marked time is saved with its "+"
 * and waits in a pill under its column (`HourColumn`): a mouse finds each "+" on its time, and
 * without a mouse a button over the forward arrow shows the "+" of every marked time on screen,
 * in red, until one is pressed, the times change, a press lands anywhere else or Escape. As the
 * times and their summary take each other's place, the page is kept as tall as was seen of it
 * (`PartHandover`, from the page), so that their columns stay where they were. What the page puts
 * inside the step shows under the arrows.
 */
@Component({
  selector: 'app-wizard-times',
  imports: [
    ColumnHeader,
    ColumnStrip,
    HourColumn,
    OptionCounter,
    SaveOffer,
    StepPager,
    TranslocoPipe,
  ],
  styleUrl: './wizard-times.scss',
  templateUrl: './wizard-times.html',
})
export class WizardTimes {
  /** The dates chosen in step 2, with the times marked so far. */
  readonly selection = model.required<DateSelection>();
  /**
   * The first column the organizer asked to see, shared with the summary of the times so that
   * each opens on the columns the other showed: the window says where it can be.
   */
  readonly place = model(0);
  /** The organizer goes back to step 2. */
  readonly back = output();
  /** The organizer goes on to the summary of the times. */
  readonly next = output();

  private readonly transloco = inject(TranslocoService);
  private readonly dayFormat = new Intl.DateTimeFormat(this.transloco.getActiveLang(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  private readonly wide = screenMatches(WIDE_QUERY);
  /** How many columns are on screen at a time. */
  protected readonly visible = columnsOnScreen();
  private readonly window = computed<ColumnWindow>(() =>
    columnWindow(this.selection(), this.place(), this.visible()),
  );
  protected readonly first = computed<number>(() => this.window().first);
  protected readonly places = computed<number>(() => this.window().places);
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
  /** Without a mouse, the button over the forward arrow that shows the "+" of the marked times. */
  private readonly offer = viewChild(SaveOffer);
  /** The "+" of every marked time on screen are shown. */
  protected readonly saving = computed<boolean>(() => this.offer()?.shown() ?? false);
  /** Some day on screen has a marked time: there is a "+" to show. */
  protected readonly savable = computed<boolean>(() =>
    this.columns().some(
      (column) => column.onScreen && column.kind === 'day' && column.times.marked.length > 0,
    ),
  );
  /**
   * The years of the days on screen: the first one beside the first column, a second beside the
   * last when the days reach into another year.
   */
  protected readonly firstYear = computed<string>(() => this.window().years[0] ?? '');
  protected readonly secondYear = computed<string>(() => this.window().years[1] ?? '');

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
  private readonly handover = inject(PartHandover, { optional: true });

  constructor() {
    // In the place of the summary, the page is kept as tall as was seen of it.
    this.handover?.arrive(inject(DestroyRef));
  }

  /** On to the summary, which takes the place of the times on the same columns. */
  protected goOn(): void {
    this.handover?.leave();
    this.next.emit();
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

import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  model,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ColumnHeader } from '../../shared/ui/column-header';
import { screenRoom } from '../../shared/ui/screen-room';
import { StepPager } from '../../shared/ui/step-pager';
import { STEP_CARD } from '../../shared/ui/step-stack';
import { type DateSelection, withTimes } from './date-selection';
import type { DayTime } from './day-times';
import { HourColumn } from './hour-column';
import { OptionCounter } from './option-counter';
import { type TimeColumn, type TimeColumnPage, timeColumnPages } from './time-columns';

/** From this width (the tablet breakpoint) four columns fit; below it, three. */
const WIDE_QUERY = '(min-width: 650px)';

/** A column on screen: what tells it from the others, and its name for screen readers. */
type ColumnView = TimeColumn & { readonly key: string; readonly name: string };

/**
 * Step 3 of the wizard, inside its card, reached when times are asked for: the times of each date
 * of its own. Under the label, a column for each date, range and saved range, by first day: a
 * date has its day over the 24 hours, where a press marks a time (`HourColumn`); a range only
 * says it has no times. Four columns are on screen at a time from 650 px and three below, and
 * the two round arrows of the step turn their pages before they leave it (`StepPager`): back to
 * step 2 from the first page, on from the last. Over the columns, the year of the days on
 * screen, a second year at the end of the row when they reach into it, and between them the
 * options counter, since every time is an option. Below 650 px the columns show the hours that
 * leave the whole card on screen with the page at its top. Each column is a group named after its day
 * ("sábado, 20 de junio"); the headers are for the eye only.
 */
@Component({
  selector: 'app-wizard-times',
  imports: [ColumnHeader, HourColumn, OptionCounter, StepPager, TranslocoPipe],
  styleUrl: './wizard-times.scss',
  templateUrl: './wizard-times.html',
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
  private readonly pages = computed<readonly TimeColumnPage[]>(() =>
    timeColumnPages(this.selection(), this.wide() ? 4 : 3),
  );
  protected readonly pageCount = computed<number>(() => this.pages().length);
  /** Back on the first page when the screen turns wider or narrower: the pages are others. */
  protected readonly page = signal(0);
  protected readonly columns = computed<readonly ColumnView[]>(() =>
    (this.pages()[this.page()]?.columns ?? []).map((column) => this.viewOf(column)),
  );
  /** The years of the page: the first one at the start of the row, a second one at its end. */
  protected readonly firstYear = computed<string>(() => this.pages()[this.page()]?.years[0] ?? '');
  protected readonly secondYear = computed<string>(() => this.pages()[this.page()]?.years[1] ?? '');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** Below 650 px, the most a column's list may measure for the step's card to end on screen. */
  protected readonly room = screenRoom(this.host, { boxes: '.hours', end: STEP_CARD }, () => {
    // Read for the measure to be taken again when the page of columns changes.
    this.page();
    return !this.wide();
  });

  constructor() {
    const query = window.matchMedia(WIDE_QUERY);
    this.wide.set(query.matches);
    const changed = (event: MediaQueryListEvent): void => {
      this.wide.set(event.matches);
      this.page.set(0);
    };
    query.addEventListener('change', changed);
    inject(DestroyRef).onDestroy(() => {
      query.removeEventListener('change', changed);
    });
  }

  protected setTimes(date: string, times: readonly DayTime[]): void {
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

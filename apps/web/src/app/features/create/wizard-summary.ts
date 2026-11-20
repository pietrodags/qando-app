import {
  Component,
  type WritableSignal,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ColumnHeader } from '../../shared/ui/column-header';
import { ScrollFold } from '../../shared/ui/scroll-fold';
import { StepPager } from '../../shared/ui/step-pager';
import { foldOf } from '../vote/time-pages';
import { clockLabel } from '../vote/display';
import { ColumnStrip, columnsOnScreen } from './column-strip';
import type { DateSelection } from './date-selection';
import { type DayTime, timesOf } from './day-times';
import { OptionCounter } from './option-counter';
import { type ColumnEdit, type ColumnWindow, type TimeColumn, columnWindow } from './time-columns';

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
 * columns, on from the last. It opens on the column it is asked to (`openAt`), its first
 * unless a column was just corrected alone. Over the columns, the year of the days on screen, a
 * second year when they reach into it, and between them the options counter, as on the steps
 * before it. Under each date of its own, always in sight and right under its box, a pencil,
 * "Editar columna", sends that
 * date back to the times to be corrected alone (`edit`), with the columns then on screen; a
 * range of days has none, as it has no times.
 */
@Component({
  selector: 'app-wizard-summary',
  imports: [ColumnHeader, ColumnStrip, OptionCounter, ScrollFold, StepPager, TranslocoPipe],
  styleUrl: './wizard-summary.scss',
  templateUrl: './wizard-summary.html',
})
export class WizardSummary {
  /** The dates chosen, with their times. */
  readonly selection = input.required<DateSelection>();
  /** The place of the first column on screen when the step opens, from 0. */
  readonly openAt = input(0);
  /** The organizer goes back to the times. */
  readonly back = output();
  /** The organizer asks to correct the times of a date alone, with its pencil. */
  readonly edit = output<ColumnEdit>();
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
  /** The first column the organizer asked to see, at first `openAt`: the window says where it can be. */
  protected readonly asked: WritableSignal<number> = linkedSignal<number>(() => this.openAt());
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

  /** The pencil of a date: its times are corrected alone, the columns on screen kept. */
  protected correct(date: string): void {
    this.edit.emit({ date, first: this.first() });
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
    return {
      ...column,
      key: column.date,
      name: this.dayName(column.date),
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

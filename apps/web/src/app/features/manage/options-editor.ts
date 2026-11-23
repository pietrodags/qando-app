import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  type WritableSignal,
  computed,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { ManagedEvent, Option } from '@qando/contracts';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { Step, StepStack } from '../../shared/ui/step-stack';
import { Toaster } from '../../shared/ui/toast';
import {
  type DateSelection,
  NO_DATES,
  asksForTimes,
  proposedOptions,
  selectionOf,
} from '../create/date-selection';
import { monthOf } from '../create/month-grid';
import type { NoticeLine } from '../create/notice-box';
import { today } from '../create/today';
import { WizardDates } from '../create/wizard-dates';
import { WizardSummary } from '../create/wizard-summary';
import { WizardTimes } from '../create/wizard-times';
import { OptionLabels } from '../results/option-labels';
import { EventManagement } from './event-management';

/** The card of the times, and of their summary in their place. */
const TIMES_STEP = 2;

/** The event's options as the editor starts from them. */
interface Draft {
  /** The event's zone: today is taken in it, and phrases are read in it. */
  readonly timeZone: string;
  /** The dates and times of the options left, as the calendar marks them. */
  readonly selection: DateSelection;
  /** The month the calendar opens on, as `YYYY-MM`. */
  readonly month: string;
  /** One line for each option left out because it has gone. */
  readonly notices: readonly NoticeLine[];
  /** The IDs of every option the event had: the new options replace them all. */
  readonly replacing: readonly string[];
}

/** The first day of an option. */
function firstDayOf(option: Option): string {
  return option.dates.kind === 'single' ? option.dates.date : option.dates.start;
}

/** The last day of an option. */
function lastDayOf(option: Option): string {
  return option.dates.kind === 'single' ? option.dates.date : option.dates.end;
}

/** Whether an event's options can still change: voting open, nobody has voted. */
function editable(event: ManagedEvent): boolean {
  return event.state === 'open' && event.voters === 0;
}

/**
 * "Editar opciones", at `manage/:eventId/options`: the creation wizard's dates and times, without
 * its first and last steps, on the options of an event whose voting is open and nobody has voted
 * yet. It reads the event; one this browser does not manage, or whose options can no longer
 * change (someone voted, voting closed, a date confirmed), sends the organizer back to its
 * management page, which shows why.
 *
 * The options that have gone, those before today in the event's zone and the ranges already
 * begun, are left out and told above the calendar, one line each; the calendar opens on the month
 * of the first option left, or on today's month with none. The cards are "fechas" and, while
 * times are asked for, "horarios" (the times, then their summary in their place); the dates have
 * no arrow back. The last card's tick saves: the options as they now are replace every option the
 * event had, a spinner on the tick meanwhile and the other card closed. Saved, the organizer is
 * back on the management page with a message that says so; refused (someone voted, the options
 * or the event changed meanwhile, the browser no longer manages it), back on that page too. A
 * save that did not get through is told in red under the arrows of the card that saved, with
 * "Reintentar". "Volver sin guardar", under the arrows of every card, leaves without saving. An
 * answer that comes after the editor is left does nothing; a reload starts again from the
 * event's options.
 */
@Component({
  selector: 'app-options-editor',
  imports: [
    ErrorState,
    LoadingState,
    NgTemplateOutlet,
    RouterLink,
    Step,
    StepStack,
    TranslocoPipe,
    WizardDates,
    WizardSummary,
    WizardTimes,
  ],
  styleUrl: './options-editor.scss',
  templateUrl: './options-editor.html',
})
export class OptionsEditor {
  /** The event, from the address. */
  readonly eventId = input.required<string>();

  private readonly management = inject(EventManagement);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);
  private readonly transloco = inject(TranslocoService);
  private readonly labels = inject(OptionLabels);
  /** The editor is still on screen: an answer that comes after it is left does nothing. */
  private present = true;

  /** The options to start from; `null` while the organizer is sent back to the event's page. */
  protected readonly view = resource<Draft | null, string>({
    params: () => this.eventId(),
    loader: async ({ params: eventId }) => {
      const read = await this.management.read(eventId);
      if (read.kind === 'managed' && editable(read.event)) return this.draftOf(read.event);
      this.back(eventId);
      return null;
    },
  });
  private readonly draft = computed<Draft | null>(() =>
    this.view.hasValue() ? this.view.value() : null,
  );

  protected readonly step = signal(1);
  protected readonly dates: WritableSignal<DateSelection> = linkedSignal<
    Draft | null,
    DateSelection
  >({
    source: this.draft,
    computation: (draft) => draft?.selection ?? NO_DATES,
  });
  protected readonly month: WritableSignal<string> = linkedSignal<Draft | null, string>({
    source: this.draft,
    computation: (draft) => draft?.month ?? '',
  });
  protected readonly notices: WritableSignal<readonly NoticeLine[]> = linkedSignal<
    Draft | null,
    readonly NoticeLine[]
  >({
    source: this.draft,
    computation: (draft) => draft?.notices ?? [],
  });
  /** What is written in the smart calendar's box. */
  protected readonly phrase = signal('');
  /** The card of the times shows their summary: never as it is reached from the dates. */
  protected readonly summary = signal(false);
  /** The first column on screen, the same for the times and their summary. */
  protected readonly place = signal(0);
  /** The editor has the card of the times. */
  protected readonly timesAsked = computed<boolean>(() => asksForTimes(this.dates()));
  /** The new options are on their way: the tick shows a spinner, and the other card is closed. */
  protected readonly saving = signal(false);
  /** The last save did not get through. */
  protected readonly failed = signal(false);

  private readonly stack = viewChild.required(StepStack);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.present = false;
    });
  }

  /** The dates go on: to the times while they are asked for, or else they are saved. */
  protected datesDone(replacing: readonly string[]): void {
    if (!this.timesAsked()) {
      void this.save(replacing);
      return;
    }
    this.summary.set(false);
    this.step.set(TIMES_STEP);
  }

  /** The card of the times shows their summary, or the times again. */
  protected showSummary(shown: boolean): void {
    this.summary.set(shown);
    // The control pressed is gone with its part: the focus goes to the card, as on a change of step.
    this.stack().focusCard();
  }

  /** Saves the options as they now are in place of every option the event had. */
  protected async save(replacing: readonly string[]): Promise<void> {
    const eventId = this.eventId();
    this.saving.set(true);
    this.failed.set(false);
    try {
      const answer = await this.management.replaceOptions(
        eventId,
        proposedOptions(this.dates()),
        replacing,
      );
      if (answer === 'saved' && this.present) {
        this.toaster.show(this.transloco.translate('manage.editor.saved'));
      }
      this.back(eventId);
    } catch {
      this.saving.set(false);
      this.failed.set(true);
    }
  }

  /** Back to the event's management page, in the editor's place, unless it was left already. */
  private back(eventId: string): void {
    if (this.present) void this.router.navigate(['/manage', eventId], { replaceUrl: true });
  }

  private draftOf(event: ManagedEvent): Draft {
    const first = today(event.timeZone);
    const left = event.options.filter((option) => firstDayOf(option) >= first);
    const gone = event.options.filter((option) => firstDayOf(option) < first);
    return {
      timeZone: event.timeZone,
      selection: selectionOf(left),
      month: monthOf(left[0] === undefined ? first : firstDayOf(left[0])),
      notices: gone.map((option) => ({
        lead: this.labels.plain(option),
        text: this.transloco.translate(
          lastDayOf(option) >= first ? 'manage.editor.begun' : 'manage.editor.gone',
        ),
      })),
      replacing: event.options.map((option) => option.id),
    };
  }
}

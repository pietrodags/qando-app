import { Component, type WritableSignal, computed, linkedSignal, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { EventDetails } from '@qando/domain';
import { Step, StepStack } from '../../shared/ui/step-stack';
import { type DateSelection, NO_DATES, asksForTimes } from './date-selection';
import { monthOf } from './month-grid';
import type { ColumnEdit } from './time-columns';
import { today } from './today';
import { WizardDates } from './wizard-dates';
import { WizardDetails } from './wizard-details';
import { WizardSummary } from './wizard-summary';
import { WizardTimes } from './wizard-times';

/**
 * The event creation wizard, on the home page: the organizer's steps as a stack of cards. The page
 * holds what each step asks, so a step folding into its tab and coming back loses nothing. Step 1
 * (name and title), step 2 (the dates, on a calendar that opens on the current month), the times
 * of the dates and their summary are built: the times are step 3 and the summary of every option
 * step 4 only while times are asked for and a date of its own can have them, and the step after
 * them counts from there. The pencil of a date on the summary sends it back to the times to be
 * corrected alone, at the columns the summary had, and the times' arrow forward brings the
 * summary back at those columns; any other change of step ends it. The later steps come with
 * their own stories.
 */
@Component({
  selector: 'app-create-page',
  imports: [StepStack, Step, TranslocoPipe, WizardDates, WizardDetails, WizardSummary, WizardTimes],
  styleUrl: './create-page.scss',
  templateUrl: './create-page.html',
})
export class CreatePage {
  protected readonly step = signal(1);
  protected readonly details = signal<EventDetails>({ organizerName: '', title: '' });
  protected readonly dates = signal<DateSelection>(NO_DATES);
  /** What is written in the smart calendar's box. */
  protected readonly phrase = signal('');
  /** The wizard has the times step. */
  protected readonly timesAsked = computed<boolean>(() => asksForTimes(this.dates()));
  /** The month the calendar shows, as `YYYY-MM`. */
  protected readonly month = signal<string>(monthOf(today()));
  /** The date the summary sent back to the times to be corrected alone, until the step changes. */
  protected readonly alone: WritableSignal<ColumnEdit | null> = linkedSignal<
    number,
    ColumnEdit | null
  >({ source: this.step, computation: () => null });
  /** Where the summary opens: at its first column, unless a column was just corrected alone. */
  protected readonly summaryAt: WritableSignal<number> = linkedSignal<number, number>({
    source: this.step,
    computation: () => 0,
  });

  /** The pencil of a date on the summary: the times, with that column alone. */
  protected correct(column: ColumnEdit): void {
    this.step.set(3);
    this.alone.set(column);
  }

  /** On from the times to the summary, at the columns it had if a column was corrected alone. */
  protected toSummary(): void {
    const at = this.alone()?.first ?? 0;
    this.step.set(4);
    this.summaryAt.set(at);
  }
}

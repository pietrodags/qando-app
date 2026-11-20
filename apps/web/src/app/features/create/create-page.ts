import { Component, computed, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { EventDetails } from '@qando/domain';
import { Step, StepStack } from '../../shared/ui/step-stack';
import { CreateDone } from './create-done';
import { type DateSelection, NO_DATES, asksForTimes } from './date-selection';
import { monthOf } from './month-grid';
import { today } from './today';
import { WizardDates } from './wizard-dates';
import { WizardDetails } from './wizard-details';
import {
  type CreatedEvent,
  type EventEnding,
  NO_ENDING,
  type SentEvent,
  WizardFinish,
} from './wizard-finish';
import { WizardSummary } from './wizard-summary';
import { WizardTimes } from './wizard-times';

/**
 * The event creation wizard, on the home page: the organizer's steps as a stack of cards. The page
 * holds what each step asks, so a step folding into its tab and coming back loses nothing. Step 1
 * (name and title), step 2 (the dates, on a calendar that opens on the current month), the times
 * of the dates and their summary, and the last step: the times are step 3 and the summary of every
 * option step 4 only while times are asked for and a date of its own can have them, and the last
 * step (the deadline, a note, anonymous voting and "Crear") counts from there. While the event is
 * sent, the other steps stay closed. Once it is created, "¡Hecho!" takes the place of the whole
 * stack: going back to a step would no longer change the event. The page holds the event as it
 * was last sent and its management token (`SentEvent`), so sending the same event again after a
 * lost answer, also after a visit to another step, stores it once. "Crear otro evento" brings the
 * wizard back on step 1 with nothing asked, as the page first opens.
 */
@Component({
  selector: 'app-create-page',
  imports: [
    CreateDone,
    StepStack,
    Step,
    TranslocoPipe,
    WizardDates,
    WizardDetails,
    WizardFinish,
    WizardSummary,
    WizardTimes,
  ],
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
  /** The number of the last step: after the summary when times are asked for. */
  protected readonly lastStep = computed<number>(() => (this.timesAsked() ? 5 : 3));
  /** The month the calendar shows, as `YYYY-MM`. */
  protected readonly month = signal<string>(monthOf(today()));
  /** What the last step asks: the deadline, the note and anonymous voting. */
  protected readonly ending = signal<EventEnding>(NO_ENDING);
  /** The event as last sent and its management token, so sending it again repeats the token. */
  protected readonly sent = signal<SentEvent | null>(null);
  /** The event is on its way: the other steps stay closed. */
  protected readonly sending = signal(false);
  /** The event created, once it is: "¡Hecho!" shows it. */
  protected readonly created = signal<CreatedEvent | null>(null);

  /** "Crear otro evento": the wizard as the page first opens, on step 1 with nothing asked. */
  protected startAgain(): void {
    this.step.set(1);
    this.details.set({ organizerName: '', title: '' });
    this.dates.set(NO_DATES);
    this.phrase.set('');
    this.month.set(monthOf(today()));
    this.ending.set(NO_ENDING);
    this.sent.set(null);
    this.sending.set(false);
    this.created.set(null);
  }
}

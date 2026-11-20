import { Component, computed, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { EventDetails } from '@qando/domain';
import { Step, StepStack } from '../../shared/ui/step-stack';
import { type DateSelection, NO_DATES, asksForTimes } from './date-selection';
import { monthOf } from './month-grid';
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
 * them counts from there. The later steps come with their own stories.
 */
@Component({
  selector: 'app-create-page',
  imports: [StepStack, Step, TranslocoPipe, WizardDates, WizardDetails, WizardSummary, WizardTimes],
  styleUrl: './create-page.scss',
  template: `
    <main class="page">
      <app-step-stack [(current)]="step">
        <ng-template [appStep]="'create.step' | transloco: { step: 1 }" accent="blue">
          <app-wizard-details [(details)]="details" (next)="step.set(2)" />
        </ng-template>
        <ng-template [appStep]="'create.step' | transloco: { step: 2 }" accent="teal">
          <app-wizard-dates
            [(selection)]="dates"
            [(month)]="month"
            [(phrase)]="phrase"
            (back)="step.set(1)"
            (next)="step.set(3)"
          />
        </ng-template>
        @if (timesAsked()) {
          <ng-template [appStep]="'create.step' | transloco: { step: 3 }" accent="amber">
            <app-wizard-times [(selection)]="dates" (back)="step.set(2)" (next)="step.set(4)" />
          </ng-template>
          <ng-template [appStep]="'create.step' | transloco: { step: 4 }" accent="amber">
            <app-wizard-summary [selection]="dates()" (back)="step.set(3)" (next)="step.set(5)" />
          </ng-template>
        }
        <ng-template [appStep]="'create.step' | transloco: { step: timesAsked() ? 5 : 3 }">
          <p class="building">{{ 'pages.placeholder' | transloco }}</p>
        </ng-template>
      </app-step-stack>
    </main>
  `,
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
}

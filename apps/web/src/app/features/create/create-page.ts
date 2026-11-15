import { Component, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { EventDetails } from '@qando/domain';
import { Step, StepStack } from '../../shared/ui/step-stack';
import { WizardDetails } from './wizard-details';

/**
 * The event creation wizard, on the home page: the organizer's steps as a stack of cards. The page
 * holds what each step asks, so a step folding into its tab and coming back loses nothing. Step 1
 * (name and title) is built; the dates and the later steps come with their own stories.
 */
@Component({
  selector: 'app-create-page',
  imports: [StepStack, Step, TranslocoPipe, WizardDetails],
  styleUrl: './create-page.scss',
  template: `
    <main class="page">
      <app-step-stack [(current)]="step">
        <ng-template [appStep]="'create.step' | transloco: { step: 1 }" accent="blue">
          <app-wizard-details [(details)]="details" (next)="step.set(2)" />
        </ng-template>
        <ng-template [appStep]="'create.step' | transloco: { step: 2 }">
          <p class="building">{{ 'pages.placeholder' | transloco }}</p>
        </ng-template>
      </app-step-stack>
    </main>
  `,
})
export class CreatePage {
  protected readonly step = signal(1);
  protected readonly details = signal<EventDetails>({ organizerName: '', title: '' });
}

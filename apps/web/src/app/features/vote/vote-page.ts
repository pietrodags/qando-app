import { Component, computed, input, linkedSignal, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { publicEventEndpoint } from '@qando/contracts';
import { apiResource } from '../../core/api/api-resource';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { Step, StepStack } from '../../shared/ui/step-stack';
import { type Answers, allAvailable } from './answers';
import { VoteDays } from './vote-days';
import { VoteWelcome } from './vote-welcome';

/**
 * The voting page, opened with the participation link: reads the event and walks the voter
 * through the steps as a stack of cards. Holds what the steps share: the voter's name and the
 * answers, kept while the voter goes back and forth.
 */
@Component({
  selector: 'app-vote-page',
  imports: [ErrorState, LoadingState, Step, StepStack, TranslocoPipe, VoteDays, VoteWelcome],
  styleUrl: './vote-page.scss',
  template: `
    <main class="page">
      @if (event.hasValue()) {
        <app-step-stack [(current)]="step">
          <ng-template [appStep]="'vote.step' | transloco: { step: 1 }">
            <app-vote-welcome [event]="event.value()" [(name)]="name" (choose)="chooseDays()" />
          </ng-template>
          <!-- Without times the days are the last step, so they take its colour. -->
          <ng-template [appStep]="'vote.step' | transloco: { step: 2 }" accent="amber">
            <app-vote-days
              [options]="event.value().options"
              [(answers)]="answers"
              (back)="step.set(1)"
            />
          </ng-template>
        </app-step-stack>
      } @else if (event.error()) {
        <app-error-state (retry)="event.reload()" />
      } @else {
        <app-loading-state />
      }
    </main>
  `,
})
export class VotePage {
  /** The participation ID, from the route. */
  readonly eventId = input.required<string>();

  protected readonly event = apiResource(publicEventEndpoint, () => ({ id: this.eventId() }));
  protected readonly step = signal(1);
  protected readonly name = signal('');
  protected readonly answers = linkedSignal<Answers>(() =>
    allAvailable(this.event.hasValue() ? this.event.value().options.map(({ id }) => id) : []),
  );

  private readonly hasTimes = computed(
    () => this.event.hasValue() && this.event.value().options.some(({ time }) => time !== null),
  );

  protected chooseDays(): void {
    // Events with times choose the days and then their times: those steps come later.
    if (!this.hasTimes()) this.step.set(2);
  }
}

import { Component, input, signal } from '@angular/core';
import { publicEventEndpoint } from '@qando/contracts';
import { apiResource } from '../../core/api/api-resource';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { VoteWelcome } from './vote-welcome';

/**
 * The voting page, opened with the participation link: reads the event and walks the voter
 * through the steps. Holds what the steps share, such as the voter's name.
 */
@Component({
  selector: 'app-vote-page',
  imports: [ErrorState, LoadingState, VoteWelcome],
  styleUrl: './vote-page.scss',
  template: `
    <main class="page">
      @if (event.hasValue()) {
        <app-vote-welcome [event]="event.value()" [(name)]="name" />
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
  protected readonly name = signal('');
}

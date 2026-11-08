import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { requestFailure, waiting } from '../../core/api/request-failure';

/**
 * A message when a page could not get its data, with "Reintentar" when trying again can help.
 * Given the error, a rate limit says so and counts its seconds down on the button, disabled
 * until it reaches 0.
 */
@Component({
  selector: 'app-error-state',
  imports: [TranslocoPipe],
  styleUrl: './error-state.scss',
  template: `
    <div class="error">
      <p class="message" role="alert">
        {{
          limited()
            ? ('common.rateLimited.message' | transloco)
            : (message() ?? ('common.loadError' | transloco))
        }}
      </p>
      @if (retryable()) {
        <button class="retry" type="button" [disabled]="waiting()" (click)="retry.emit()">
          @if (waiting()) {
            {{ 'common.rateLimited.retryIn' | transloco: { seconds: seconds() } }}
          } @else {
            {{ 'common.retry' | transloco }}
          }
        </button>
      }
    </div>
  `,
})
export class ErrorState {
  /** Already translated; "No se ha podido cargar" when not given. */
  readonly message = input<string>();
  readonly retryable = input(true);
  /** The error the page failed with, when it may be a rate limit. */
  readonly error = input<unknown>();
  readonly retry = output();

  private readonly failure = requestFailure(() => this.error());
  protected readonly limited = computed<boolean>(() => this.failure()?.kind === 'limited');
  protected readonly waiting = computed<boolean>(() => waiting(this.failure()));
  protected readonly seconds = computed<number>(() => {
    const failure = this.failure();
    return failure?.kind === 'limited' ? failure.seconds : 0;
  });
}

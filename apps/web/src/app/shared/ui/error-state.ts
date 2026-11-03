import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** A message when a page could not get its data, with "Reintentar" when trying again can help. */
@Component({
  selector: 'app-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  styleUrl: './error-state.scss',
  template: `
    <div class="error">
      <p class="message" role="alert">{{ message() ?? ('common.loadError' | transloco) }}</p>
      @if (retryable()) {
        <button class="retry" type="button" (click)="retry.emit()">
          {{ 'common.retry' | transloco }}
        </button>
      }
    </div>
  `,
})
export class ErrorState {
  /** Already translated; "No se ha podido cargar" when not given. */
  readonly message = input<string>();
  readonly retryable = input(true);
  readonly retry = output();
}

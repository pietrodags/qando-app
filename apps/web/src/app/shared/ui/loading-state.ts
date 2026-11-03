import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** A spinner and a message while a page waits for its data. */
@Component({
  selector: 'app-loading-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  styleUrl: './loading-state.scss',
  template: `
    <div class="loading">
      <span class="spinner" aria-hidden="true"></span>
      <p class="message" role="status">{{ message() ?? ('common.loading' | transloco) }}</p>
    </div>
  `,
})
export class LoadingState {
  /** Already translated; "Cargando…" when not given. */
  readonly message = input<string>();
}

import { Component, computed } from '@angular/core';
import { translateSignal } from '@jsverse/transloco';
import { healthEndpoint } from '@qando/contracts';
import { apiError, apiResource } from '../../core/api/api-resource';

type ServiceState = 'checking' | 'up' | 'down';

/**
 * Temporary home page: shows that the deployed web reaches the API and the database.
 * The event wizard replaces it. Also the sample page of the design tokens.
 */
@Component({
  selector: 'app-create-page',
  styleUrl: './create-page.scss',
  template: `
    <main class="page">
      <section class="card">
        <p class="step-label">paso 1</p>
        <h1 class="title">{{ brand() }}</h1>
        <p class="status" data-testid="api-status" role="status" [attr.data-state]="state()">
          {{ statusText() }}
        </p>
      </section>
    </main>
  `,
})
export class CreatePage {
  private readonly health = apiResource(healthEndpoint);

  protected readonly brand = translateSignal('common.brand');

  protected readonly state = computed<ServiceState>(() => {
    if (this.health.isLoading()) {
      return 'checking';
    }
    return this.health.hasValue() ? 'up' : 'down';
  });

  private readonly statusKey = computed(() => {
    switch (this.state()) {
      case 'checking':
        return 'create.health.checking';
      case 'up':
        return 'create.health.up';
      case 'down':
        return apiError(healthEndpoint, this.health.error())?.body.database === 'down'
          ? 'create.health.databaseDown'
          : 'create.health.apiDown';
    }
  });

  protected readonly statusText = translateSignal(this.statusKey);
}

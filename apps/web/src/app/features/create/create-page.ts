import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { healthEndpoint } from '@qando/contracts';
import { apiError, apiResource } from '../../core/api/api-resource';

/**
 * Temporary home page: shows that the deployed web reaches the API and the database.
 * The event wizard replaces it.
 */
@Component({
  selector: 'app-create-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>qando</h1>
      <p data-testid="api-status" role="status">{{ statusText() }}</p>
    </main>
  `,
})
export class CreatePage {
  private readonly health = apiResource(healthEndpoint);

  protected readonly statusText = computed(() => {
    if (this.health.isLoading()) {
      return 'Comprobando el servicio…';
    }
    if (apiError(healthEndpoint, this.health.error())?.body.database === 'down') {
      return 'La base de datos no responde';
    }
    if (!this.health.hasValue()) {
      return 'El servicio no responde';
    }
    return 'Servicio funcionando';
  });
}

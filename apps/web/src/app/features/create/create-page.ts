import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';

interface Health {
  status: 'ok' | 'unavailable';
  database: 'up' | 'down';
}

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
  private readonly health = httpResource<Health>(() => '/api/health');

  protected readonly statusText = computed(() => {
    if (this.health.isLoading()) {
      return 'Comprobando el servicio…';
    }
    const error = this.health.error();
    if (error instanceof HttpErrorResponse && error.status === 503) {
      return 'La base de datos no responde';
    }
    if (error || this.health.value()?.status !== 'ok') {
      return 'El servicio no responde';
    }
    return 'Servicio funcionando';
  });
}

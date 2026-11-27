import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { connectorPath } from '@qando/contracts';
import { LinkCopier } from '../../shared/ui/link-copier';

/**
 * How to connect an assistant: the sentence, then the connector's address in full in a white
 * well, as the management page's links, with "Copiar".
 */
@Component({
  selector: 'app-connector-address',
  imports: [TranslocoPipe],
  styleUrl: './connector-address.scss',
  template: `
    <p class="help">{{ 'connectedApps.howTo' | transloco }}</p>
    <ul class="wells">
      <li class="well">
        <span class="url">{{ address }}</span>
        <span class="actions">
          <button type="button" class="action" (click)="copy()">
            {{ 'manage.links.copy' | transloco }}
          </button>
        </span>
      </li>
    </ul>
  `,
})
export class ConnectorAddress {
  private readonly copier = inject(LinkCopier);
  protected readonly address = `${location.origin}${connectorPath}`;

  protected copy(): Promise<void> {
    return this.copier.copy(this.address);
  }
}

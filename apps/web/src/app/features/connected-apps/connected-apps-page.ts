import {
  afterNextRender,
  Component,
  computed,
  type ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  type ConnectedApplication,
  connectedApplicationsEndpoint,
  disconnectApplicationEndpoint,
} from '@qando/contracts';
import { ApiClient } from '../../core/api/api-client';
import { apiError, apiResource } from '../../core/api/api-resource';
import { signInAgainOnceEnded } from '../../core/auth/session-ended';
import { AskFirstButton } from '../../shared/ui/ask-first-button';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { Toaster } from '../../shared/ui/toast';
import { longDate } from '../vote/display';
import { ConnectorAddress } from './connector-address';

/** One application as its row shows it. */
interface Row {
  readonly id: string;
  readonly name: string;
  /** Its host and the day it was connected. */
  readonly line: string;
  /** "Desconectar" as screen readers name it: with the application. */
  readonly disconnectLabel: string;
}

/**
 * "Apps conectadas": the applications (AI assistants) the signed-in account allowed to act for it,
 * the newest connection first, each with "Desconectar", which asks in its place first. A row
 * leaves once the API says the application no longer acts for the account, also when it had been
 * disconnected meanwhile (another tab); disconnecting that fails keeps the row and says so. With
 * none, the page says how to connect one. A session that ended since the page opened sends to the
 * sign-in page, which comes back here.
 */
@Component({
  selector: 'app-connected-apps-page',
  imports: [AskFirstButton, ConnectorAddress, ErrorState, LoadingState, TranslocoPipe],
  styleUrl: './connected-apps-page.scss',
  templateUrl: './connected-apps-page.html',
})
export class ConnectedAppsPage {
  private readonly transloco = inject(TranslocoService);
  private readonly locale = this.transloco.getActiveLang();
  private readonly api = inject(ApiClient);
  private readonly toaster = inject(Toaster);
  private readonly injector = inject(Injector);

  protected readonly applications = apiResource(connectedApplicationsEndpoint);
  protected readonly rows = computed<readonly Row[]>(() =>
    (this.applications.value() ?? []).map((application) => this.rowOf(application)),
  );
  /** Disconnecting answered 401. */
  private readonly ended = signal<boolean>(false);
  /** The session ended: the page is on its way to the sign-in page, so it shows no error. */
  protected readonly sessionEnded = computed<boolean>(
    () =>
      this.ended() ||
      apiError(connectedApplicationsEndpoint, this.applications.error())?.status === 401,
  );

  /** The connections being disconnected, until the API answers. */
  private readonly leaving = new Set<string>();
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  constructor() {
    signInAgainOnceEnded(this.sessionEnded, '/connected-apps');
  }

  protected async disconnect(id: string): Promise<void> {
    if (this.leaving.has(id)) return;
    this.leaving.add(id);
    try {
      await this.api.send(disconnectApplicationEndpoint, { params: { id } });
    } catch (error) {
      const status = apiError(disconnectApplicationEndpoint, error)?.status;
      if (status === 401) this.ended.set(true);
      // Not found: already disconnected, as asked.
      else if (status !== 404)
        this.toaster.show(this.transloco.translate('connectedApps.disconnectFailed'));
      if (status !== 404) return;
    } finally {
      this.leaving.delete(id);
    }
    this.applications.value.update((listed) => listed?.filter((each) => each.id !== id));
    // Its row, and the focus it held, are gone: the focus goes to the top of the card.
    afterNextRender(
      () => {
        this.heading().nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  private rowOf({ id, name, host, connectedAt }: ConnectedApplication): Row {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // The year kept with its "de", as the catalogue keeps a last word from standing alone.
    const date = longDate(connectedAt, this.locale, timeZone).replace(/ (\d+)$/, ' $1');
    return {
      id,
      name,
      line: this.transloco.translate('connectedApps.connected', { host, date }),
      disconnectLabel: this.transloco.translate('connectedApps.disconnectLabel', { name }),
    };
  }
}

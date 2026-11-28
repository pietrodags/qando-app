import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
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
import { AssistantName } from '../../shared/ui/assistant-name';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { Toaster } from '../../shared/ui/toast';
import { longDate } from '../vote/display';
import { ConnectorAddress } from './connector-address';

/** One application as its row shows it. */
interface Row {
  readonly id: string;
  readonly name: string;
  readonly host: string;
  /** Its host and the day it was connected. */
  readonly line: string;
  /** "Desconectar" as screen readers name it: with the application. */
  readonly disconnectLabel: string;
}

/**
 * "Apps conectadas": the applications (AI assistants) the signed-in account allowed to act for it,
 * the newest connection first, each with "Desconectar", which asks in its place first. A row
 * leaves once the API says the application no longer acts for the account, also when the account
 * no longer had that connection (another tab), and then the list is read again; disconnecting
 * that fails keeps the row and says so. Once the page is left, an answer changes nothing. With
 * none, the page says how to connect one. A session that ended since the page opened sends to the
 * sign-in page, which comes back here.
 */
@Component({
  selector: 'app-connected-apps-page',
  imports: [
    AskFirstButton,
    AssistantName,
    ConnectorAddress,
    ErrorState,
    LoadingState,
    TranslocoPipe,
  ],
  styleUrl: './connected-apps-page.scss',
  templateUrl: './connected-apps-page.html',
})
export class ConnectedAppsPage {
  private readonly transloco = inject(TranslocoService);
  private readonly locale = this.transloco.getActiveLang();
  private readonly api = inject(ApiClient);
  private readonly toaster = inject(Toaster);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

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
    const status = await this.disconnection(id);
    this.leaving.delete(id);
    // Left before the API answered: the answer changes nothing.
    if (this.destroyRef.destroyed) return;
    if (status === 401) {
      this.ended.set(true);
      return;
    }
    if (status !== 200 && status !== 404) {
      this.toaster.show(this.transloco.translate('connectedApps.disconnectFailed'));
      return;
    }
    this.applications.value.update((listed) => listed?.filter((each) => each.id !== id));
    // Not found: a connection the account no longer has. Disconnected meanwhile, connected again
    // since (under a new connection) or another account signed in, all in another tab: the list
    // is read again, to show what the account has now.
    if (status === 404) this.applications.reload();
    afterNextRender(
      () => {
        // The focus left with its row: it goes to the top of the card. Moved on meanwhile, it
        // stays where the user put it.
        if (this.document.activeElement === this.document.body)
          this.heading().nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  /** The API's answer to disconnecting: its status, undefined when the API could not be reached. */
  private async disconnection(id: string): Promise<number | undefined> {
    try {
      await this.api.send(disconnectApplicationEndpoint, { params: { id } });
      return 200;
    } catch (error) {
      return apiError(disconnectApplicationEndpoint, error)?.status;
    }
  }

  private rowOf({ id, name, host, connectedAt }: ConnectedApplication): Row {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // The year kept with its "de", as the catalogue keeps a last word from standing alone.
    const date = longDate(connectedAt, this.locale, timeZone).replace(/ (\d+)$/, ' $1');
    return {
      id,
      name,
      host,
      line: this.transloco.translate('connectedApps.connected', { host, date }),
      disconnectLabel: this.transloco.translate('connectedApps.disconnectLabel', { name }),
    };
  }
}

import {
  afterRenderEffect,
  Component,
  computed,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { type MyEvent, myEventsEndpoint } from '@qando/contracts';
import { apiError, apiResource } from '../../core/api/api-resource';
import { signInAgainOnceEnded } from '../../core/auth/session-ended';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { longDate } from '../vote/display';

/** One event as its row shows it: where it leads, its title and its state line. */
interface Row {
  readonly id: string;
  readonly title: string;
  /** The catalogue's line, with its own markup around the date; never the organizer's text. */
  readonly line: string;
  /** Voting has ended: the line starts with a lock. */
  readonly ended: boolean;
}

/**
 * "Mis eventos": the signed-in account's events, newest first, each row opening its management
 * page. A long list scrolls inside the card and fades at its foot while rows wait below. A session
 * that ended since the page opened sends to the sign-in page, which comes back here.
 */
@Component({
  selector: 'app-my-events-page',
  imports: [ErrorState, LoadingState, RouterLink, TranslocoPipe],
  styleUrl: './my-events-page.scss',
  templateUrl: './my-events-page.html',
  host: { '(window:resize)': 'measure()' },
})
export class MyEventsPage {
  private readonly transloco = inject(TranslocoService);
  private readonly locale = this.transloco.getActiveLang();

  protected readonly events = apiResource(myEventsEndpoint);
  protected readonly rows = computed<readonly Row[]>(() =>
    (this.events.value() ?? []).map((event) => this.rowOf(event)),
  );
  /** The session ended: the page is on its way to the sign-in page, so it shows no error. */
  protected readonly sessionEnded = computed<boolean>(
    () => apiError(myEventsEndpoint, this.events.error())?.status === 401,
  );
  protected readonly moreBelow = signal<boolean>(false);

  private readonly listElement = viewChild<ElementRef<HTMLElement>>('list');

  constructor() {
    signInAgainOnceEnded(this.sessionEnded, '/my-events');
    afterRenderEffect(() => {
      this.measure();
    });
  }

  /**
   * Whether rows wait below the list's foot (a fraction of a pixel left, from zooming, is none):
   * when the list appears, on its scroll and on a window resize.
   */
  protected measure(): void {
    const list = this.listElement()?.nativeElement;
    if (!list) return;
    this.moreBelow.set(list.scrollHeight - list.clientHeight - list.scrollTop >= 1);
  }

  private rowOf({ id, title, state, deadline }: MyEvent): Row {
    if (state === 'confirmed') {
      return { id, title, line: this.transloco.translate('myEvents.state.confirmed'), ended: true };
    }
    const line = this.transloco.translate(`manage.state.${state}`, {
      deadline: longDate(deadline, this.locale),
    });
    return { id, title, line, ended: state === 'closed' };
  }
}

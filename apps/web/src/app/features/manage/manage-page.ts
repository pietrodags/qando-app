import {
  Component,
  type ElementRef,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  viewChild,
  type WritableSignal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { ManagedEvent } from '@qando/contracts';
import { requestFailure } from '../../core/api/request-failure';
import { signInFrom } from '../../core/auth/sign-in-return';
import { ErrorState } from '../../shared/ui/error-state';
import { HoverTip } from '../../shared/ui/hover-tip';
import { LoadingState } from '../../shared/ui/loading-state';
import { ShareLinks } from '../../shared/ui/share-links';
import { Tooltip } from '../../shared/ui/tooltip';
import { longDate } from '../vote/display';
import { VoteEnded } from '../vote/vote-ended';
import { notSavedOnArrival } from './back-to-management';
import { CancelEvent } from './cancel-event';
import { EventDeadline } from './event-deadline';
import { EventEmails } from './event-emails';
import { EventLinks } from './event-links';
import { EventManagement, type Management } from './event-management';
import { FinalDate, type FinalDateNotice } from './final-date';

/**
 * The management page, opened with the management link once `openManagementLink` has taken its
 * token: the event's title and state, the choice of its final date (or the confirmed one), its
 * deadline, its links and the state of its emails, which show the event again as they read or
 * change it, and last "Cancelar evento". A browser with no management link of the event and no
 * live session (the session ended) is sent to sign in, in place of the page in the history, and
 * signing in comes back to it; one whose link does not manage the event is refused; a cancelled
 * event shows its kept title with the message to tell the group, every time it opens; only a
 * failed request offers to try again. Confirming sends the choice and shows the event as the
 * API answers it, the confirmed date or the one confirmed meanwhile, or its new options with a
 * notice when they were replaced meanwhile. Opened by the options editor that could not save
 * (someone voted, the options were replaced meanwhile), the page says why, once.
 */
@Component({
  selector: 'app-manage-page',
  imports: [
    CancelEvent,
    ErrorState,
    EventDeadline,
    EventEmails,
    EventLinks,
    FinalDate,
    HoverTip,
    LoadingState,
    RouterLink,
    ShareLinks,
    Tooltip,
    TranslocoPipe,
    VoteEnded,
  ],
  styleUrl: './manage-page.scss',
  templateUrl: './manage-page.html',
})
export class ManagePage {
  /** The participation ID, from the route. */
  readonly eventId = input.required<string>();

  private readonly management = inject(EventManagement);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly locale = this.transloco.getActiveLang();

  protected readonly view = resource<Management, { eventId: string; claims: number }>({
    params: () => ({ eventId: this.eventId(), claims: this.management.claims() }),
    loader: ({ params }) => this.management.read(params.eventId),
  });
  /** A confirmation of this event is on its way; a new event starts with none. */
  // Typed on the field: what the template reads keeps its type whatever a mutant does inside.
  protected readonly sending: WritableSignal<boolean> = linkedSignal<string, boolean>({
    source: () => this.eventId(),
    computation: () => false,
  });
  /** Why the last confirmation of this event did not get through; a new event starts with none. */
  private readonly failed: WritableSignal<unknown> = linkedSignal<string, unknown>({
    source: () => this.eventId(),
    computation: () => null,
  });
  protected readonly failure = requestFailure(() => this.failed());
  /** Why the options saved in the editor were not, when the page was opened from it. */
  private readonly notSaved = notSavedOnArrival();
  /**
   * What "Elige la fecha final" says: why the options saved in the editor that opened the page
   * were not, then why the last confirmation was not made; a new event starts with none.
   */
  protected readonly notice: WritableSignal<FinalDateNotice | null> = linkedSignal<
    string,
    FinalDateNotice | null
  >({
    source: () => this.eventId(),
    computation: (_eventId, previous) => (previous === undefined ? this.notSaved : null),
  });

  private readonly refusedHeading = viewChild<ElementRef<HTMLElement>>('refusedHeading');

  constructor() {
    // A refusal replaces the page, also after a confirmation: a screen reader follows it.
    effect(() => {
      this.refusedHeading()?.nativeElement.focus();
    });
    // On opening, or when the session ends while the page is open; back leads past it.
    effect(() => {
      if (!this.view.hasValue() || this.view.value().kind !== 'signIn') return;
      const signIn = this.router.createUrlTree(['/sign-in'], {
        queryParams: signInFrom(this.router.url),
      });
      void this.router.navigateByUrl(signIn, { replaceUrl: true });
    });
  }

  /** "Votación abierta hasta el <strong>1 de julio de 2026</strong>", and how many voted. */
  protected stateOf({ state, deadline, voters }: ManagedEvent): StateLine {
    return {
      voting: this.transloco.translate(`manage.state.${state}`, {
        deadline: longDate(deadline, this.locale),
      }),
      voters: this.transloco.translate('manage.voters', { count: voters }),
    };
  }

  /**
   * Sends the confirmation and shows the event as it comes back, unless the page has moved to
   * another event meanwhile (back or forward in the history): that answer, and whether it is
   * on its way or failed, is not the new event's.
   */
  protected async confirm(optionId: string): Promise<void> {
    const eventId = this.eventId();
    const current = () => this.eventId() === eventId;
    this.sending.set(true);
    this.failed.set(null);
    this.notice.set(null);
    try {
      const answer = await this.management.confirm(eventId, optionId);
      if (!current()) return;
      if (answer.kind === 'optionsChanged') {
        this.view.set({ kind: 'managed', event: answer.event });
        this.notice.set('optionsChanged');
      } else {
        this.view.set(answer);
      }
    } catch (error) {
      if (current()) this.failed.set(error);
    } finally {
      if (current()) this.sending.set(false);
    }
  }
}

/** The state line's two halves, catalogue markup around a date and a count. */
interface StateLine {
  readonly voting: string;
  readonly voters: string;
}

import {
  Component,
  type ElementRef,
  effect,
  inject,
  input,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { ManagedEvent } from '@qando/contracts';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { longDate } from '../vote/display';
import { VoteEnded } from '../vote/vote-ended';
import { EventLinks } from './event-links';
import { EventManagement, type Management } from './event-management';
import { FinalDate } from './final-date';

/**
 * The management page, opened with the management link once `openManagementLink` has taken its
 * token: the event's title and state, the choice of its final date (or the confirmed one) and
 * its links. A browser whose link does not manage the event is refused; a cancelled event shows
 * its kept title; only a failed request offers to try again. Confirming sends the choice and
 * shows the event as the API answers it, the confirmed date or the one confirmed meanwhile.
 */
@Component({
  selector: 'app-manage-page',
  imports: [ErrorState, EventLinks, FinalDate, LoadingState, TranslocoPipe, VoteEnded],
  styleUrl: './manage-page.scss',
  templateUrl: './manage-page.html',
})
export class ManagePage {
  /** The participation ID, from the route. */
  readonly eventId = input.required<string>();

  private readonly management = inject(EventManagement);
  private readonly transloco = inject(TranslocoService);
  private readonly locale = this.transloco.getActiveLang();

  protected readonly view = resource<Management, { eventId: string; claims: number }>({
    params: () => ({ eventId: this.eventId(), claims: this.management.claims() }),
    loader: ({ params }) => this.management.read(params.eventId),
  });
  protected readonly sending = signal(false);
  protected readonly failed = signal(false);

  private readonly refusedHeading = viewChild<ElementRef<HTMLElement>>('refusedHeading');

  constructor() {
    // A refusal replaces the page, also after a confirmation: a screen reader follows it.
    effect(() => {
      this.refusedHeading()?.nativeElement.focus();
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
   * another event meanwhile (back or forward in the history): that answer is not this page's.
   */
  protected async confirm(optionId: string): Promise<void> {
    const eventId = this.eventId();
    const current = () => this.eventId() === eventId;
    this.sending.set(true);
    this.failed.set(false);
    try {
      const answer = await this.management.confirm(eventId, optionId);
      if (current()) this.view.set(answer);
    } catch {
      if (current()) this.failed.set(true);
    } finally {
      this.sending.set(false);
    }
  }
}

/** The state line's two halves, catalogue markup around a date and a count. */
interface StateLine {
  readonly voting: string;
  readonly voters: string;
}

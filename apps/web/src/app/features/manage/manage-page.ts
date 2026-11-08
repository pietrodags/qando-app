import {
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { longDate } from '../vote/display';
import { VoteEnded } from '../vote/vote-ended';
import { EventLinks } from './event-links';
import { EventManagement } from './event-management';
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

  protected readonly view = resource({
    params: () => this.eventId(),
    loader: ({ params }) => this.management.read(params),
  });
  protected readonly sending = signal(false);
  protected readonly failed = signal(false);

  /** "Votación abierta hasta el <strong>1 de julio de 2026</strong>", and how many voted. */
  protected readonly state = computed<{ voting: string; voters: string } | null>(() => {
    const view = this.view.hasValue() ? this.view.value() : null;
    if (view?.kind !== 'managed') return null;
    const { state, deadline, voters } = view.event;
    return {
      voting: this.transloco.translate(`manage.state.${state}`, {
        deadline: longDate(deadline, this.locale),
      }),
      voters: this.transloco.translate('manage.voters', { count: voters }),
    };
  });

  private readonly refusedHeading = viewChild<ElementRef<HTMLElement>>('refusedHeading');

  constructor() {
    // A refusal replaces the page, also after a confirmation: a screen reader follows it.
    effect(() => {
      this.refusedHeading()?.nativeElement.focus();
    });
  }

  protected async confirm(optionId: string): Promise<void> {
    this.sending.set(true);
    this.failed.set(false);
    try {
      this.view.set(await this.management.confirm(this.eventId(), optionId));
    } catch {
      this.failed.set(true);
    } finally {
      this.sending.set(false);
    }
  }
}

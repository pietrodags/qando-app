import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { type Option, castVoteEndpoint, publicEventEndpoint } from '@qando/contracts';
import { ApiClient } from '../../core/api/api-client';
import { apiError, apiResource } from '../../core/api/api-resource';
import { type RequestFailure, requestFailure } from '../../core/api/request-failure';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { NotFoundCard } from '../../shared/ui/not-found-card';
import { Step, StepStack } from '../../shared/ui/step-stack';
import { type Answers, allAvailable, resumed } from './answers';
import { MyVotes } from './my-votes';
import { VoteConfirm } from './vote-confirm';
import { VoteDays } from './vote-days';
import { type Ended, type LateNotice, VoteEnded } from './vote-ended';
import { VoteThanks } from './vote-thanks';
import { VoteTimes } from './vote-times';
import { type VoteNotice, VoteWelcome } from './vote-welcome';

/** A way of voting: its failure shows where the voter sent the vote from. */
type Way = 'quick' | 'confirmed';

/** A vote refused because voting closed; its notice is read after when the vote was new. */
interface ClosedRefusal {
  readonly kind: 'closed';
  readonly notice: LateNotice | null;
}

/**
 * Why the API refused a vote sent from the open page: voting had closed (and maybe the organizer
 * confirmed a date), or the event is gone.
 */
type Refusal =
  | ClosedRefusal
  | {
      readonly kind: 'confirmed';
      readonly option: Option;
      readonly timeZone: string;
      readonly notice: LateNotice | null;
    }
  | { readonly kind: 'cancelled'; readonly title: string }
  | { readonly kind: 'notFound' };

/**
 * The voting page, opened with the participation link: reads the event and the vote this
 * browser holds of it, walks the voter through the steps as a stack of cards, then sends the vote
 * and thanks the voter. Holds what the steps share: the voter's name and the answers, which start
 * from the stored vote and are kept while the voter goes back and forth. The last step, the days
 * or, in an event with times, their times, is confirmed over the step itself. The URL stays the
 * participation link after voting.
 *
 * A link that no longer takes votes shows, in place of the steps, why (VoteEnded): voting closed,
 * a date confirmed, the event cancelled; a link of no event shows the page not found. A vote the
 * API refuses because voting closed or the event was cancelled while the page was open turns the
 * page into that card (the confirmed date's, when the event read again has one); a closed or
 * confirmed card says whether this browser's vote was registered, read again
 * after the refusal, as an earlier send whose answer was lost may have stored it.
 */
@Component({
  selector: 'app-vote-page',
  imports: [
    ErrorState,
    NgTemplateOutlet,
    LoadingState,
    NotFoundCard,
    Step,
    StepStack,
    TranslocoPipe,
    VoteConfirm,
    VoteDays,
    VoteEnded,
    VoteThanks,
    VoteTimes,
    VoteWelcome,
  ],
  styleUrl: './vote-page.scss',
  templateUrl: './vote-page.html',
})
export class VotePage {
  /** The participation ID, from the route. */
  readonly eventId = input.required<string>();

  private readonly myVotes = inject(MyVotes);
  private readonly api = inject(ApiClient);

  protected readonly event = apiResource(publicEventEndpoint, () => ({ id: this.eventId() }));
  /** Never fails: what the API cannot answer is no vote (MyVotes). */
  private readonly stored = resource({
    params: () => this.eventId(),
    loader: ({ params }) => this.myVotes.stored(params),
  });
  /** The event and the stored vote are both read: the steps can start. */
  protected readonly ready = computed(() => this.event.hasValue() && this.stored.hasValue());
  private readonly storedVote = computed(() => {
    const stored = this.stored.hasValue() ? this.stored.value() : null;
    return stored?.kind === 'voted' ? stored.vote : null;
  });
  protected readonly notice = computed<VoteNotice | null>(() => {
    if (this.storedVote() !== null) return 'alreadyVoted';
    return this.stored.hasValue() && this.stored.value().kind === 'unknownLink'
      ? 'unknownLink'
      : null;
  });
  /**
   * Set when the API refused a vote sent from this page: that event no longer takes votes. Kept
   * with its participation ID, as the page stays when the route goes to another event.
   */
  private readonly refusal = signal<{ eventId: string; refusal: Refusal } | null>(null);
  private readonly refused = computed<Refusal | null>(() => {
    const refused = this.refusal();
    return refused?.eventId === this.eventId() ? refused.refusal : null;
  });
  /** The event's answer, or a refused vote, says no event has this link. */
  protected readonly notFound = computed(() => {
    if (this.refused()?.kind === 'notFound') return true;
    const status = apiError(publicEventEndpoint, this.event.error())?.status;
    return status === 404 || status === 400;
  });
  /** Why voting has ended, once known; null while the steps are shown (or still loading). */
  protected readonly ended = computed<Ended | null>(() => {
    const refused = this.refused();
    if (refused?.kind === 'cancelled') return { kind: 'cancelled', title: refused.title };
    const error = apiError(publicEventEndpoint, this.event.error());
    if (error?.status === 410) return { kind: 'cancelled', title: error.body.error.title };
    if (!this.event.hasValue()) return null;
    const { title, organizerName, state, confirmedOption, timeZone } = this.event.value();
    if (refused?.kind === 'confirmed') return { ...refused, title, organizerName };
    // The API names the confirmed option exactly when the event is confirmed.
    if (confirmedOption !== null) {
      return {
        kind: 'confirmed',
        title,
        organizerName,
        option: confirmedOption,
        timeZone,
        notice: null,
      };
    }
    if (state === 'open' && refused === null) return null;
    // Closed: says whether this browser's vote was registered once it is read.
    if (refused?.kind === 'closed')
      return { kind: 'closed', title, organizerName, notice: refused.notice };
    if (!this.stored.hasValue()) return null;
    const notice = this.storedVote() === null ? null : 'voted';
    return { kind: 'closed', title, organizerName, notice };
  });
  protected readonly step = signal(1);
  protected readonly name = linkedSignal(() => this.storedVote()?.name ?? '');
  protected readonly answers = linkedSignal<Answers>(() => {
    const ids = this.event.hasValue() ? this.event.value().options.map(({ id }) => id) : [];
    return resumed(ids, this.storedVote()?.votes ?? {});
  });
  /** The confirmation over the last step; leaving the step by its tab closes it. */
  protected readonly confirming = linkedSignal({ source: this.step, computation: () => false });
  protected readonly sending = signal(false);
  /** The last send that failed: how it was sent, and the error the page tells. */
  private readonly failed = signal<{ readonly way: Way; readonly error: unknown } | null>(null);
  private readonly failure = requestFailure(() => this.failed()?.error);
  protected readonly quickVoteFailure = computed<RequestFailure | null>(() =>
    this.failed()?.way === 'quick' ? this.failure() : null,
  );
  protected readonly confirmedFailure = computed<RequestFailure | null>(() =>
    this.failed()?.way === 'confirmed' ? this.failure() : null,
  );
  /** The private edit link, once the vote is stored. */
  protected readonly editLink = signal<string | null>(null);
  /** The vote sent replaced one stored before. */
  protected readonly updated = signal(false);

  /** Events with times choose the days and then, in a third step, their times. */
  protected readonly hasTimes = computed(
    () => this.event.hasValue() && this.event.value().options.some(({ time }) => time !== null),
  );

  protected sendQuickVote(): void {
    const optionIds = this.event.hasValue() ? this.event.value().options.map(({ id }) => id) : [];
    void this.send(allAvailable(optionIds), 'quick');
  }

  protected sendAnswers(): void {
    void this.send(this.answers(), 'confirmed');
  }

  private async send(votes: Answers, way: Way): Promise<void> {
    if (!this.event.hasValue()) return;
    const named = !this.event.value().anonymous;
    const eventId = this.eventId();
    // Read before sending: a refused edit then still knows the page showed a stored vote.
    const showedVote = this.storedVote() !== null;
    this.sending.set(true);
    this.failed.set(null);
    try {
      const { link, updated } = await this.myVotes.cast(eventId, {
        ...(named && { name: this.name().trim() }),
        votes,
      });
      this.updated.set(updated);
      this.editLink.set(link);
    } catch (error) {
      const refused = refusalOf(error, showedVote);
      // The steps stay, locked, while a closed event is read again: its card then shows once.
      const refusal = refused?.kind === 'closed' ? await this.whyClosed(eventId, refused) : refused;
      if (refusal === null) {
        this.failed.set({ way, error });
      } else {
        this.refusal.set({ eventId, refusal });
        if ('notice' in refusal && refusal.notice === null && !showedVote) {
          void this.readKeptVote(eventId, refusal);
        }
      }
    } finally {
      this.sending.set(false);
    }
  }

  /**
   * Voting closed while the page was open: the event, read again, says whether the organizer
   * confirmed a date, which the page then shows. When it cannot be read, the page says it closed.
   */
  private async whyClosed(eventId: string, closed: ClosedRefusal): Promise<Refusal> {
    try {
      const { confirmedOption, timeZone } = await this.api.send(publicEventEndpoint, {
        params: { id: eventId },
      });
      return confirmedOption === null
        ? closed
        : { kind: 'confirmed', option: confirmedOption, timeZone, notice: closed.notice };
    } catch {
      return closed;
    }
  }

  /**
   * After a new vote is refused because voting closed: an earlier send whose answer was lost may
   * have stored it. The closed or confirmed card shows at once and says which, once read; when the
   * read fails it says nothing, as there may be a vote or not.
   */
  private async readKeptVote(
    eventId: string,
    refusal: Extract<Refusal, { notice: unknown }>,
  ): Promise<void> {
    const { kind } = await this.myVotes.stored(eventId);
    if (kind === 'unread' || this.refusal()?.refusal !== refusal) return;
    const notice = kind === 'voted' ? 'lateEdit' : 'lateVote';
    this.refusal.set({ eventId, refusal: { ...refusal, notice } });
  }
}

/**
 * What a refused send means for the page; null when the vote may simply be sent again. A closed
 * refusal of an edit keeps the vote the page showed; of a new vote, its notice is read after.
 */
function refusalOf(error: unknown, showedVote: boolean): Refusal | null {
  // The edit endpoint answers these statuses with the same bodies as the cast.
  const refused = apiError(castVoteEndpoint, error);
  switch (refused?.status) {
    case 409:
      return { kind: 'closed', notice: showedVote ? 'lateEdit' : null };
    case 410:
      return { kind: 'cancelled', title: refused.body.error.title };
    case 404:
      return { kind: 'notFound' };
    default:
      return null;
  }
}

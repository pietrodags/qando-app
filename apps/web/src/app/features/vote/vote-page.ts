import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { castVoteEndpoint, publicEventEndpoint } from '@qando/contracts';
import { apiError, apiResource } from '../../core/api/api-resource';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { NotFoundCard } from '../../shared/ui/not-found-card';
import { Step, StepStack } from '../../shared/ui/step-stack';
import { type Answers, allAvailable, resumed } from './answers';
import { MyVotes } from './my-votes';
import { VoteConfirm } from './vote-confirm';
import { VoteDays } from './vote-days';
import { type ClosedNotice, type Ended, VoteEnded } from './vote-ended';
import { VoteThanks } from './vote-thanks';
import { VoteTimes } from './vote-times';
import { type VoteNotice, VoteWelcome } from './vote-welcome';

/** Which way of voting failed to send, so its message shows where the voter sent it from. */
type Failure = 'quick' | 'confirmed' | null;

/** Why the API refused a vote sent from the open page: voting had closed, or the event is gone. */
type Refusal =
  | { readonly kind: 'closed'; readonly notice: ClosedNotice }
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
 * page into that card; a closed card says whether this browser's vote was registered, read again
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
  /** Set when the API refused a vote sent from this page: it no longer takes votes. */
  private readonly refused = signal<Refusal | null>(null);
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
    const { title, organizerName, state, confirmedOption } = this.event.value();
    // The API names the confirmed option exactly when the event is confirmed.
    if (confirmedOption !== null) {
      return { kind: 'confirmed', title, organizerName, option: confirmedOption };
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
  protected readonly failed = signal<Failure>(null);
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

  private async send(votes: Answers, way: Exclude<Failure, null>): Promise<void> {
    if (!this.event.hasValue()) return;
    const named = !this.event.value().anonymous;
    this.sending.set(true);
    this.failed.set(null);
    try {
      const { link, updated } = await this.myVotes.cast(this.eventId(), {
        ...(named && { name: this.name().trim() }),
        votes,
      });
      this.updated.set(updated);
      this.editLink.set(link);
    } catch (error) {
      const refusal = await this.refusalOf(error);
      if (refusal === null) this.failed.set(way);
      else this.refused.set(refusal);
    } finally {
      this.sending.set(false);
    }
  }

  /** What a refused send means for the page; null when the vote may simply be sent again. */
  private async refusalOf(error: unknown): Promise<Refusal | null> {
    // The edit endpoint answers these statuses with the same bodies as the cast.
    const refused = apiError(castVoteEndpoint, error);
    switch (refused?.status) {
      case 409: {
        // Whatever the page showed, the vote stored now is the one the voter keeps.
        const stored = await this.myVotes.stored(this.eventId());
        return { kind: 'closed', notice: stored.kind === 'voted' ? 'lateEdit' : 'lateVote' };
      }
      case 410:
        return { kind: 'cancelled', title: refused.body.error.title };
      case 404:
        return { kind: 'notFound' };
      default:
        return null;
    }
  }
}

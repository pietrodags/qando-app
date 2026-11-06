import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { publicEventEndpoint } from '@qando/contracts';
import { apiResource } from '../../core/api/api-resource';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { Step, StepStack } from '../../shared/ui/step-stack';
import { type Answers, allAvailable, resumed } from './answers';
import { MyVotes } from './my-votes';
import { VoteConfirm } from './vote-confirm';
import { VoteDays } from './vote-days';
import { VoteThanks } from './vote-thanks';
import { VoteTimes } from './vote-times';
import { type VoteNotice, VoteWelcome } from './vote-welcome';

/** Which way of voting failed to send, so its message shows where the voter sent it from. */
type Failure = 'quick' | 'confirmed' | null;

/**
 * The voting page, opened with the participation link: reads the event and the vote this
 * browser holds of it, walks the voter through the steps as a stack of cards, then sends the vote
 * and thanks the voter. Holds what the steps share: the voter's name and the answers, which start
 * from the stored vote and are kept while the voter goes back and forth. The last step, the days
 * or, in an event with times, their times, is confirmed over the step itself. The URL stays the
 * participation link after voting.
 */
@Component({
  selector: 'app-vote-page',
  imports: [
    ErrorState,
    NgTemplateOutlet,
    LoadingState,
    Step,
    StepStack,
    TranslocoPipe,
    VoteConfirm,
    VoteDays,
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
    } catch {
      this.failed.set(way);
    } finally {
      this.sending.set(false);
    }
  }
}

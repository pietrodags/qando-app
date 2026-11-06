import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { publicEventEndpoint } from '@qando/contracts';
import { apiResource } from '../../core/api/api-resource';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { Step, StepStack } from '../../shared/ui/step-stack';
import { type Answers, allAvailable } from './answers';
import { MyVotes } from './my-votes';
import { VoteConfirm } from './vote-confirm';
import { VoteDays } from './vote-days';
import { VoteThanks } from './vote-thanks';
import { VoteWelcome } from './vote-welcome';

/** Which way of voting failed to send, so its message shows where the voter sent it from. */
type Failure = 'quick' | 'confirmed' | null;

/**
 * The voting page, opened with the participation link: reads the event and walks the voter
 * through the steps as a stack of cards, then sends the vote and thanks the voter. Holds what the
 * steps share: the voter's name and the answers, kept while the voter goes back and forth. The
 * URL stays the participation link after voting.
 */
@Component({
  selector: 'app-vote-page',
  imports: [
    ErrorState,
    LoadingState,
    Step,
    StepStack,
    TranslocoPipe,
    VoteConfirm,
    VoteDays,
    VoteThanks,
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
  protected readonly step = signal(1);
  protected readonly name = signal('');
  protected readonly answers = linkedSignal<Answers>(() =>
    allAvailable(this.event.hasValue() ? this.event.value().options.map(({ id }) => id) : []),
  );
  /** The confirmation over the last step; leaving the step by its tab closes it. */
  protected readonly confirming = linkedSignal({ source: this.step, computation: () => false });
  protected readonly sending = signal(false);
  protected readonly failed = signal<Failure>(null);
  /** The private edit link, once the vote is stored. */
  protected readonly editLink = signal<string | null>(null);

  private readonly hasTimes = computed(
    () => this.event.hasValue() && this.event.value().options.some(({ time }) => time !== null),
  );

  protected chooseDays(): void {
    // Events with times choose the days and then their times: those steps come later.
    if (!this.hasTimes()) this.step.set(2);
  }

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
      this.editLink.set(
        await this.myVotes.cast(this.eventId(), {
          ...(named && { name: this.name().trim() }),
          votes,
        }),
      );
    } catch {
      this.failed.set(way);
    } finally {
      this.sending.set(false);
    }
  }
}

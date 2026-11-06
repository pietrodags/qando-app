import {
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { summaryOf } from '@qando/domain';
import type { Answers } from './answers';
import { longDate } from './display';

let nextId = 0;

/**
 * The confirmation over the last step's card: what the answers amount to (a preferred option,
 * none preferred, none possible), until when the vote can be changed, and the two ways out:
 * back to the step (the arrow or Escape) or send (the check, which takes the focus, given back to
 * what opened it when it closes). A failed send is told inside the bubble and the check stays
 * available to try again. The page makes what it covers inert.
 */
@Component({
  selector: 'app-vote-confirm',
  imports: [TranslocoPipe],
  styleUrl: './vote-confirm.scss',
  templateUrl: './vote-confirm.html',
})
export class VoteConfirm {
  /** The answers about to be sent. */
  readonly answers = input.required<Answers>();
  /** The event's deadline, ISO: the vote can be changed until then. */
  readonly deadline = input.required<string>();
  /** The vote is on its way: the check waits. */
  readonly sending = input(false);
  /** The last send failed. */
  readonly failed = input(false);
  readonly back = output();
  readonly send = output();

  private readonly locale = inject(TranslocoService).getActiveLang();
  private readonly sendButton = viewChild.required<ElementRef<HTMLButtonElement>>('sendButton');

  protected readonly id = `vote-confirm-${String((nextId += 1))}`;
  private readonly summary = computed(() => summaryOf(this.answers()));
  protected readonly question = computed(() =>
    this.summary() === 'nonePossible' ? 'vote.confirm.nonePossible' : 'vote.confirm.ready',
  );
  protected readonly hint = computed(() =>
    this.summary() === 'noPreferred' ? 'vote.confirm.noPreferred' : 'vote.confirm.review',
  );
  protected readonly until = computed(() => longDate(this.deadline(), this.locale));

  /** Back to the step, unless the vote is on its way: answers changed then would not be sent. */
  protected leave(): void {
    if (!this.sending()) this.back.emit();
  }

  constructor() {
    const opener = document.activeElement;
    afterNextRender(() => {
      this.sendButton().nativeElement.focus();
    });
    inject(DestroyRef).onDestroy(() => {
      // Once what it covered is no longer inert. A removed opener (the vote was sent, or the
      // voter left the step) needs nothing back.
      queueMicrotask(() => {
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      });
    });
  }
}

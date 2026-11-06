import {
  Component,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Confirmation } from './answers';
import { longDate } from './display';

let nextId = 0;

/**
 * The confirmation over the last step's card: what the answers amount to (a preferred option,
 * none preferred, none possible), until when the vote can be changed, and the two ways out:
 * back to the step (the arrow or Escape) or send (the check, which takes the focus). A failed
 * send is told inside the bubble and the check stays available to try again.
 */
@Component({
  selector: 'app-vote-confirm',
  imports: [TranslocoPipe],
  styleUrl: './vote-confirm.scss',
  templateUrl: './vote-confirm.html',
})
export class VoteConfirm {
  readonly confirmation = input.required<Confirmation>();
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
  protected readonly question = computed(() =>
    this.confirmation() === 'nonePossible' ? 'vote.confirm.nonePossible' : 'vote.confirm.ready',
  );
  protected readonly hint = computed(() =>
    this.confirmation() === 'noPreferred' ? 'vote.confirm.noPreferred' : 'vote.confirm.review',
  );
  protected readonly until = computed(() => longDate(this.deadline(), this.locale));

  constructor() {
    afterNextRender(() => {
      this.sendButton().nativeElement.focus();
    });
  }
}

import {
  Component,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { FormField, form, validate } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { PublicEvent } from '@qando/contracts';
import { VOTER_NAME_MAX_LENGTH, isValidVoterName } from '@qando/domain';
import { type RequestFailure, waiting } from '../../core/api/request-failure';
import { CharacterLimit } from '../../shared/ui/character-limit';
import { FailureNotice } from '../../shared/ui/failure-notice';
import { capitalised, longDate } from './display';

/**
 * What step 1 tells: this browser holds an earlier vote, the private link it was opened from holds
 * none of this event, or the vote just sent named options the organizer has replaced since.
 */
export type VoteNotice = 'alreadyVoted' | 'unknownLink' | 'optionsChanged';

/** From this width the keyboard no longer covers the page, so the name field takes the cursor. */
const AUTOFOCUS_QUERY = '(min-width: 650px)';

/**
 * Step 1 of the voting page, inside its card: what the organizer proposes and until when, the
 * voter's name on named events (shared with the page through `name`; the field stops at the 30
 * characters a vote's name allows), what it knows of an earlier vote, and the two ways to vote.
 */
@Component({
  selector: 'app-vote-welcome',
  imports: [CharacterLimit, FailureNotice, FormField, TranslocoPipe],
  styleUrl: './vote-welcome.scss',
  templateUrl: './vote-welcome.html',
})
export class VoteWelcome {
  readonly event = input.required<PublicEvent>();
  /** The voter's name as typed; unused on anonymous events. */
  readonly name = model('');
  /** The voter wants to choose day by day ("Quiero elegir…"). */
  readonly choose = output();
  /** The voter fits in with the majority ("Me adapto…"): every option available, sent at once. */
  readonly quickVote = output();
  /** The quick vote is on its way: neither choice can be pressed. */
  readonly sending = input(false);
  /** Why the last quick vote failed; while a rate limit lasts, neither choice can be pressed. */
  readonly quickVoteFailure = input<RequestFailure | null>(null);
  /** Shown under the deadline; none when null. */
  readonly notice = input<VoteNotice | null>(null);
  /** The notice's copy: the options changed is told as the days step tells it. */
  protected readonly noticeKey = computed<string | null>(() => {
    const notice = this.notice();
    if (notice === null) return null;
    return notice === 'optionsChanged' ? 'vote.optionsChanged' : `vote.welcome.${notice}`;
  });

  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('nameField');
  private readonly locale = inject(TranslocoService).getActiveLang();

  /** Shown capitalised, as typed otherwise. */
  protected readonly organizer = computed(() =>
    capitalised(this.event().organizerName, this.locale),
  );

  protected readonly hasTimes = computed(() =>
    this.event().options.some((option) => option.time !== null),
  );

  protected readonly deadline = computed(() => longDate(this.event().deadline, this.locale));

  /** The name field, with the rule a vote's name follows. */
  protected readonly voterName = form(this.name, (path) => {
    validate(path, ({ value }) => (isValidVoterName(value()) ? null : { kind: 'voterName' }));
  });

  protected readonly nameLimit = VOTER_NAME_MAX_LENGTH;

  protected readonly canVote = computed(
    () =>
      !this.sending() &&
      !waiting(this.quickVoteFailure()) &&
      (this.event().anonymous || this.voterName().valid()),
  );

  constructor() {
    afterNextRender(() => {
      if (window.matchMedia(AUTOFOCUS_QUERY).matches) {
        this.nameField()?.nativeElement.focus();
      }
    });
  }
}

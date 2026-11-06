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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { PublicEvent } from '@qando/contracts';
import { isValidVoterName } from '@qando/domain';
import { capitalised, longDate } from './display';

/** From this width the keyboard no longer covers the page, so the name field takes the cursor. */
const AUTOFOCUS_QUERY = '(min-width: 650px)';

/**
 * Step 1 of the voting page, inside its card: what the organizer proposes and until when, the voter's name on
 * named events (shared with the page through `name`), and the two ways to vote.
 */
@Component({
  selector: 'app-vote-welcome',
  imports: [TranslocoPipe],
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
  /** The last quick vote failed. */
  readonly quickVoteFailed = input(false);

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

  protected readonly nameIsValid = computed(() => isValidVoterName(this.name()));

  protected readonly canVote = computed(
    () => !this.sending() && (this.event().anonymous || this.nameIsValid()),
  );

  constructor() {
    afterNextRender(() => {
      if (window.matchMedia(AUTOFOCUS_QUERY).matches) {
        this.nameField()?.nativeElement.focus();
      }
    });
  }
}

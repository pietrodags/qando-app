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

  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('nameField');
  private readonly locale = inject(TranslocoService).getActiveLang();

  /** Shown capitalised, as typed otherwise. */
  protected readonly organizer = computed(() => {
    const name = this.event().organizerName;
    return name.charAt(0).toLocaleUpperCase(this.locale) + name.slice(1);
  });

  protected readonly hasTimes = computed(() =>
    this.event().options.some((option) => option.time !== null),
  );

  protected readonly deadline = computed(() => longDate(this.event().deadline, this.locale));

  protected readonly nameIsValid = computed(() => isValidVoterName(this.name()));

  protected readonly canVote = computed(() => this.event().anonymous || this.nameIsValid());

  constructor() {
    afterNextRender(() => {
      if (window.matchMedia(AUTOFOCUS_QUERY).matches) {
        this.nameField()?.nativeElement.focus();
      }
    });
  }
}

/** `2026-07-01` → "1 de julio de 2026": a date-only ISO string is read as UTC, as it is shown. */
function longDate(isoDate: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.parse(isoDate));
}

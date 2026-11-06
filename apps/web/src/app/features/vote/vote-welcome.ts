import {
  Component,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { PublicEvent } from '@qando/contracts';
import { isValidVoterName } from '@qando/domain';

/** From this width the keyboard no longer covers the page, so the name field takes the cursor. */
const AUTOFOCUS_QUERY = '(min-width: 650px)';

/**
 * Step 1 of the voting page: what the organizer proposes and until when, the voter's name on
 * named events (shared with the page through `name`), and the two ways to vote.
 */
@Component({
  selector: 'app-vote-welcome',
  imports: [TranslocoPipe],
  styleUrl: './vote-welcome.scss',
  template: `
    <section class="card">
      <p class="step-label">{{ 'vote.step' | transloco: { step: 1 } }}</p>
      <h1 class="title">{{ event().title }}</h1>

      <p class="proposal">
        <strong class="emph">{{ organizer() }}</strong>
        {{
          (hasTimes() ? 'vote.welcome.proposedDatesAndTimes' : 'vote.welcome.proposedDates')
            | transloco
        }}
      </p>
      @if (event().note; as note) {
        <p class="note-intro">{{ 'vote.welcome.noteIntro' | transloco }}</p>
        <p class="note">—{{ note }}</p>
      }
      <p class="deadline">
        {{ 'vote.welcome.deadlineBefore' | transloco }}
        <strong class="emph date">{{ deadline() }}</strong>
        {{ 'vote.welcome.deadlineAfter' | transloco }}
      </p>

      @if (event().anonymous) {
        <p class="anonymous">{{ 'vote.welcome.anonymous' | transloco }}</p>
      } @else {
        <label class="name-label" for="voter-name">{{
          'vote.welcome.nameLabel' | transloco
        }}</label>
        <input
          #nameField
          id="voter-name"
          class="name"
          [class.valid]="nameIsValid()"
          type="text"
          autocomplete="name"
          [value]="name()"
          (input)="name.set(nameField.value)"
        />
      }

      <div class="choices">
        <button class="choice flexible" type="button" [disabled]="!canVote()">
          {{ 'vote.welcome.quickVote' | transloco }}
        </button>
        <button class="choice choose" type="button" [disabled]="!canVote()">
          {{ 'vote.welcome.choosePreferences' | transloco }}
        </button>
      </div>
    </section>
  `,
})
export class VoteWelcome {
  readonly event = input.required<PublicEvent>();
  /** The voter's name as typed; unused on anonymous events. */
  readonly name = model('');

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

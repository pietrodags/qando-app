import {
  Component,
  type ElementRef,
  afterNextRender,
  computed,
  model,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, translateSignal } from '@jsverse/transloco';
import {
  type DetailsProblem,
  EVENT_TITLE_MAX_LENGTH,
  ORGANIZER_NAME_MAX_LENGTH,
  detailsProblems,
} from '@qando/domain';

/** From this width the keyboard no longer covers the page, so the name field takes the cursor. */
const AUTOFOCUS_QUERY = '(min-width: 650px)';

/** The sentence of each problem, under `create.details.missing`. */
const SENTENCES: Record<DetailsProblem['code'], string> = {
  NAME_MISSING: 'nameMissing',
  NAME_TOO_SHORT: 'nameTooShort',
  NAME_TOO_LONG: 'nameTooLong',
  TITLE_MISSING: 'titleMissing',
  TITLE_TOO_LONG: 'titleTooLong',
};

/** The keys of the sentences of what is missing, in the step's order. */
function missingKeys(problems: readonly DetailsProblem[]): string[] {
  const codes = problems.map((problem) => problem.code);
  // Nothing typed at all is one sentence, as on an untouched step.
  const sentences =
    codes.includes('NAME_MISSING') && codes.includes('TITLE_MISSING')
      ? ['both']
      : codes.map((code) => SENTENCES[code]);
  return sentences.map((sentence) => `create.details.missing.${sentence}`);
}

/**
 * Step 1 of the creation wizard, inside its card: the organizer's name, then the event's title
 * (both held by the page, so they outlive the step folding away), and the round arrow to step 2.
 * A field whose value is valid gets a green check at its end. Until both are, the arrow, still in
 * the Tab order, does nothing, and tells screen readers what is missing (on screen, the labels
 * above the fields already say what to write); Enter in either field presses it.
 */
@Component({
  selector: 'app-wizard-details',
  imports: [TranslocoPipe],
  styleUrl: './wizard-details.scss',
  templateUrl: './wizard-details.html',
})
export class WizardDetails {
  /** The organizer's name, as typed. */
  readonly organizerName = model('');
  /** The event's title, as typed. */
  readonly title = model('');
  /** The step is valid and the organizer goes on to the dates. */
  readonly next = output();

  protected readonly nameMaxLength = ORGANIZER_NAME_MAX_LENGTH;
  protected readonly titleMaxLength = EVENT_TITLE_MAX_LENGTH;

  private readonly problems = computed(() =>
    detailsProblems({ organizerName: this.organizerName(), title: this.title() }),
  );

  /** The name holds no problem: its field gets the check. */
  protected readonly nameValid = computed(() =>
    this.problems().every((problem) => !problem.code.startsWith('NAME_')),
  );

  /** The title holds no problem: its field gets the check. */
  protected readonly titleValid = computed(() =>
    this.problems().every((problem) => !problem.code.startsWith('TITLE_')),
  );

  private readonly missingSentences = translateSignal(computed(() => missingKeys(this.problems())));

  /** What is missing, one sentence per problem, for screen readers; empty once the step is valid. */
  protected readonly missing = computed(() => this.missingSentences().join(' '));

  private readonly nameField = viewChild.required<ElementRef<HTMLInputElement>>('nameField');

  constructor() {
    afterNextRender(() => {
      if (window.matchMedia(AUTOFOCUS_QUERY).matches) {
        this.nameField().nativeElement.focus();
      }
    });
  }

  /** The arrow and Enter both submit the form: on to step 2 only once nothing is missing. */
  protected submit(event: Event): void {
    event.preventDefault();
    if (this.missing() === '') this.next.emit();
  }
}

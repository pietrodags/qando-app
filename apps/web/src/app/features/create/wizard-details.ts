import {
  Component,
  type ElementRef,
  afterNextRender,
  computed,
  model,
  output,
  viewChild,
} from '@angular/core';
import { FormField, FormRoot, form, validateTree } from '@angular/forms/signals';
import { TranslocoPipe, translateSignal } from '@jsverse/transloco';
import {
  type DetailsProblem,
  type EventDetails,
  clipDetails,
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
 * (held by the page, so they outlive the step folding away), and the round arrow to step 2. Each
 * field stops at what an event allows, counting characters as people see them. A field whose value
 * is valid gets a small green check at its end. Until both are, the arrow, still in the Tab order,
 * does nothing, and tells screen readers what is missing (on screen, the labels above the fields
 * already say what to write); Enter in either field presses it.
 */
@Component({
  selector: 'app-wizard-details',
  imports: [FormField, FormRoot, TranslocoPipe],
  styleUrl: './wizard-details.scss',
  templateUrl: './wizard-details.html',
})
export class WizardDetails {
  /** The organizer's name and the event's title, as typed. */
  readonly details = model<EventDetails>({ organizerName: '', title: '' });
  /** The step is valid and the organizer goes on to the dates. */
  readonly next = output();

  /** The two fields, each problem of the shared rule on the field it is about. */
  protected readonly fields = form(
    this.details,
    (path) => {
      validateTree(path, ({ value, fieldTreeOf }) =>
        detailsProblems(value()).map(({ code }) => ({
          kind: code,
          fieldTree: fieldTreeOf(code.startsWith('NAME_') ? path.organizerName : path.title),
        })),
      );
    },
    // Only runs once nothing is missing: the arrow and Enter both submit the form.
    {
      submission: {
        action: () => {
          this.next.emit();
          return Promise.resolve(undefined);
        },
      },
    },
  );

  private readonly missingSentences = translateSignal(
    computed(() => missingKeys(detailsProblems(this.details()))),
  );

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

  /** Cuts what was just typed or pasted to what an event allows, as a field's own limit would. */
  protected clip(): void {
    this.details.update(clipDetails);
  }
}

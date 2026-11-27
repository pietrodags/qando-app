import {
  Component,
  type ElementRef,
  afterNextRender,
  computed,
  model,
  output,
  viewChild,
} from '@angular/core';
import { FormField, FormRoot, form, validate } from '@angular/forms/signals';
import { TranslocoPipe, translateSignal } from '@jsverse/transloco';
import { EVENT_TITLE_MAX_LENGTH, type EventDetails, titleProblem } from '@qando/domain';
import { CharacterLimit } from '../../shared/ui/character-limit';

/** From this width the keyboard no longer covers the page, so the title field takes the cursor. */
const AUTOFOCUS_QUERY = '(min-width: 650px)';

/** The sentence of each problem of the title, under `create.details.missing`. */
const MISSING = { TITLE_MISSING: 'titleMissing', TITLE_TOO_LONG: 'titleTooLong' } as const;

/**
 * Step 1 of the creation wizard, inside its card: the event's title alone, asked as a question
 * (the page holds it, with the organizer's name the last step asks, so they outlive the step
 * folding away), and the round arrow to step 2. The field stops at what an event allows, counting
 * characters as people see them, and shows no check once valid. Until the title is written, the
 * arrow, still in the Tab order, does nothing and tells screen readers what is missing (on
 * screen, the question above the field already says what to write); Enter in the field presses
 * it. Where the keyboard does not cover the page, the cursor starts in the field.
 */
@Component({
  selector: 'app-wizard-details',
  imports: [CharacterLimit, FormField, FormRoot, TranslocoPipe],
  styleUrl: './wizard-details.scss',
  templateUrl: './wizard-details.html',
})
export class WizardDetails {
  /** The organizer's name and the event's title, as typed; this step edits the title. */
  readonly details = model.required<EventDetails>();
  /** The title is written and the organizer goes on to the dates. */
  readonly next = output();

  /** The title's field, with the problem of the shared rule. */
  protected readonly fields = form(
    this.details,
    (path) => {
      validate(path.title, ({ value }) => {
        const problem = titleProblem(value());
        return problem ? { kind: problem.code } : null;
      });
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

  protected readonly titleMax = EVENT_TITLE_MAX_LENGTH;

  private readonly missingSentences = translateSignal(
    computed<string[]>(() => {
      const problem = titleProblem(this.details().title);
      return problem ? [`create.details.missing.${MISSING[problem.code]}`] : [];
    }),
  );

  /** What is missing, for screen readers; empty once the title is written. */
  protected readonly missing = computed<string>(() => this.missingSentences().join(' '));

  private readonly titleField = viewChild.required<ElementRef<HTMLInputElement>>('titleField');

  constructor() {
    afterNextRender(() => {
      if (window.matchMedia(AUTOFOCUS_QUERY).matches) this.titleField().nativeElement.focus();
    });
  }
}

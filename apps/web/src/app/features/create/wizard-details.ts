import {
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  model,
  output,
  viewChild,
} from '@angular/core';
import { FormField, FormRoot, form, validateTree } from '@angular/forms/signals';
import { TranslocoPipe, translateSignal } from '@jsverse/transloco';
import { organizerNameEndpoint } from '@qando/contracts';
import {
  type DetailsProblem,
  EVENT_TITLE_MAX_LENGTH,
  type EventDetails,
  ORGANIZER_NAME_MAX_LENGTH,
  detailsProblems,
} from '@qando/domain';
import { ApiClient } from '../../core/api/api-client';
import { Session } from '../../core/auth/session';
import { CharacterLimit } from '../../shared/ui/character-limit';

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
 *
 * Opened with the name empty by an organizer signed in, the step proposes the organizer name of
 * the account's last event, which the organizer can change: it fills the field once the API has
 * answered, if the field is still empty and the organizer has not gone into it, and tells the page
 * (`proposed`); the cursor the step put in the name field goes on to the title, what is left to
 * write. Without a session (also one signed out meanwhile), an event or an answer, the field stays
 * as it is.
 */
@Component({
  selector: 'app-wizard-details',
  imports: [CharacterLimit, FormField, FormRoot, TranslocoPipe],
  styleUrl: './wizard-details.scss',
  templateUrl: './wizard-details.html',
})
export class WizardDetails {
  private readonly session = inject(Session);
  private readonly api = inject(ApiClient);
  private readonly destroyRef = inject(DestroyRef);

  /** The organizer's name and the event's title, as typed. */
  readonly details = model.required<EventDetails>();
  /** The step is valid and the organizer goes on to the dates. */
  readonly next = output();
  /** The name of the account's last event, just filled in for the organizer. */
  readonly proposed = output<string>();

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

  /** The most characters each field holds. */
  protected readonly limits: Record<keyof EventDetails, number> = {
    organizerName: ORGANIZER_NAME_MAX_LENGTH,
    title: EVENT_TITLE_MAX_LENGTH,
  };

  private readonly missingSentences = translateSignal(
    computed(() => missingKeys(detailsProblems(this.details()))),
  );

  /** What is missing, one sentence per problem, for screen readers; empty once the step is valid. */
  protected readonly missing = computed(() => this.missingSentences().join(' '));

  private readonly nameField = viewChild.required<ElementRef<HTMLInputElement>>('nameField');
  private readonly titleField = viewChild.required<ElementRef<HTMLInputElement>>('titleField');

  /** The cursor is in the name field because the step put it there, not the organizer. */
  protected cursorPlaced = false;

  constructor() {
    afterNextRender(() => {
      if (window.matchMedia(AUTOFOCUS_QUERY).matches) {
        this.nameField().nativeElement.focus();
        this.cursorPlaced = true;
      }
      // Asked once the cursor is placed, so the answer finds it where it starts.
      if (this.details().organizerName === '') void this.proposeName();
    });
  }

  /** The organizer name of the account's last event, in the name field if it is still empty. */
  private async proposeName(): Promise<void> {
    if (!(await this.session.signedIn())) return;
    let proposed: string | null;
    try {
      ({ organizerName: proposed } = await this.api.send(organizerNameEndpoint, { params: {} }));
    } catch {
      // The organizer types the name, as without an event.
      return;
    }
    if (proposed === null || this.destroyRef.destroyed || !this.session.account()) return;
    if (this.details().organizerName !== '') return;
    const inName = document.activeElement === this.nameField().nativeElement;
    // The organizer went into the field to type the name.
    if (inName && !this.cursorPlaced) return;
    this.details.update((details) => ({ ...details, organizerName: proposed }));
    this.proposed.emit(proposed);
    if (inName) this.titleField().nativeElement.focus();
  }
}

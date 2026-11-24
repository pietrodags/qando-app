import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  type ElementRef,
  Injector,
  type Signal,
  type WritableSignal,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, FormRoot, disabled, form, readonly } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { codeExpiredSchema, tooManyAttemptsSchema, wrongCodeSchema } from '@qando/contracts';
import { requestFailure, waiting } from '../../core/api/request-failure';
import { secondsUntil } from '../../core/api/wait';
import { FailureNotice } from './failure-notice';

/** What a code step does with a complete code, and how it asks for a new one. */
export interface CodeActions {
  /**
   * Uses the code: resolves once it was right and its work is done (the page may be leaving);
   * rejects with the API's error otherwise. A 400 answer whose body is a wrong, expired or void
   * code is a refusal of the code; any other failure is a check without an answer.
   */
  use(code: string): Promise<void>;
  /** Sends a new code, replacing the last one: resolves with the seconds until another may be asked. */
  send(): Promise<number>;
}

/**
 * Why the API refused a code: wrong (that `code`, with tries left), or no longer of use (a new
 * one is needed).
 */
type Refusal =
  | { readonly kind: 'wrong'; readonly attemptsLeft: number; readonly code: string }
  | { readonly kind: 'expired' }
  | { readonly kind: 'tooManyAttempts' };

/** How the last check ended without its work done: a refusal of the code, or no answer about it. */
type Outcome = Refusal | { readonly kind: 'unanswered'; readonly error: unknown };

const CODE_LENGTH = 6;

/**
 * The step that asks for the 6-digit code emailed to `email` and does its page's work with it
 * (`actions`): one field that keeps the 6 digits of whatever is typed, pasted or suggested by the
 * device and uses the code as soon as it is complete; every refusal of the code; and sending a
 * new code after the wait the API asks. What the page adds under it (a way back, a way out) is
 * projected after the spam line. The same step signs in, creates an event once signed in, and
 * deletes an account: only its actions and the lines that say what the code does change.
 */
@Component({
  selector: 'app-code-step',
  imports: [FailureNotice, FormField, FormRoot, TranslocoPipe],
  styleUrl: './code-step.scss',
  host: { '[class.dialog]': "look() === 'dialog'" },
  templateUrl: './code-step.html',
})
export class CodeStep {
  /** The email the code was sent to, as the API took it. */
  readonly email = input.required<string>();
  /** The seconds to wait before a new code can be asked, as answered with the code just sent. */
  readonly resendAfterSeconds = input.required<number>();
  /** What the page does with a complete code, and how it sends a new one. */
  readonly actions = input.required<CodeActions>();
  /** The heading's level: 1 as the page's own heading, 2 inside a page or a dialog. */
  readonly headingLevel = input<1 | 2>(2);
  /** Translation key of the line under the field until a check: what its last digit does. */
  readonly hintKey = input.required<string>();
  /** Translation key of the line while the code is checked. */
  readonly checkingKey = input.required<string>();
  /** Its look: a page's card (the sign-in page, the wizard), or a dialog's smaller type. */
  readonly look = input<'page' | 'dialog'>('page');

  private readonly injector = inject(Injector);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  /** The digits in the field. */
  protected readonly code = signal('');
  private readonly checks = signal(false);
  /** The code is being checked, or was right and the page is leaving. */
  readonly checking: Signal<boolean> = this.checks.asReadonly();
  /** How the last check ended; null before any, and for a new code. */
  private readonly outcome = signal<Outcome | null>(null);

  /** The API's refusal of the code typed. */
  protected readonly refusal = computed<Refusal | null>(() => {
    const outcome = this.outcome();
    return outcome === null || outcome.kind === 'unanswered' ? null : outcome;
  });

  /** The check that failed without an answer about the code. */
  protected readonly checkFailure = requestFailure(() => {
    const outcome = this.outcome();
    return outcome?.kind === 'unanswered' ? outcome.error : null;
  });

  /** A code that no longer works: only a new one helps. */
  protected readonly isVoid = computed<boolean>(() => {
    const kind = this.outcome()?.kind;
    return kind === 'expired' || kind === 'tooManyAttempts';
  });

  /**
   * The failed check can be tried again now: the code is still whole, no limit of tries lasts
   * and no new code is on its way.
   */
  protected readonly canRetry = computed<boolean>(
    () => this.code().length === CODE_LENGTH && !waiting(this.checkFailure()) && !this.sending(),
  );

  /** Nothing to say about a check: the field tells what its last digit does. */
  protected readonly showsHint = computed<boolean>(() => !this.checks() && this.outcome() === null);

  private readonly sending = signal(false);
  private readonly sendError = signal<unknown>(null);
  protected readonly sendFailure = requestFailure(this.sendError);

  /** The clock time from which a new code can be asked. */
  private readonly resendAt: WritableSignal<number> = linkedSignal<number, number>({
    source: this.resendAfterSeconds,
    computation: (seconds) => Date.now() + seconds * 1000,
  });

  /** The seconds still to wait before asking for a new code. */
  protected readonly resendWait = secondsUntil(() => this.resendAt());

  /**
   * A new code can be asked now: not while one is on its way or a code is being checked (its
   * answer would be told of the new code), nor before the wait is over.
   */
  protected readonly canSend = computed<boolean>(
    () =>
      !this.sending() && !this.checks() && this.resendWait() === 0 && !waiting(this.sendFailure()),
  );

  private readonly sendNew = viewChild<ElementRef<HTMLButtonElement>>('sendNew');

  /**
   * The code field: read-only while its code is checked, off once the code no longer works.
   * Sending the form (Enter) checks the code.
   */
  protected readonly fields = form(
    this.code,
    (path) => {
      readonly(path, { when: () => this.checks() });
      disabled(path, { when: () => this.isVoid() });
    },
    {
      submission: {
        action: () => {
          this.check();
          return Promise.resolve(undefined);
        },
      },
    },
  );

  constructor() {
    afterNextRender(() => {
      this.field().nativeElement.focus();
    });
  }

  /** The field changed: keeps its first 6 digits, and checks the code once it has them all. */
  protected typed(): void {
    const field = this.field().nativeElement;
    const digits = field.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    field.value = digits;
    this.code.set(digits);
    this.check();
  }

  /**
   * Uses the code, when it is complete and nothing forbids checking it now. A code the API
   * already refused as wrong is not sent again: it would only spend another try. Once the code
   * was right the step stays as it is, checking: its page goes on from there.
   */
  protected check(): void {
    const code = this.code();
    const outcome = this.outcome();
    if (
      code.length !== CODE_LENGTH ||
      this.checks() ||
      this.sending() ||
      this.isVoid() ||
      waiting(this.checkFailure()) ||
      (outcome?.kind === 'wrong' && outcome.code === code)
    ) {
      return;
    }
    this.checks.set(true);
    this.actions()
      .use(code)
      .catch((error: unknown) => {
        this.outcome.set(refusalOf(error, code) ?? { kind: 'unanswered', error });
        this.checks.set(false);
        if (this.isVoid()) {
          this.code.set('');
          // The field goes off under the cursor: it moves to the way out.
          this.focusOnceRendered(() => this.sendNew());
        }
      });
  }

  /**
   * Asks for a new code, when one can be asked now; it replaces the last one, and the step
   * starts again.
   */
  protected sendCode(): void {
    if (!this.canSend()) return;
    this.sending.set(true);
    this.sendError.set(null);
    this.actions()
      .send()
      .then(
        (resendAfterSeconds) => {
          this.resendAt.set(Date.now() + resendAfterSeconds * 1000);
          this.outcome.set(null);
          this.code.set('');
          this.focusOnceRendered(() => this.field());
        },
        (error: unknown) => {
          this.sendError.set(error);
        },
      )
      .finally(() => {
        this.sending.set(false);
      });
  }

  /** Moves the cursor to an element as it is after the next rendering (shown, or turned on). */
  private focusOnceRendered(target: () => ElementRef<HTMLElement> | undefined): void {
    afterNextRender(
      () => {
        target()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }
}

/** The refusal of `code` a 400 answer holds; null for any other failure. */
function refusalOf(error: unknown, code: string): Refusal | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 400) return null;
  const wrong = wrongCodeSchema.safeParse(error.error);
  if (wrong.success) return { kind: 'wrong', attemptsLeft: wrong.data.error.attemptsLeft, code };
  if (codeExpiredSchema.safeParse(error.error).success) return { kind: 'expired' };
  if (tooManyAttemptsSchema.safeParse(error.error).success) return { kind: 'tooManyAttempts' };
  return null;
}

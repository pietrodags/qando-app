import {
  Component,
  type ElementRef,
  Injector,
  type WritableSignal,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { sendSignInCodeEndpoint, signInEndpoint } from '@qando/contracts';
import { ApiClient } from '../../core/api/api-client';
import { apiError } from '../../core/api/api-resource';
import { requestFailure, waiting } from '../../core/api/request-failure';
import { secondsUntil } from '../../core/api/wait';
import { FailureNotice } from '../../shared/ui/failure-notice';

/**
 * Why the API refused a code: wrong (that `code`, with tries left), or no longer of use (a new
 * one is needed).
 */
type Refusal =
  | { readonly kind: 'wrong'; readonly attemptsLeft: number; readonly code: string }
  | { readonly kind: 'expired' }
  | { readonly kind: 'tooManyAttempts' };

/** How the last check ended without signing in: a refusal of the code, or no answer about it. */
type Outcome = Refusal | { readonly kind: 'unanswered'; readonly error: unknown };

const CODE_LENGTH = 6;

/**
 * The step that signs in with the code emailed to `email`, inside its page's card: one field
 * that keeps the 6 digits of whatever is typed, pasted or suggested by the device and checks the
 * code as soon as it is complete; every refusal of the code; sending a new code after the wait
 * the API asks; and the way back to a mistyped email.
 */
@Component({
  selector: 'app-sign-in-code',
  imports: [FailureNotice, TranslocoPipe],
  styleUrl: './sign-in-code.scss',
  templateUrl: './sign-in-code.html',
})
export class SignInCode {
  /** The email the code was sent to, as the API took it. */
  readonly email = input.required<string>();
  /** The seconds to wait before a new code can be asked, as answered with the code just sent. */
  readonly resendAfterSeconds = input.required<number>();
  /** The code was right: the browser holds the session. */
  readonly signedIn = output();
  /** The person wants to correct the email ("Cambiar email"). */
  readonly changeEmail = output();

  private readonly api = inject(ApiClient);
  private readonly injector = inject(Injector);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  /** The digits in the field. */
  protected readonly code = signal('');
  /** The code is being checked, or was right and the page is leaving. */
  protected readonly checking = signal(false);
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
  protected readonly showsHint = computed<boolean>(
    () => !this.checking() && this.outcome() === null,
  );

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
      !this.sending() &&
      !this.checking() &&
      this.resendWait() === 0 &&
      !waiting(this.sendFailure()),
  );

  private readonly sendNew = viewChild<ElementRef<HTMLButtonElement>>('sendNew');

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
   * Signs in with the code, when it is complete and nothing forbids checking it now. A code the
   * API already refused as wrong is not sent again: it would only spend another try.
   */
  protected check(): void {
    const code = this.code();
    const outcome = this.outcome();
    if (
      code.length !== CODE_LENGTH ||
      this.checking() ||
      this.sending() ||
      this.isVoid() ||
      waiting(this.checkFailure()) ||
      (outcome?.kind === 'wrong' && outcome.code === code)
    ) {
      return;
    }
    this.checking.set(true);
    this.api.send(signInEndpoint, { params: {}, body: { email: this.email(), code } }).then(
      () => {
        this.signedIn.emit();
      },
      (error: unknown) => {
        this.outcome.set(refusalOf(error, code) ?? { kind: 'unanswered', error });
        this.checking.set(false);
        if (this.isVoid()) {
          this.code.set('');
          // The field goes off under the cursor: it moves to the way out.
          this.focusOnceRendered(() => this.sendNew());
        }
      },
    );
  }

  /**
   * Asks for a new code, when one can be asked now; it replaces the last one, and the step
   * starts again.
   */
  protected sendCode(): void {
    if (!this.canSend()) return;
    this.sending.set(true);
    this.sendError.set(null);
    this.api
      .send(sendSignInCodeEndpoint, { params: {}, body: { email: this.email() } })
      .then(
        (sent) => {
          this.resendAt.set(Date.now() + sent.resendAfterSeconds * 1000);
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

/** The refusal of `code` the API answered with; null for any other failure. */
function refusalOf(error: unknown, code: string): Refusal | null {
  const answer = apiError(signInEndpoint, error);
  if (answer?.status !== 400) return null;
  switch (answer.body.error.code) {
    case 'WRONG_CODE':
      return { kind: 'wrong', attemptsLeft: answer.body.error.attemptsLeft, code };
    case 'CODE_EXPIRED':
      return { kind: 'expired' };
    case 'TOO_MANY_ATTEMPTS':
      return { kind: 'tooManyAttempts' };
    default:
      return null;
  }
}

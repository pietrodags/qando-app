import {
  Component,
  type ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { sendSignInCodeEndpoint, signInCodeBodySchema } from '@qando/contracts';
import { ApiClient } from '../../core/api/api-client';
import { requestFailure, waiting } from '../../core/api/request-failure';
import { returnTarget } from '../../core/auth/sign-in-return';
import { FailureNotice } from '../../shared/ui/failure-notice';
import { SignInCode } from './sign-in-code';

/** A code on its way to an email, and the seconds to wait before asking for another. */
interface SentCode {
  readonly email: string;
  readonly resendAfterSeconds: number;
}

/**
 * The sign-in page: asks for the email, sends it a code, and hands over to the code step; once
 * signed in, opens the page that asked for it (`returnTo`), "Mis eventos" without one.
 */
@Component({
  selector: 'app-sign-in-page',
  imports: [FailureNotice, SignInCode, TranslocoPipe],
  styleUrl: './sign-in-page.scss',
  templateUrl: './sign-in-page.html',
})
export class SignInPage {
  /** The page to open after signing in, from the address's query. */
  readonly returnTo = input<string>();

  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly emailField = viewChild<ElementRef<HTMLInputElement>>('emailField');

  /** The email as typed. */
  protected readonly email = signal('');
  /** The email typed was refused before sending: not an address. */
  protected readonly invalid = signal(false);
  /** The code sent last; null while the email is asked. */
  protected readonly sent = signal<SentCode | null>(null);

  protected readonly sending = signal(false);
  private readonly sendError = signal<unknown>(null);
  protected readonly failure = requestFailure(this.sendError);

  protected readonly canSend = computed<boolean>(() => !this.sending() && !waiting(this.failure()));

  constructor() {
    this.focusEmail();
  }

  protected typed(value: string): void {
    this.email.set(value);
    this.invalid.set(false);
  }

  /** Sends a code to the email typed, when it is an address; says so otherwise. */
  protected send(): void {
    if (!this.canSend()) return;
    const body = signInCodeBodySchema.safeParse({ email: this.email() });
    if (!body.success) {
      this.invalid.set(true);
      this.emailField()?.nativeElement.focus();
      return;
    }
    this.sending.set(true);
    this.sendError.set(null);
    this.api
      .send(sendSignInCodeEndpoint, { params: {}, body: body.data })
      .then(
        ({ resendAfterSeconds }) => {
          this.sent.set({ email: body.data.email, resendAfterSeconds });
        },
        (error: unknown) => {
          this.sendError.set(error);
        },
      )
      .finally(() => {
        this.sending.set(false);
      });
  }

  /** Back to the email, kept as typed. */
  protected changeEmail(): void {
    this.sent.set(null);
    this.focusEmail();
  }

  /** Signed in: this page gives its place to the one that asked for it. */
  protected signedIn(): void {
    void this.router.navigateByUrl(returnTarget(this.returnTo()), { replaceUrl: true });
  }

  private focusEmail(): void {
    afterNextRender(
      () => {
        this.emailField()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }
}

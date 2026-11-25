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
import { FormField, FormRoot, form, validateStandardSchema } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  type SignInCodeBody,
  sendSignInCodeEndpoint,
  signInCodeBodySchema,
} from '@qando/contracts';
import { ApiClient } from '../../core/api/api-client';
import { requestFailure, waiting } from '../../core/api/request-failure';
import { returnTarget } from '../../core/auth/sign-in-return';
import { WholeNavigation } from '../../core/auth/whole-navigation';
import { FailureNotice } from '../../shared/ui/failure-notice';
import { PrivacyLink } from '../../shared/ui/privacy-link';
import { connectionRequestOf } from '../../core/auth/connection-request';
import { SignInCode } from './sign-in-code';

/** A code on its way to an email, and the seconds to wait before asking for another. */
interface SentCode {
  readonly email: string;
  readonly resendAfterSeconds: number;
}

/**
 * The sign-in page: asks for the email, sends it a code, and hands over to the code step; once
 * signed in, opens the page that asked for it (`returnTo`), "Mis eventos" without one. Opened
 * by an application's request to connect (its address carries the request, signed), it sends
 * the request with the code and then leaves for the address the API answers, where the request
 * goes on.
 */
@Component({
  selector: 'app-sign-in-page',
  imports: [FailureNotice, FormField, FormRoot, PrivacyLink, SignInCode, TranslocoPipe],
  styleUrl: './sign-in-page.scss',
  templateUrl: './sign-in-page.html',
})
export class SignInPage {
  /** The page to open after signing in, from the address's query. */
  readonly returnTo = input<string>();

  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly browser = inject(WholeNavigation);
  private readonly injector = inject(Injector);
  /** The request to connect an application that opened the page; none otherwise. */
  protected readonly connectionRequest = connectionRequestOf(
    inject(ActivatedRoute).snapshot.queryParamMap,
  );
  /** Only read while the email is asked: the field is then on the page. */
  private readonly emailField = viewChild.required<ElementRef<HTMLInputElement>>('emailField');

  /** The email as typed. */
  private readonly typed = signal<SignInCodeBody>({ email: '' });
  /** The email typed was refused before sending: not an address. */
  protected readonly invalid = signal(false);
  /** The code sent last; null while the email is asked. */
  protected readonly sent = signal<SentCode | null>(null);

  private readonly sendError = signal<unknown>(null);
  protected readonly failure = requestFailure(this.sendError);

  /**
   * The email field, with the API's rule for it. Sending the form sends a code when it is an
   * address and says so otherwise, as long as no limit of requests lasts.
   */
  protected readonly fields = form(
    this.typed,
    (path) => {
      validateStandardSchema(path, signInCodeBodySchema);
    },
    {
      submission: {
        action: () => this.send(),
        onInvalid: () => {
          if (waiting(this.failure())) return;
          this.sendError.set(null);
          this.invalid.set(true);
          this.emailField().nativeElement.focus();
        },
      },
    },
  );

  /** The code is on its way: one at a time. */
  protected readonly sending = computed<boolean>(() => this.fields().submitting());

  protected readonly canSend = computed<boolean>(() => !this.sending() && !waiting(this.failure()));

  constructor() {
    this.focusEmail();
  }

  /** Sends a code to the email typed, already known to be an address. */
  private async send(): Promise<undefined> {
    if (waiting(this.failure())) return;
    this.sendError.set(null);
    const body = signInCodeBodySchema.parse(this.typed());
    try {
      const { resendAfterSeconds } = await this.api.send(sendSignInCodeEndpoint, {
        params: {},
        body,
      });
      this.sent.set({ email: body.email, resendAfterSeconds });
    } catch (error: unknown) {
      this.sendError.set(error);
    }
  }

  /** Back to the email, kept as typed. */
  protected changeEmail(): void {
    this.sent.set(null);
    this.focusEmail();
  }

  /**
   * Signed in: this page gives its place to the one that asked for it, or to the address the
   * API said a request to connect goes on at (`continueTo`), which the app's router does not
   * serve.
   */
  protected signedIn(continueTo: string | undefined): void {
    if (continueTo !== undefined) {
      this.browser.replaceWith(continueTo);
      return;
    }
    void this.router.navigateByUrl(returnTarget(this.returnTo()), { replaceUrl: true });
  }

  private focusEmail(): void {
    afterNextRender(
      () => {
        this.emailField().nativeElement.focus();
      },
      { injector: this.injector },
    );
  }
}

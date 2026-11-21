import { DOCUMENT } from '@angular/common';
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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  type SignInCodeBody,
  sendSignInCodeEndpoint,
  signInCodeBodySchema,
} from '@qando/contracts';
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
  imports: [FailureNotice, FormField, FormRoot, SignInCode, TranslocoPipe],
  styleUrl: './sign-in-page.scss',
  templateUrl: './sign-in-page.html',
})
export class SignInPage {
  /** The page to open after signing in, from the address's query. */
  readonly returnTo = input<string>();

  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  /**
   * PROTOTYPE: the page's query as an application's request for access left it (signed by the
   * API), when the page was opened by one; signing in then continues that request.
   */
  protected readonly oauthQuery = signedRequestOf(this.document.location.search);
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

  /** Signed in: this page gives its place to the one that asked for it. */
  protected signedIn(continueTo?: string): void {
    // PROTOTYPE: a whole navigation, since the address may be the application's, not a page here.
    if (continueTo !== undefined) {
      this.document.location.assign(continueTo);
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

/** PROTOTYPE: the query without its `?` when it is a signed request for access, none otherwise. */
function signedRequestOf(search: string): string | undefined {
  const query = new URLSearchParams(search);
  return query.has('sig') && query.has('client_id') ? search.replace(/^\?/, '') : undefined;
}

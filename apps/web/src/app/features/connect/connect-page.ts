import {
  Component,
  DestroyRef,
  type ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ConnectingApplication } from '@qando/contracts';
import { requestFailure, waiting } from '../../core/api/request-failure';
import { connectionRequestOf } from '../../core/auth/connection-request';
import { Session } from '../../core/auth/session';
import { WholeNavigation } from '../../core/auth/whole-navigation';
import { ErrorState } from '../../shared/ui/error-state';
import { FailureNotice } from '../../shared/ui/failure-notice';
import { LoadingState } from '../../shared/ui/loading-state';
import { PrivacyLink } from '../../shared/ui/privacy-link';
import { ConnectionConsent, type NothingToAllow } from './connection-consent';

/** What the page shows: its card, or the state that stands for it while there is none. */
type Shown =
  | { readonly kind: 'loading' }
  /** The request to answer, the application that made it and the email of the account it asks for. */
  | {
      readonly kind: 'consent';
      readonly request: string;
      readonly application: ConnectingApplication;
      readonly email: string;
    }
  | { readonly kind: 'expired' }
  /** The page could not learn what to show; the error, when a request failed with one. */
  | { readonly kind: 'failed'; readonly error: unknown };

/**
 * The consent page: an application asked to act for the signed-in account (its request, signed
 * by the authorization server, is the page's query), and the account allows it or not. It names
 * the application by what it says of itself (its name, and the host it is published at, never a
 * logo), says what it will be able to do, and sends the answer, after which the browser goes back
 * to the application. A page opened without a request, or with one that expired, says to start
 * again from the assistant; without a session it gives its place to the sign-in page, which
 * comes back with the request.
 */
@Component({
  selector: 'app-connect-page',
  imports: [ErrorState, FailureNotice, LoadingState, PrivacyLink, RouterLink, TranslocoPipe],
  styleUrl: './connect-page.scss',
  templateUrl: './connect-page.html',
})
export class ConnectPage {
  private readonly consent = inject(ConnectionConsent);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = inject(WholeNavigation);

  /** The request to connect the page was opened with, read once; none in any other address. */
  private readonly request = connectionRequestOf(this.route.snapshot.queryParamMap);

  /** Nothing to allow, until the request the page was opened with says more (`load`). */
  protected readonly shown = signal<Shown>({ kind: 'expired' });

  /** The answer is on its way, or the browser is leaving with it: one answer, once. */
  protected readonly sending = signal(false);
  private readonly sendError = signal<unknown>(null);
  /** Why the answer could not be sent, for the notice under the buttons. */
  protected readonly failure = requestFailure(this.sendError);
  protected readonly canAnswer = computed<boolean>(
    () => !this.sending() && !waiting(this.failure()),
  );

  /** The card's heading, once the card says something: it takes the focus, for screen readers. */
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private left = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.left = true;
    });
    afterRenderEffect(() => {
      this.heading()?.nativeElement.focus();
    });
    void this.load();
  }

  /** Learns what to show for the request: the application and the account, or why not. */
  protected async load(): Promise<void> {
    const request = this.request;
    if (request === undefined) return;
    this.shown.set({ kind: 'loading' });
    let application: ConnectingApplication | NothingToAllow;
    try {
      application = await this.consent.application(request);
    } catch (error: unknown) {
      this.shown.set({ kind: 'failed', error });
      return;
    }
    if (application === 'expired') {
      this.shown.set({ kind: 'expired' });
      return;
    }
    if (application === 'signed-out') {
      await this.signIn();
      return;
    }
    // The API named the application to a session; whose it is, the app's session knows.
    await this.session.signedIn();
    const email = this.session.account()?.email;
    this.shown.set(
      email === undefined
        ? { kind: 'failed', error: null }
        : { kind: 'consent', request, application, email },
    );
  }

  /** Sends the account's answer to `request` and follows the browser back to the application. */
  protected async answer(request: string, allow: boolean): Promise<void> {
    if (!this.canAnswer()) return;
    this.sending.set(true);
    this.sendError.set(null);
    try {
      const outcome = await this.consent.answer(request, allow);
      if (outcome === 'expired') {
        this.shown.set({ kind: 'expired' });
      } else if (outcome === 'signed-out') {
        await this.signIn();
      } else {
        // The buttons stay off while the browser leaves.
        this.browser.replaceWith(outcome.returnTo);
        return;
      }
    } catch (error: unknown) {
      this.sendError.set(error);
    }
    this.sending.set(false);
  }

  /** The session has ended: the sign-in page takes this page's place, and goes on with its query. */
  private async signIn(): Promise<void> {
    // The header learns the session has gone.
    await this.session.refresh();
    // Gone elsewhere meanwhile (the logo, the menu): the person's choice stands.
    if (this.left) return;
    await this.router.navigate(['/sign-in'], {
      queryParams: this.route.snapshot.queryParams,
      replaceUrl: true,
    });
  }
}

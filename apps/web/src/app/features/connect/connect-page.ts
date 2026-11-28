import {
  Component,
  DestroyRef,
  type ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ConnectingApplication } from '@qando/contracts';
import { requestFailure, waiting } from '../../core/api/request-failure';
import { connectionRequestOf } from '../../core/auth/connection-request';
import { Session } from '../../core/auth/session';
import { WholeNavigation } from '../../core/auth/whole-navigation';
import { AssistantName } from '../../shared/ui/assistant-name';
import { ErrorState } from '../../shared/ui/error-state';
import { FailureNotice } from '../../shared/ui/failure-notice';
import { LoadingState } from '../../shared/ui/loading-state';
import { PrivacyLink } from '../../shared/ui/privacy-link';
import { ConnectionConsent, type NothingToAllow } from './connection-consent';

/** What the page learned of the request it was opened with. */
type Asked =
  | { readonly kind: 'loading' }
  /** The request to answer and the application that made it. */
  | {
      readonly kind: 'named';
      readonly request: string;
      readonly application: ConnectingApplication;
    }
  | { readonly kind: 'expired' }
  /**
   * The answer is given, and handed to an application installed on the computer at `returnTo`:
   * the browser stays here, and hands the same answer again if the application did not open.
   */
  | {
      readonly kind: 'handed';
      readonly application: ConnectingApplication;
      readonly returnTo: string;
    }
  /** The page could not learn what to show; the error, when a request failed with one. */
  | { readonly kind: 'failed'; readonly error: unknown };

/**
 * What the page shows: its card (the `consent`, or `expired`), or the state that stands for it
 * while there is none. The consent adds the email of the account that would allow the request.
 */
type Shown =
  | Exclude<Asked, { readonly kind: 'named' }>
  | {
      readonly kind: 'consent';
      readonly request: string;
      readonly application: ConnectingApplication;
      readonly email: string;
    };

/**
 * The consent page: an application asked to act for the signed-in account (its request, signed
 * by the authorization server, is the page's query), and the account allows it or not. It names
 * the application by what it says of itself (its name, and the host it is published at, never a
 * logo), says what it will be able to do, and sends the answer, after which the browser goes back
 * to the application. A page opened without a request, or with one that expired, says to start
 * again from the assistant; without a session it gives its place to the sign-in page, which
 * comes back with the request. The account it names is always the one the session holds now:
 * the answer is taken for that account, whichever tab signed it in.
 */
@Component({
  selector: 'app-connect-page',
  imports: [
    AssistantName,
    ErrorState,
    FailureNotice,
    LoadingState,
    PrivacyLink,
    RouterLink,
    TranslocoPipe,
  ],
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
  private readonly asked = signal<Asked>({ kind: 'expired' });

  /**
   * The consent names the account of the session as it is now, not as it was when the page
   * loaded. Without one any more (signed out from another tab) no card shows: the page is on its
   * way to the sign-in page.
   */
  protected readonly shown = computed<Shown>(() => {
    const asked = this.asked();
    if (asked.kind !== 'named') return asked;
    const email = this.session.account()?.email;
    return email === undefined ? { kind: 'loading' } : { ...asked, kind: 'consent', email };
  });

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
  /** On its way to the sign-in page: once. */
  private leaving = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.left = true;
    });
    effect(() => {
      // The account is gone while the consent was on the page: the session ended, or the
      // question about it failed. The page learns again what to show, as when it opened.
      if (this.asked().kind === 'named' && !this.session.account()) {
        untracked(() => void this.load());
      }
    });
    afterRenderEffect(() => {
      this.heading()?.nativeElement.focus();
    });
    void this.load();
  }

  /**
   * Learns what to show for the request: the application and the account, or why not. An answer
   * given while it asks (the page asks again when the account is gone) settles what the page
   * shows: what was learned meanwhile is dropped, so the consent never comes back after it.
   */
  protected async load(): Promise<void> {
    const request = this.request;
    if (request === undefined) return;
    const loading: Asked = { kind: 'loading' };
    this.asked.set(loading);
    const learned = await this.learn(request);
    if (this.asked() !== loading) return;
    if (learned === 'signed-out') await this.signIn();
    else this.asked.set(learned);
  }

  /** What the API and the app's session say of the request: what to show, or no session. */
  private async learn(request: string): Promise<Asked | 'signed-out'> {
    let application: ConnectingApplication | NothingToAllow;
    try {
      application = await this.consent.application(request);
    } catch (error: unknown) {
      return { kind: 'failed', error };
    }
    if (application === 'expired') return { kind: 'expired' };
    if (application === 'signed-out') return 'signed-out';
    // The API named the application to a session; whose it is, the app's session knows.
    const known = await this.session.signedIn();
    return known ? { kind: 'named', request, application } : { kind: 'failed', error: null };
  }

  /**
   * Sends the account's answer to the request `asked` names, and follows the browser back to the
   * application. The answer is given once: handed to an application installed on the computer,
   * which leaves the browser here, it is handed again, never given again (a "Cancelar" after a
   * "Permitir" would tell the application it was refused while the allowance stays).
   */
  protected async answer(
    asked: Extract<Shown, { kind: 'consent' }>,
    allow: boolean,
  ): Promise<void> {
    if (!this.canAnswer()) return;
    this.sending.set(true);
    this.sendError.set(null);
    try {
      const outcome = await this.consent.answer(asked.request, allow);
      if (outcome === 'expired') {
        this.asked.set({ kind: 'expired' });
      } else if (outcome === 'signed-out') {
        await this.signIn();
      } else {
        this.browser.replaceWith(outcome.returnTo);
        // The buttons stay off while the browser leaves for a page.
        if (!outcome.stays) return;
        const { application } = asked;
        this.asked.set({ kind: 'handed', application, returnTo: outcome.returnTo });
      }
    } catch (error: unknown) {
      this.sendError.set(error);
    }
    this.sending.set(false);
  }

  /** Hands the answer given to the application again, as when it was given. */
  protected handAgain(returnTo: string): void {
    this.browser.replaceWith(returnTo);
  }

  /** The session has ended: the sign-in page takes this page's place, and goes on with its query. */
  private async signIn(): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
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

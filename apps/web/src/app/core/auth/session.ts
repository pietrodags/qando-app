import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Service, computed, inject, signal } from '@angular/core';
import {
  deleteAccountEndpoint,
  sendDeletionCodeEndpoint,
  sessionEndpoint,
  signOutEndpoint,
  type SignedInAccount,
} from '@qando/contracts';
import { ApiClient } from '../api/api-client';
import { ManagementTokens } from './management-tokens';

/** What a tab tells the browser's other tabs: it just signed in, or out. */
type SessionChange = 'signed-in' | 'signed-out';

const CHANNEL = 'qando.session';

/**
 * How long a deletion may go unanswered before it counts as a check without an answer: the
 * dialog that waits for it can be left again.
 */
const DELETION_TIME_LIMIT_MS = 20_000;

/**
 * The organizer's session on this browser: which account is signed in, asked to the API when the
 * app starts (the cookie that holds the session cannot be read by the page), and signing out.
 * A question the API could not answer counts as no session, and is asked again the next time
 * a page needs to know (`signedIn`); `answered` tells it from a session known to be none. The browser's tabs share the session: one that signs in or
 * out tells the others, which ask again or forget as if it had happened in them.
 */
@Service()
export class Session {
  private readonly api = inject(ApiClient);
  private readonly managementTokens = inject(ManagementTokens);

  private readonly known = signal<SignedInAccount | null | undefined>(undefined);
  /** The account signed in: `undefined` until the API first answers, `null` without a session. */
  readonly account = this.known.asReadonly();
  /** The last question about the session got no answer: `account` is `null` all the same. */
  private readonly unanswered = signal(false);
  /**
   * The account is the API's answer, the account signed in or none: false until the API first
   * answers and while the last question got no answer.
   */
  readonly answered = computed<boolean>(() => this.known() !== undefined && !this.unanswered());

  /** Counts the questions and the sign-outs: only the answer to the last one is kept. */
  private turn = 0;
  private asking = this.ask();
  /** The browser's other tabs; none in a browser without `BroadcastChannel`. */
  private readonly otherTabs = otherTabs();

  constructor() {
    const tabs = this.otherTabs;
    if (!tabs) return;
    tabs.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (data === 'signed-out') this.forget();
      if (data === 'signed-in') this.asking = this.ask();
    };
    inject(DestroyRef).onDestroy(() => {
      tabs.close();
    });
  }

  /** Whether an account is signed in, once the API has answered. */
  async signedIn(): Promise<boolean> {
    await this.asking;
    if (this.unanswered()) await (this.asking = this.ask());
    return !!this.known();
  }

  /** Asks the API again, as after signing in, and has the other tabs ask too. */
  refresh(): Promise<void> {
    this.asking = this.ask();
    this.otherTabs?.postMessage('signed-in' satisfies SessionChange);
    return this.asking;
  }

  /**
   * Signs out: the server ends the session, then this browser forgets the account and every
   * management link it keeps (the voters' links stay), in all its tabs. Rejects, with nothing
   * forgotten, when the server could not end the session.
   */
  async signOut(): Promise<void> {
    await this.api.send(signOutEndpoint, { params: {} });
    this.ended();
  }

  /**
   * Sends the code that deletes the account to its email: answers the seconds until another may
   * be asked, or null when the server knew no session any more, which this browser then forgets
   * as when signing out. Rejects, with nothing forgotten, when the code was not sent.
   */
  async sendDeletionCode(): Promise<number | null> {
    const sent = await this.unlessEnded(this.api.send(sendDeletionCodeEndpoint, { params: {} }));
    return sent === null ? null : sent.resendAfterSeconds;
  }

  /**
   * Deletes the account with the code emailed for it: the server deletes it with all its events
   * and ends its sessions, then this browser forgets it as when signing out. Answers how many
   * events went with it, or null when the server knew no session any more (it ended elsewhere,
   * or this deletion's answer was lost after it deleted the account), forgotten all the same.
   * Rejects, with nothing forgotten, when it was not deleted (the code refused among the
   * reasons) or its answer was lost or took over 20 seconds.
   */
  async deleteAccount(code: string): Promise<number | null> {
    const deleted = await this.unlessEnded(
      this.api.send(deleteAccountEndpoint, {
        params: {},
        body: { code },
        within: DELETION_TIME_LIMIT_MS,
      }),
    );
    if (deleted === null) return null;
    this.ended();
    return deleted.events;
  }

  /**
   * The answer to a request made with the session, or null when the server knew none any more
   * (`401`): this browser forgets it then, as when signing out. A `401` that arrives once the
   * session was asked again or forgotten meanwhile rejects instead: it may be about a session
   * already replaced (another tab signed in).
   */
  private async unlessEnded<T>(request: Promise<T>): Promise<T | null> {
    const turn = this.turn;
    try {
      return await request;
    } catch (error) {
      const ended = error instanceof HttpErrorResponse && error.status === 401;
      if (!ended || turn !== this.turn) throw error;
      this.ended();
      return null;
    }
  }

  /** The server ended the session: this tab forgets it, and tells the others to. */
  private ended(): void {
    this.forget();
    this.otherTabs?.postMessage('signed-out' satisfies SessionChange);
  }

  /** What signing out leaves on a tab: no account, no management link, no answer still awaited. */
  private forget(): void {
    this.turn++;
    this.unanswered.set(false);
    this.managementTokens.forgetAll();
    this.known.set(null);
  }

  private async ask(): Promise<void> {
    const turn = ++this.turn;
    let account: SignedInAccount | null = null;
    let unanswered = false;
    try {
      account = await this.api.send(sessionEndpoint, { params: {} });
    } catch {
      unanswered = true;
    }
    if (turn !== this.turn) return;
    this.unanswered.set(unanswered);
    this.known.set(account);
  }
}

function otherTabs(): BroadcastChannel | undefined {
  return typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(CHANNEL);
}

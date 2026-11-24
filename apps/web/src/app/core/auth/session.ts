import { DestroyRef, Service, inject, signal } from '@angular/core';
import {
  deleteAccountEndpoint,
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
 * The organizer's session on this browser: which account is signed in, asked to the API when the
 * app starts (the cookie that holds the session cannot be read by the page), and signing out.
 * A question the API could not answer counts as no session, and is asked again the next time
 * a page needs to know (`signedIn`). The browser's tabs share the session: one that signs in or
 * out tells the others, which ask again or forget as if it had happened in them.
 */
@Service()
export class Session {
  private readonly api = inject(ApiClient);
  private readonly managementTokens = inject(ManagementTokens);

  private readonly known = signal<SignedInAccount | null | undefined>(undefined);
  /** The account signed in: `undefined` until the API first answers, `null` without a session. */
  readonly account = this.known.asReadonly();

  /** Counts the questions and the sign-outs: only the answer to the last one is kept. */
  private turn = 0;
  private unanswered = false;
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
    if (this.unanswered) await (this.asking = this.ask());
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
   * Deletes the account with the code emailed for it: the server deletes it with all its events
   * and ends its sessions, then this browser forgets it as when signing out. Answers how many
   * events went with it; rejects, with nothing forgotten, when it was not deleted (the code
   * refused among the reasons).
   */
  async deleteAccount(code: string): Promise<number> {
    const { events } = await this.api.send(deleteAccountEndpoint, { params: {}, body: { code } });
    this.ended();
    return events;
  }

  /** The server ended the session: this tab forgets it, and tells the others to. */
  private ended(): void {
    this.forget();
    this.otherTabs?.postMessage('signed-out' satisfies SessionChange);
  }

  /** What signing out leaves on a tab: no account, no management link, no answer still awaited. */
  private forget(): void {
    this.turn++;
    this.unanswered = false;
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
    this.unanswered = unanswered;
    this.known.set(account);
  }
}

function otherTabs(): BroadcastChannel | undefined {
  return typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(CHANNEL);
}

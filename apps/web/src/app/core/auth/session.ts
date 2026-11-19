import { Service, inject, signal } from '@angular/core';
import { sessionEndpoint, signOutEndpoint, type SignedInAccount } from '@qando/contracts';
import { ApiClient } from '../api/api-client';
import { ManagementTokens } from './management-tokens';

/**
 * The organizer's session on this browser: which account is signed in, asked to the API when the
 * app starts (the cookie that holds the session cannot be read by the page), and signing out.
 * A question the API could not answer counts as no session, and is asked again the next time
 * a page needs to know (`signedIn`).
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

  /** Whether an account is signed in, once the API has answered. */
  async signedIn(): Promise<boolean> {
    await this.asking;
    if (this.unanswered) await this.refresh();
    return !!this.known();
  }

  /** Asks the API again, as after signing in. */
  refresh(): Promise<void> {
    this.asking = this.ask();
    return this.asking;
  }

  /**
   * Signs out: the server ends the session, then this browser forgets the account and every
   * management link it keeps (the voters' links stay). Rejects, with nothing forgotten, when the
   * server could not end the session.
   */
  async signOut(): Promise<void> {
    await this.api.send(signOutEndpoint, { params: {} });
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

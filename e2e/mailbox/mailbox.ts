// The acceptance run's mailbox: where the API's emails land instead of in anyone's inbox.
// `server.ts` is the SMTP server the API sends through (playwright.config.ts starts both); the
// steps read what arrived through `Mailbox`.
import { randomBytes } from 'node:crypto';

/** Where the mailbox listens on this computer: SMTP for the API, HTTP for the steps. */
export const mailboxPorts = { smtp: 2525, http: 2526 } as const;

/** An email as the mailbox took it. */
export interface DeliveredEmail {
  readonly to: string;
  readonly subject: string;
  /** The plain-text part. */
  readonly text: string;
}

/**
 * The emails of one scenario. Each address a step names ("ana@example.com") stands for an
 * address of the scenario's own, the same through the whole scenario: codes, send limits and
 * accounts go by email, so scenarios running at once, at each width, and the runs before them
 * on the same database would otherwise share them.
 */
export class Mailbox {
  readonly #own = new Map<string, string>();
  /** The email a step read last, for the steps that say "it" ("it contains the options"). */
  read: DeliveredEmail | undefined;

  /** The scenario's own address for the one a step names: what is typed, sent and shown. */
  addressOf(named: string): string {
    const known = this.#own.get(named);
    if (known) return known;
    const at = named.lastIndexOf('@');
    const own = `${named.slice(0, at)}.${randomBytes(4).toString('hex')}${named.slice(at)}`;
    this.#own.set(named, own);
    return own;
  }

  /** The scenario's own addresses so far, one for each address a step named. */
  get addresses(): string[] {
    return [...this.#own.values()];
  }

  /** The emails delivered so far to the address a step names, oldest first. */
  emailsTo(named: string): Promise<DeliveredEmail[]> {
    return this.emailsAt(this.addressOf(named));
  }

  /** The emails delivered so far to the scenario's own `address` (an event's organizer's). */
  async emailsAt(address: string): Promise<DeliveredEmail[]> {
    const to = encodeURIComponent(address);
    const answer = await fetch(`http://127.0.0.1:${mailboxPorts.http}/emails?to=${to}`);
    if (!answer.ok) throw new Error(`The test mailbox answered ${answer.status}`);
    return (await answer.json()) as DeliveredEmail[];
  }

  /**
   * The email server goes down for the scenario's addresses so far: emails to them are refused
   * with a temporary failure, while other scenarios' arrive. A step that needs a sign-in code
   * signs in before.
   */
  async goDown(): Promise<void> {
    await this.#setRefused('PUT');
  }

  /** The email server takes the scenario's emails again. */
  async comeBack(): Promise<void> {
    await this.#setRefused('DELETE');
  }

  async #setRefused(method: 'PUT' | 'DELETE'): Promise<void> {
    if (this.#own.size === 0) throw new Error('No step has named an address yet');
    for (const own of this.#own.values()) {
      const to = encodeURIComponent(own);
      const answer = await fetch(`http://127.0.0.1:${mailboxPorts.http}/refused?to=${to}`, {
        method,
      });
      if (!answer.ok) throw new Error(`The test mailbox answered ${answer.status}`);
    }
  }

  /** The sign-in codes emailed so far to the address a step names, oldest first. */
  async codesSentTo(named: string): Promise<string[]> {
    // Only the sign-in emails: the address also receives its events' emails, which another
    // scenario's run of the outbox may send at any moment.
    const signIns = (await this.emailsTo(named)).filter(({ subject }) =>
      subject.endsWith(' es tu código de qando'),
    );
    return signIns.map(({ text }) => {
      const code = /\b\d{6}\b/.exec(text)?.[0];
      if (!code) throw new Error(`An email to ${named} carries no 6-digit code`);
      return code;
    });
  }
}

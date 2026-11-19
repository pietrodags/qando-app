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

  /** The scenario's own address for the one a step names: what is typed, sent and shown. */
  addressOf(named: string): string {
    const known = this.#own.get(named);
    if (known) return known;
    const at = named.lastIndexOf('@');
    const own = `${named.slice(0, at)}.${randomBytes(4).toString('hex')}${named.slice(at)}`;
    this.#own.set(named, own);
    return own;
  }

  /** The emails delivered so far to the address a step names, oldest first. */
  async emailsTo(named: string): Promise<DeliveredEmail[]> {
    const to = encodeURIComponent(this.addressOf(named));
    const answer = await fetch(`http://127.0.0.1:${mailboxPorts.http}/emails?to=${to}`);
    if (!answer.ok) throw new Error(`The test mailbox answered ${answer.status}`);
    return (await answer.json()) as DeliveredEmail[];
  }

  /** The sign-in codes emailed so far to the address a step names, oldest first. */
  async codesSentTo(named: string): Promise<string[]> {
    return (await this.emailsTo(named)).map(({ text }) => {
      const code = /\b\d{6}\b/.exec(text)?.[0];
      if (!code) throw new Error(`An email to ${named} carries no 6-digit code`);
      return code;
    });
  }
}

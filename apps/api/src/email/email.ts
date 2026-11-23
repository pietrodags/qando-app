// Sending email: the `SendEmail` port and its SMTP implementation with Nodemailer, the same
// against Scaleway in production and a local SMTP sink in development and tests.
import nodemailer from 'nodemailer';

/** What an email says: rendered by its template, in plain text and HTML. */
export interface EmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** An email ready to go to one address. */
export interface OutgoingEmail extends EmailContent {
  readonly to: string;
  /**
   * The same each time this email is sent (after a failure, or again after the API stopped
   * mid-send), so mail clients take every copy for one message and some show it once. Without
   * it, each send is a new message.
   */
  readonly id?: string | undefined;
}

/**
 * Port: hands one email to the email server. Resolves once the server took it; rejects when it
 * refused it or could not be reached, with an error that may quote the address.
 */
export type SendEmail = (email: OutgoingEmail) => Promise<void>;

export interface SmtpSettings {
  readonly host: string;
  readonly port: number;
  /**
   * TLS required, with STARTTLS (Scaleway on 587). Off only for a local sink, whose certificate,
   * if it offers one, is not trusted: then nothing is encrypted.
   */
  readonly secure: boolean;
  /** Both or neither: a local sink takes mail without signing in. */
  readonly user?: string | undefined;
  readonly password?: string | undefined;
  /** The sender, e.g. `qando <no-reply@qando.app>`. */
  readonly from: string;
}

/** Waits that fit inside a request: Nodemailer's defaults reach two minutes. */
const connectionTimeoutMs = 10_000;
const socketTimeoutMs = 20_000;

/**
 * Sends through an SMTP server: one connection per email, as codes are sent one at a time. An
 * email's id becomes its Message-ID at the sender's domain.
 */
export function smtpEmail({ host, port, secure, user, password, from }: SmtpSettings): SendEmail {
  const senderDomain = from.slice(from.lastIndexOf('@') + 1).replace('>', '');
  const transport = nodemailer.createTransport({
    host,
    port,
    requireTLS: secure,
    ignoreTLS: !secure,
    ...(user !== undefined && password !== undefined && { auth: { user, pass: password } }),
    connectionTimeout: connectionTimeoutMs,
    greetingTimeout: connectionTimeoutMs,
    socketTimeout: socketTimeoutMs,
  });
  return async ({ to, subject, text, html, id }) => {
    await transport.sendMail({
      from,
      to,
      subject,
      text,
      html,
      ...(id !== undefined && { messageId: `<${id}@${senderDomain}>` }),
    });
  };
}

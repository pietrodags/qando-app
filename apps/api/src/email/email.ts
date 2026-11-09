// Sending email (ADR 0011): the `SendEmail` port and its SMTP implementation with Nodemailer, the
// same against Scaleway in production and a local SMTP sink in development and tests.
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
   * TLS required: implicit on port 465, STARTTLS on any other (Scaleway: 587). Off only for a
   * local sink, which has no certificate.
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

/** Sends through an SMTP server: one connection per email, as codes are sent one at a time. */
export function smtpEmail({ host, port, secure, user, password, from }: SmtpSettings): SendEmail {
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: secure && port === 465,
    requireTLS: secure,
    ignoreTLS: !secure,
    ...(user !== undefined && password !== undefined && { auth: { user, pass: password } }),
    connectionTimeout: connectionTimeoutMs,
    greetingTimeout: connectionTimeoutMs,
    socketTimeout: socketTimeoutMs,
  });
  return async ({ to, subject, text, html }) => {
    await transport.sendMail({ from, to, subject, text, html });
  };
}

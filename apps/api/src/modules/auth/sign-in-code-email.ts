import type { EmailContent } from '../../email/email.js';
import { renderEmail } from '../../email/render-email.js';

export interface SignInCodeEmailData {
  readonly code: string;
  /** The account's name; none for an email without an account yet, which is greeted without. */
  readonly name: string | undefined;
  /** qando's public address, which serves the logo (`https://qando.app`). */
  readonly siteUrl: string;
}

/**
 * The email that carries a sign-in code (owner, 2026-11-09), in the emails' shared frame
 * (2026-11-21): the code in the subject, readable in a phone notification, and in the body with
 * its expiry; the account's name when it has one. Only a stored name is written: a name sent by a
 * browser could put any text in an email qando signs and sends to someone else. Spanish only until
 * the en catalogue exists.
 */
export function signInCodeEmail({ code, name, siteUrl }: SignInCodeEmailData): EmailContent {
  return renderEmail({
    subject: `${code} es tu código de qando`,
    preview: 'Caduca en 10 minutos.',
    name,
    blocks: [
      { kind: 'lead', text: ['Tu código para entrar en ', { strong: 'qando' }, ' es:'] },
      { kind: 'code', code },
      { kind: 'paragraph', text: ['Caduca en 10 minutos.'] },
    ],
    footer: ['Si no lo has pedido tú, ignora este mensaje.'],
    siteUrl,
  });
}

/**
 * The email that carries the code that deletes an account (owner, 2026-11-24), in the same
 * frame: what the code deletes, the code and its expiry. The subject leaves the code out: it
 * names what the email is for, so a notification is never taken for a sign-in.
 */
export function deletionCodeEmail({ code, name, siteUrl }: SignInCodeEmailData): EmailContent {
  return renderEmail({
    subject: 'Tu código para eliminar tu cuenta de qando',
    preview: 'Caduca en 10 minutos.',
    name,
    blocks: [
      {
        kind: 'lead',
        text: [
          'Escribe este código en ',
          { strong: 'qando' },
          ' para eliminar tu cuenta y todos tus eventos.',
        ],
      },
      { kind: 'code', code },
      { kind: 'paragraph', text: ['Caduca en 10 minutos.'] },
    ],
    footer: ['Si no has sido tú, ignora este email: tu cuenta sigue como estaba.'],
    siteUrl,
  });
}

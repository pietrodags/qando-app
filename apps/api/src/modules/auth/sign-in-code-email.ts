import type { EmailContent } from '../../email/email.js';

export interface SignInCodeEmailData {
  readonly code: string;
  /** The account's name; none for an email without an account yet, which is greeted without. */
  readonly name: string | undefined;
  /** qando's public address, which serves the logo (`https://qando.app`). */
  readonly siteUrl: string;
}

/**
 * The email that carries a sign-in code (owner, 2026-11-09): the code in the subject, readable in
 * a phone notification, and in the body with its expiry; the logo, and the account's name when it
 * has one. Only a stored name is written: a name sent by a browser could put any text in an email
 * qando signs and sends to someone else. Spanish only until the en catalogue exists.
 */
export function signInCodeEmail({ code, name, siteUrl }: SignInCodeEmailData): EmailContent {
  const subject = `${code} es tu código de qando`;
  const trimmed = name?.trim();
  const greeting = (to: string) => (to ? `Hola, ${to}:` : 'Hola:');
  const logoUrl = new URL('/email/logo.png', siteUrl).href;
  const text = [
    greeting(trimmed ?? ''),
    '',
    `Tu código para entrar en qando es: ${code}`,
    '',
    'Caduca en 10 minutos.',
    '',
    'Si no lo has pedido tú, ignora este mensaje.',
    '',
  ].join('\n');
  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f3f3f3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f3;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;">
<tr><td style="padding:32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#555555;font-size:16px;line-height:1.5;">
<img src="${logoUrl}" width="120" alt="qando" style="display:block;width:120px;height:auto;margin:0 0 24px;border:0;">
<p style="margin:0 0 16px;">${escapeHtml(greeting(trimmed ?? ''))}</p>
<p style="margin:0 0 12px;">Tu código para entrar en qando es:</p>
<div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:#222222;background:#eefaf5;border-radius:8px;padding:14px 0;text-align:center;margin:0 0 16px;">${code}</div>
<p style="margin:0 0 16px;">Caduca en 10 minutos.</p>
<p style="margin:0;color:#666666;font-size:14px;">Si no lo has pedido tú, ignora este mensaje.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
  return { subject, text, html };
}

const htmlEntities: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => htmlEntities[character] ?? character);
}

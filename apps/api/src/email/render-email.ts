// Every email qando sends, in its shared frame: a grey page, a white card with the logo, a
// greeting, the email's own blocks and a quiet footer under a thin rule. An email is written once,
// as blocks: its HTML and its plain text are both rendered from them, so the two always say the
// same (a plain text that differs from the HTML reads as spam), and every value is escaped here.
import type { EmailContent } from './email.js';

/** A piece of a sentence: plain, or in bold. */
export type Inline = string | { readonly strong: string };

/** A sentence, in pieces. */
export type Line = readonly Inline[];

/** A part of an email's body, from top to bottom. */
export type EmailBlock =
  | { readonly kind: 'paragraph'; readonly text: Line }
  /** A paragraph that introduces the block after it, kept close to it. */
  | { readonly kind: 'lead'; readonly text: Line }
  /** Short labels as pills on a green box, `more` of them left out, and a line under the box. */
  | {
      readonly kind: 'pills';
      readonly labels: readonly string[];
      readonly more: number;
      readonly caption: string;
    }
  /** Someone's words, in italics between quotes. */
  | { readonly kind: 'quote'; readonly text: string }
  /** An address written in full, to copy or open, in a light green box. */
  | { readonly kind: 'link'; readonly url: string }
  /** A white button with a grey border, centred. */
  | { readonly kind: 'button'; readonly label: string; readonly url: string }
  /** A code to type, large and spaced out. */
  | { readonly kind: 'code'; readonly code: string };

export interface EmailParts {
  readonly subject: string;
  /** The line mail clients show after the subject in the inbox; hidden in the email itself. */
  readonly preview: string;
  /** Whom the greeting names; none, or only spaces, greets without a name. */
  readonly name: string | undefined;
  readonly blocks: readonly EmailBlock[];
  readonly footer: Line;
  /** qando's public address, which serves the logo (`https://qando.app`). */
  readonly siteUrl: string;
}

/**
 * The logo's file in the site, named after its content: mail clients keep a copy of each image by
 * its address, so a new image needs a new name, or new emails would show the old one.
 */
const logoPath = '/email/logo-c75530c8.png';

const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const colour = {
  page: '#f3f3f3',
  text: '#555555',
  strong: '#444444',
  muted: '#6c6c6c',
  rule: '#e6e6e6',
  green50: '#eefaf5',
  green100: '#cbf0e2',
  teal900: '#00695c',
  code: '#222222',
  border: '#cccccc',
};

/** The email's subject, HTML and plain text, from its parts. */
export function renderEmail({
  subject,
  preview,
  name,
  blocks,
  footer,
  siteUrl,
}: EmailParts): EmailContent {
  const trimmed = name?.trim();
  const greeting: EmailBlock = {
    kind: 'paragraph',
    text: [trimmed ? `Hola, ${trimmed}:` : 'Hola:'],
  };
  const all = [greeting, ...blocks];
  return { subject, html: html(), text: text() };

  function html(): string {
    const logoUrl = new URL(logoPath, siteUrl).href;
    const body = all.map((block, index) => blockHtml(block, gapUnder(index))).join('\n');
    return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${colour.page};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colour.page};">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;">
<tr><td style="padding:32px 28px 28px;font-family:${font};color:${colour.text};font-size:16px;line-height:1.5;">
<img src="${escapeHtml(logoUrl)}" width="56" alt="qando" style="display:block;width:56px;height:auto;margin:0 0 24px;border:0;">
${body}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;"><tr><td style="border-top:1px solid ${colour.rule};padding:16px 0 0;font-size:13px;line-height:1.5;color:${colour.muted};">${lineHtml(footer, '')}</td></tr></table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
  }

  /** The space under a block: none under the last; a lead keeps close to what it introduces. */
  function gapUnder(index: number): string {
    const next = all[index + 1];
    if (next === undefined) return '0';
    if (all[index]?.kind !== 'lead') return '20px';
    return next.kind === 'button' ? '14px' : next.kind === 'code' ? '12px' : '8px';
  }

  function text(): string {
    const parts = all.map((block, index) => {
      const next = all[index + 1];
      // A lead and a value on one line: "Comparte el enlace para votar: https://…".
      const joined = block.kind === 'lead' && (next?.kind === 'link' || next?.kind === 'code');
      return {
        text: blockText(block),
        after: joined ? ' ' : block.kind === 'lead' ? '\n' : '\n\n',
      };
    });
    const body = parts.map(({ text: part, after }) => part + after).join('');
    return `${body}--\n${lineText(footer)}\n`;
  }
}

/** A margin with `gap` under it only. */
const under = (gap: string) => (gap === '0' ? '0' : `0 0 ${gap}`);

function blockHtml(block: EmailBlock, gap: string): string {
  switch (block.kind) {
    case 'paragraph':
    case 'lead':
      return `<p style="margin:${under(gap)};">${lineHtml(block.text, `color:${colour.strong};`)}</p>`;
    case 'pills': {
      const pill = (label: string) =>
        `<span style="display:inline-block;margin:4px 3px;padding:7px 14px;background:#ffffff;border-radius:999px;color:${colour.teal900};font-size:14px;font-weight:600;white-space:nowrap;">${escapeHtml(label)}</span>`;
      const labels = block.more > 0 ? [...block.labels, `+ ${block.more}`] : block.labels;
      return `<div style="background:${colour.green100};border-radius:14px;padding:8px 6px;text-align:center;">${labels.map(pill).join('')}</div>
<p style="margin:6px 0 ${gap};text-align:center;font-size:13px;color:${colour.muted};">${escapeHtml(block.caption)}</p>`;
    }
    case 'quote':
      return `<p style="margin:${under(gap)};font-style:italic;">"${escapeHtml(block.text)}"</p>`;
    case 'link': {
      const url = escapeHtml(block.url);
      return `<div style="margin:${under(gap)};background:${colour.green50};border-radius:12px;padding:14px 16px;text-align:center;word-break:break-all;"><a href="${url}" style="color:${colour.teal900};font-weight:600;font-size:15px;text-decoration:none;">${url}</a></div>`;
    }
    case 'button':
      // The colour on the cell and the padding on the link: a button every mail client draws.
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto ${gap};"><tr><td align="center" bgcolor="#ffffff" style="border-radius:999px;border:1px solid ${colour.border};">
<a href="${escapeHtml(block.url)}" style="display:inline-block;padding:13px 30px;font-family:${font};font-size:16px;font-weight:600;color:${colour.strong};text-decoration:none;border-radius:999px;">${escapeHtml(block.label)}</a>
</td></tr></table>`;
    case 'code':
      return `<div style="margin:${under(gap)};font-family:ui-monospace,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:${colour.code};background:${colour.green50};border-radius:8px;padding:14px 0;text-align:center;">${escapeHtml(block.code)}</div>`;
  }
}

function blockText(block: EmailBlock): string {
  switch (block.kind) {
    case 'paragraph':
    case 'lead':
      return lineText(block.text);
    case 'pills':
      return [
        ...block.labels.map((label) => `- ${label}`),
        ...(block.more > 0 ? [`+ ${block.more}`] : []),
        block.caption,
      ].join('\n');
    case 'quote':
      return `"${block.text}"`;
    case 'link':
      return block.url;
    case 'button':
      return `${block.label}: ${block.url}`;
    case 'code':
      return block.code;
  }
}

/** A sentence in HTML, its bold pieces in `strongStyle`, if any. */
function lineHtml(line: Line, strongStyle: string): string {
  const open = strongStyle ? `<strong style="${strongStyle}">` : '<strong>';
  return line
    .map((piece) =>
      typeof piece === 'string' ? escapeHtml(piece) : `${open}${escapeHtml(piece.strong)}</strong>`,
    )
    .join('');
}

function lineText(line: Line): string {
  return line.map((piece) => (typeof piece === 'string' ? piece : piece.strong)).join('');
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

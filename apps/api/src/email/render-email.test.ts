import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderEmail, type EmailBlock, type EmailParts } from './render-email.js';

const siteUrl = 'https://qando.app';

/** The web's static files, served at the site's root (found by package, also from a copy of the API). */
const webPublic = new URL(
  'public/',
  pathToFileURL(createRequire(import.meta.url).resolve('@qando/web/package.json')),
);

function email(parts: Partial<EmailParts>) {
  return renderEmail({
    subject: 'Asunto',
    preview: 'Vista previa.',
    name: 'Ana',
    blocks: [{ kind: 'paragraph', text: ['Cuerpo.'] }],
    footer: ['Pie.'],
    siteUrl,
    ...parts,
  });
}

/** The address of the logo the email shows. */
function logoUrlOf(html: string): URL {
  const src = /<img src="([^"]+)"/.exec(html)?.[1];
  expect(src).toBeDefined();
  return new URL(src!);
}

/** The HTML between the greeting and the footer: one block per line or more. */
function bodyOf(html: string): string {
  const start = html.indexOf('</p>\n', html.indexOf('Hola')) + '</p>\n'.length;
  return html.slice(
    start,
    html.indexOf(
      '\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px',
    ),
  );
}

describe('renderEmail', () => {
  it('writes a Spanish page titled by the subject, its preview text hidden before anything else', () => {
    const { subject, html } = email({ subject: 'Resumen de tu evento: Cena' });

    expect(subject).toBe('Resumen de tu evento: Cena');
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<title>Resumen de tu evento: Cena</title>');
    expect(html).toContain(
      '<body style="margin:0;padding:0;background:#f3f3f3;">\n<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Vista previa.</div>\n',
    );
  });

  it('shows the logo served by the site, also from an address with a trailing slash', () => {
    for (const site of [siteUrl, `${siteUrl}/`]) {
      const { html } = email({ siteUrl: site });

      expect(logoUrlOf(html).href).toMatch(/^https:\/\/qando\.app\/email\/logo-[0-9a-f]{8}\.png$/);
      expect(html).toContain(
        '" width="56" alt="qando" style="display:block;width:56px;height:auto;margin:0 0 24px;border:0;">',
      );
    }
  });

  it('links a logo the site serves, named after its content, so a new image gets a new address', () => {
    // Mail clients keep a copy of each image by its address (Gmail's and Apple Mail's proxies):
    // an image changed in place would keep showing the old copy, in new emails too.
    const { pathname } = logoUrlOf(email({}).html);
    const image = readFileSync(new URL(`.${pathname}`, webPublic));
    const contentHash = createHash('sha256').update(image).digest('hex').slice(0, 8);

    expect(pathname).toBe(`/email/logo-${contentHash}.png`);
  });

  it('greets by the name trimmed', () => {
    const { text, html } = email({ name: '  Ana  ' });

    expect(text.split('\n')[0]).toBe('Hola, Ana:');
    expect(html).toContain('<p style="margin:0 0 20px;">Hola, Ana:</p>');
  });

  it.each([
    ['without a name', undefined],
    ['with an empty name', ''],
    ['with a name of only spaces', '   '],
  ])('greets without a name when written to someone %s', (_, name) => {
    const { text, html } = email({ name });

    expect(text.split('\n')[0]).toBe('Hola:');
    expect(html).toContain('>Hola:</p>');
  });

  it('writes the plain text from the same blocks as the HTML, so both say the same', () => {
    const { text } = email({
      blocks: [
        { kind: 'paragraph', text: ['Aquí tienes el resumen de ', { strong: 'Cena' }, '.'] },
        { kind: 'lead', text: ['Opciones:'] },
        { kind: 'pills', labels: ['Lun 6 Jul', 'Vie 10 Jul'], more: 3, caption: 'Hora de Madrid' },
        { kind: 'quote', text: 'Traed postre.' },
        { kind: 'lead', text: ['Comparte el enlace para votar:'] },
        { kind: 'link', url: 'https://qando.app/vote/abc' },
        { kind: 'lead', text: ['Tu código es:'] },
        { kind: 'code', code: '482915' },
        { kind: 'lead', text: ['Desde la gestión del evento:'] },
        { kind: 'button', label: 'Gestionar evento', url: 'https://qando.app/manage/abc' },
      ],
      footer: ['Recibes este correo en ', { strong: 'qando' }, '.'],
    });

    expect(text).toBe(
      [
        'Hola, Ana:',
        '',
        'Aquí tienes el resumen de Cena.',
        '',
        'Opciones:',
        '- Lun 6 Jul',
        '- Vie 10 Jul',
        '+ 3',
        'Hora de Madrid',
        '',
        '"Traed postre."',
        '',
        'Comparte el enlace para votar: https://qando.app/vote/abc',
        '',
        'Tu código es: 482915',
        '',
        'Desde la gestión del evento:',
        'Gestionar evento: https://qando.app/manage/abc',
        '',
        '--',
        'Recibes este correo en qando.',
        '',
      ].join('\n'),
    );
  });

  it('writes a lead that ends the body as any paragraph, with nothing to keep close to', () => {
    const { text, html } = email({ blocks: [{ kind: 'lead', text: ['Hasta pronto.'] }] });

    expect(text).toBe('Hola, Ana:\n\nHasta pronto.\n\n--\nPie.\n');
    expect(html).toContain('<p style="margin:0;">Hasta pronto.</p>');
  });

  it('lists every option without a "+" when none is left out', () => {
    const { text, html } = email({
      blocks: [{ kind: 'pills', labels: ['Lun 6 Jul'], more: 0, caption: 'Hora de Madrid' }],
    });

    expect(text).toContain('- Lun 6 Jul\nHora de Madrid\n');
    expect(html).not.toContain('+ ');
  });

  it('writes each block in HTML, a lead close to what it introduces and nothing under the last', () => {
    const pill = (label: string) =>
      `<span style="display:inline-block;margin:4px 3px;padding:7px 14px;background:#ffffff;border-radius:999px;color:#00695c;font-size:14px;font-weight:600;white-space:nowrap;">${label}</span>`;
    const blocks: EmailBlock[] = [
      { kind: 'paragraph', text: ['Aquí tienes el resumen de ', { strong: 'Cena' }, '.'] },
      { kind: 'lead', text: ['Opciones:'] },
      { kind: 'pills', labels: ['Lun 6 Jul', 'Vie 10 Jul'], more: 3, caption: 'Hora de Madrid' },
      { kind: 'quote', text: 'Traed postre.' },
      { kind: 'lead', text: ['Comparte el enlace para votar:'] },
      { kind: 'link', url: 'https://qando.app/vote/abc' },
      { kind: 'lead', text: ['Tu código es:'] },
      { kind: 'code', code: '482915' },
      { kind: 'lead', text: ['Desde la gestión del evento:'] },
      { kind: 'button', label: 'Gestionar evento', url: 'https://qando.app/manage/abc' },
    ];

    expect(bodyOf(email({ blocks }).html)).toBe(
      [
        '<p style="margin:0 0 20px;">Aquí tienes el resumen de <strong style="color:#444444;">Cena</strong>.</p>',
        '<p style="margin:0 0 8px;">Opciones:</p>',
        `<div style="background:#cbf0e2;border-radius:14px;padding:8px 6px;text-align:center;">${pill('Lun 6 Jul')}${pill('Vie 10 Jul')}${pill('+ 3')}</div>`,
        '<p style="margin:6px 0 20px;text-align:center;font-size:13px;color:#6c6c6c;">Hora de Madrid</p>',
        '<p style="margin:0 0 20px;font-style:italic;">"Traed postre."</p>',
        '<p style="margin:0 0 8px;">Comparte el enlace para votar:</p>',
        '<div style="margin:0 0 20px;background:#eefaf5;border-radius:12px;padding:14px 16px;text-align:center;word-break:break-all;"><a href="https://qando.app/vote/abc" style="color:#00695c;font-weight:600;font-size:15px;text-decoration:none;">https://qando.app/vote/abc</a></div>',
        '<p style="margin:0 0 12px;">Tu código es:</p>',
        '<div style="margin:0 0 20px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:#222222;background:#eefaf5;border-radius:8px;padding:14px 0;text-align:center;">482915</div>',
        '<p style="margin:0 0 14px;">Desde la gestión del evento:</p>',
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 0;"><tr><td align="center" bgcolor="#ffffff" style="border-radius:999px;border:1px solid #cccccc;">',
        `<a href="https://qando.app/manage/abc" style="display:inline-block;padding:13px 30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:#444444;text-decoration:none;border-radius:999px;">Gestionar evento</a>`,
        '</td></tr></table>',
      ].join('\n'),
    );
  });

  it.each<[string, EmailBlock, string]>([
    ['a paragraph', { kind: 'paragraph', text: ['Fin.'] }, '<p style="margin:0;">Fin.</p>'],
    ['a code', { kind: 'code', code: '1' }, '<div style="margin:0;font-family:'],
    ['a link', { kind: 'link', url: 'https://qando.app' }, '<div style="margin:0;background:'],
    ['a quote', { kind: 'quote', text: 'Fin.' }, '<p style="margin:0;font-style:italic;">'],
    [
      'options',
      { kind: 'pills', labels: ['Lun 6 Jul'], more: 0, caption: 'Hora de Madrid' },
      '<p style="margin:6px 0 0;text-align:center;',
    ],
  ])('leaves no space under %s when it is the last block', (_, block, expected) => {
    expect(
      bodyOf(email({ blocks: [{ kind: 'paragraph', text: ['Antes.'] }, block] }).html),
    ).toContain(expected);
  });

  it('writes the footer under a thin rule, quieter, its bold words in its own colour', () => {
    const { html } = email({ footer: ['Recibes este correo en ', { strong: 'qando' }, '.'] });

    expect(html).toContain(
      '\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;"><tr><td style="border-top:1px solid #e6e6e6;padding:16px 0 0;font-size:13px;line-height:1.5;color:#6c6c6c;">Recibes este correo en <strong>qando</strong>.</td></tr></table>\n</td></tr>\n</table>\n</td></tr>\n</table>\n</body>\n</html>\n',
    );
  });

  it('frames the body in a white card on a grey page, in the shared font and colour', () => {
    const { html } = email({});

    expect(html).toContain(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f3;">\n<tr><td align="center" style="padding:24px 16px;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;">\n<tr><td style="padding:32px 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#555555;font-size:16px;line-height:1.5;">\n<img src="`,
    );
    expect(html).toMatch(
      /^<!doctype html>\n<html lang="es">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>/,
    );
  });

  it('escapes every value in HTML, never in the plain text', () => {
    const odd = 'A <b>&</b> "B" O\'C';
    const { text, html } = email({
      subject: odd,
      preview: odd,
      name: odd,
      blocks: [
        { kind: 'paragraph', text: [odd, { strong: odd }] },
        { kind: 'pills', labels: [odd], more: 0, caption: odd },
        { kind: 'quote', text: odd },
        { kind: 'link', url: `https://qando.app/?a=1&b="2"` },
        { kind: 'button', label: odd, url: `https://qando.app/?a=1&b="2"` },
        { kind: 'code', code: odd },
      ],
      footer: [odd, { strong: odd }],
    });
    const escaped = 'A &lt;b&gt;&amp;&lt;/b&gt; &quot;B&quot; O&#39;C';

    expect(html).not.toContain('<b>');
    expect(html).toContain(`<title>${escaped}</title>`);
    expect(html).toContain(`mso-hide:all;">${escaped}</div>`);
    expect(html).toContain(`>Hola, ${escaped}:</p>`);
    expect(html).toContain(`${escaped}<strong style="color:#444444;">${escaped}</strong></p>`);
    expect(html).toContain(`white-space:nowrap;">${escaped}</span>`);
    expect(html).toContain(`color:#6c6c6c;">${escaped}</p>`);
    expect(html).toContain(`font-style:italic;">"${escaped}"</p>`);
    expect(html).toContain('href="https://qando.app/?a=1&amp;b=&quot;2&quot;"');
    expect(html).toContain(`text-decoration:none;">https://qando.app/?a=1&amp;b=&quot;2&quot;</a>`);
    expect(html).toContain(`border-radius:999px;">${escaped}</a>`);
    expect(html).toContain(`text-align:center;">${escaped}</div>`);
    expect(html).toContain(`color:#6c6c6c;">${escaped}<strong>${escaped}</strong></td>`);
    expect(text).toContain(`Hola, ${odd}:\n\n${odd}${odd}\n`);
    expect(text).toContain(`\n${odd}: https://qando.app/?a=1&b="2"\n`);
    expect(text).toContain(`\n--\n${odd}${odd}\n`);
  });
});

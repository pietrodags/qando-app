import { describe, expect, it } from 'vitest';
import { signInCodeEmail } from './sign-in-code-email.js';

const siteUrl = 'https://qando.app';

describe('signInCodeEmail', () => {
  it('puts the code in the subject, readable in a phone notification', () => {
    const email = signInCodeEmail({ code: '482915', name: 'Ana', siteUrl });

    expect(email.subject).toBe('482915 es tu código de qando');
  });

  it('writes the plain text: greeting, code, expiry and what to do if not asked for', () => {
    const email = signInCodeEmail({ code: '482915', name: 'Ana', siteUrl });

    expect(email.text).toBe(
      [
        'Hola, Ana:',
        '',
        'Tu código para entrar en qando es: 482915',
        '',
        'Caduca en 10 minutos.',
        '',
        'Si no lo has pedido tú, ignora este mensaje.',
        '',
      ].join('\n'),
    );
  });

  it('writes the same in HTML, in Spanish, with the logo served by the site', () => {
    const { html } = signInCodeEmail({ code: '482915', name: 'Ana', siteUrl });

    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<title>482915 es tu código de qando</title>');
    expect(html).toContain('<img src="https://qando.app/email/logo.png" width="120" alt="qando"');
    expect(html).toContain('>Hola, Ana:</p>');
    expect(html).toContain('>Tu código para entrar en qando es:</p>');
    expect(html).toContain('>482915</div>');
    expect(html).toContain('>Caduca en 10 minutos.</p>');
    expect(html).toContain('>Si no lo has pedido tú, ignora este mensaje.</p>');
  });

  it('builds the logo’s address from a site address with a trailing slash too', () => {
    const { html } = signInCodeEmail({ code: '482915', name: 'Ana', siteUrl: `${siteUrl}/` });

    expect(html).toContain('src="https://qando.app/email/logo.png"');
  });

  it.each([
    ['an email without an account', undefined],
    ['an account without a name', ''],
    ['an account whose name is only spaces', '   '],
  ])('greets %s without a name', (_, name) => {
    const email = signInCodeEmail({ code: '482915', name, siteUrl });

    expect(email.text.split('\n')[0]).toBe('Hola:');
    expect(email.html).toContain('>Hola:</p>');
  });

  it('greets by the name trimmed', () => {
    const email = signInCodeEmail({ code: '482915', name: '  Ana  ', siteUrl });

    expect(email.text.split('\n')[0]).toBe('Hola, Ana:');
  });

  it('escapes the name in HTML, never in the plain text', () => {
    const email = signInCodeEmail({ code: '482915', name: 'Ana <b>&</b> "Luis" O\'Neil', siteUrl });

    expect(email.html).toContain(
      '>Hola, Ana &lt;b&gt;&amp;&lt;/b&gt; &quot;Luis&quot; O&#39;Neil:</p>',
    );
    expect(email.html).not.toContain('<b>');
    expect(email.text.split('\n')[0]).toBe('Hola, Ana <b>&</b> "Luis" O\'Neil:');
  });
});

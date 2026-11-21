import { describe, expect, it } from 'vitest';
import { signInCodeEmail } from './sign-in-code-email.js';

const siteUrl = 'https://qando.app';

describe('signInCodeEmail', () => {
  it('puts the code in the subject, readable in a phone notification', () => {
    const email = signInCodeEmail({ code: '482915', name: 'Ana', siteUrl });

    expect(email.subject).toBe('482915 es tu código de qando');
  });

  it('writes the plain text: greeting, code, expiry and, as its footer, what to do if not asked for', () => {
    const email = signInCodeEmail({ code: '482915', name: 'Ana', siteUrl });

    expect(email.text).toBe(
      [
        'Hola, Ana:',
        '',
        'Tu código para entrar en qando es: 482915',
        '',
        'Caduca en 10 minutos.',
        '',
        '--',
        'Si no lo has pedido tú, ignora este mensaje.',
        '',
      ].join('\n'),
    );
  });

  it('writes the same in HTML, "qando" in bold, the expiry as its preview text', () => {
    const { html } = signInCodeEmail({ code: '482915', name: 'Ana', siteUrl });

    expect(html).toContain('<title>482915 es tu código de qando</title>');
    expect(html).toContain('mso-hide:all;">Caduca en 10 minutos.</div>');
    expect(html).toContain('>Hola, Ana:</p>');
    expect(html).toContain(
      '>Tu código para entrar en <strong style="color:#444444;">qando</strong> es:</p>',
    );
    expect(html).toContain('letter-spacing:8px;');
    expect(html).toContain('>482915</div>');
    expect(html).toContain('<p style="margin:0;">Caduca en 10 minutos.</p>');
    expect(html).toContain('color:#6c6c6c;">Si no lo has pedido tú, ignora este mensaje.</td>');
    expect(html).toMatch(/<img src="https:\/\/qando\.app\/email\/logo-[0-9a-f]{8}\.png"/);
  });

  it.each([
    ['an email without an account', undefined],
    ['an account without a name', ''],
  ])('greets %s without a name', (_, name) => {
    const email = signInCodeEmail({ code: '482915', name, siteUrl });

    expect(email.text.split('\n')[0]).toBe('Hola:');
    expect(email.html).toContain('>Hola:</p>');
  });

  it('escapes the name in HTML, never in the plain text', () => {
    const email = signInCodeEmail({ code: '482915', name: 'Ana <b>&</b>', siteUrl });

    expect(email.html).toContain('>Hola, Ana &lt;b&gt;&amp;&lt;/b&gt;:</p>');
    expect(email.text.split('\n')[0]).toBe('Hola, Ana <b>&</b>:');
  });
});

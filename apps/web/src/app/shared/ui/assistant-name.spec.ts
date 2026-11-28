import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import type { ConnectingApplication } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { AssistantName } from './assistant-name';
import nameStyles from './assistant-name.scss' with { loader: 'text' };

describe('AssistantName', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AssistantName], providers: [provideI18n()] });
  });

  async function render(application: ConnectingApplication, key?: string): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(AssistantName);
    fixture.componentRef.setInput('application', application);
    if (key !== undefined) fixture.componentRef.setInput('key', key);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function text(found: Node | null | undefined): string {
    return (found?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  /** The logos shown, by the assistant each draws. */
  function logos(host: HTMLElement): string[] {
    return [...host.querySelectorAll('svg')].map((logo) => logo.getAttribute('class') ?? '');
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(nameStyles)).toEqual([]);
  });

  it("shows Claude's logo, then the name, for Claude", async () => {
    const host = await render({ name: 'Claude', host: 'claude.ai' });

    expect(logos(host)).toEqual(['logo claude']);
    expect(text(host)).toBe('Claude');
    const named = host.querySelector('.named')!;
    expect(named.firstElementChild?.tagName).toBe('svg');
    expect(text(named.lastChild)).toBe('Claude');
  });

  it("shows Claude Code's logo for Claude Code, published at claude.ai too", async () => {
    const host = await render({ name: 'Claude Code', host: 'claude.ai' });

    expect(logos(host)).toEqual(['logo claude-code']);
    expect(text(host)).toBe('Claude Code');
  });

  it("shows Claude's logo for any other application published at claude.ai", async () => {
    const host = await render({ name: 'Claude for Chrome', host: 'claude.ai' });

    expect(logos(host)).toEqual(['logo claude']);
  });

  it("shows ChatGPT's logo for ChatGPT, published at chatgpt.com", async () => {
    const host = await render({ name: 'ChatGPT', host: 'chatgpt.com' });

    expect(logos(host)).toEqual(['logo chatgpt']);
    expect(text(host)).toBe('ChatGPT');
  });

  it.each([
    { name: 'Claude', host: 'claude.ai.example' },
    { name: 'Claude Code', host: 'example.com' },
    { name: 'ChatGPT', host: 'chatgpt.com.example' },
    { name: 'Cursor', host: 'cursor.com' },
  ])(
    'shows no logo for $name published at $host: the name an application gives itself proves nothing',
    async (application) => {
      const host = await render(application);

      expect(logos(host)).toEqual([]);
      expect(text(host)).toBe(application.name);
    },
  );

  it('hides the logo from screen readers, which read the name alone', async () => {
    const host = await render({ name: 'Claude', host: 'claude.ai' });
    const logo = host.querySelector('svg')!;

    expect(logo.getAttribute('aria-hidden')).toBe('true');
    expect(logo.getAttribute('focusable')).toBe('false');
    expect(logo.querySelector('title')).toBeNull();
  });

  it('shows the name an application gives itself as plain text, never as markup', async () => {
    const host = await render({ name: '<b>Claude</b>', host: 'claude.ai' });

    expect(host.querySelector('b')).toBeNull();
    expect(text(host)).toBe('<b>Claude</b>');
  });

  it('puts the logo and the name where a sentence of the catalogue names the application', async () => {
    const host = await render({ name: 'Claude', host: 'claude.ai' }, 'connect.title');

    expect(text(host)).toBe('Conectar Claude con qando');
    const named = host.querySelector('.named')!;
    expect(text(named)).toBe('Claude');
    expect(named.previousSibling?.textContent).toBe('Conectar ');
    expect(named.nextSibling?.textContent).toBe(' con qando');
    expect(logos(host)).toEqual(['logo claude']);
  });

  it('puts the name alone where a sentence names an application it has no logo for', async () => {
    const host = await render({ name: 'Cursor', host: 'cursor.com' }, 'connect.handed.title');

    expect(text(host)).toBe('Vuelve a Cursor');
    expect(logos(host)).toEqual([]);
  });

  it('puts the name alone where a sentence names the application again', async () => {
    TestBed.inject(TranslocoService).setTranslationKey('test.twice', 'Abre {app} y vuelve a {app}');
    const host = await render({ name: 'Claude', host: 'claude.ai' }, 'test.twice');

    expect(text(host)).toBe('Abre Claude y vuelve a Claude');
    expect(text(host.querySelector('.named'))).toBe('Claude');
    expect(host.querySelector('.named')?.nextSibling?.textContent).toBe(' y vuelve a Claude');
    expect(logos(host)).toEqual(['logo claude']);
  });

  it('names the application again by its name as it is, dollar signs and all', async () => {
    TestBed.inject(TranslocoService).setTranslationKey('test.twice', 'Abre {app} y vuelve a {app}');
    const host = await render({ name: "A$$B $& $'", host: 'claude.ai' }, 'test.twice');

    expect(text(host)).toBe("Abre A$$B $& $' y vuelve a A$$B $& $'");
  });

  it('keeps the words of a sentence that does not name the application, the name after them', async () => {
    const host = await render({ name: 'Claude', host: 'claude.ai' }, 'connect.cancel');

    expect(host.querySelector('.named')?.previousSibling?.textContent).toBe('Cancelar ');
    expect(text(host)).toBe('Cancelar Claude');
    expect(logos(host)).toEqual(['logo claude']);
  });

  it('fills no other words of the sentence with what the application calls itself', async () => {
    const host = await render({ name: '{app}', host: 'claude.ai' }, 'connect.handed.open');

    expect(text(host)).toBe('Abrir {app}');
  });
});

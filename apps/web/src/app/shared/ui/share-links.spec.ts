import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { ShareLinks } from './share-links';
import shareStyles from './share-links.scss' with { loader: 'text' };
import { Toaster } from './toast';

const url = 'https://qando.app/results/Qw7p2';
const text = "Ya tenemos fecha para L'Antic: viernes 10 de julio";

describe('ShareLinks', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ShareLinks], providers: [provideI18n()] });
  });

  afterEach(() => {
    for (const name of ['share', 'canShare', 'clipboard'] as const) {
      Reflect.deleteProperty(navigator, name);
    }
  });

  async function render(): Promise<ComponentFixture<ShareLinks>> {
    const fixture = TestBed.createComponent(ShareLinks);
    fixture.componentRef.setInput('title', "L'Antic");
    fixture.componentRef.setInput('text', text);
    fixture.componentRef.setInput('url', url);
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<ShareLinks>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function link(fixture: ComponentFixture<ShareLinks>, title: string): HTMLAnchorElement {
    const found = element(fixture).querySelector<HTMLAnchorElement>(`a[title="${title}"]`);
    if (found === null) throw new Error(`No link ${title}`);
    return found;
  }

  function button(fixture: ComponentFixture<ShareLinks>, name: string): HTMLButtonElement {
    const found = Array.from(element(fixture).querySelectorAll('button')).find(
      (candidate) => (candidate.getAttribute('title') ?? candidate.textContent.trim()) === name,
    );
    if (found === undefined) throw new Error(`No button ${name}`);
    return found;
  }

  function toast(): string | null {
    return TestBed.inject(Toaster).message();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(shareStyles)).toEqual([]);
  });

  it('opens WhatsApp in a new tab with the text and the link, the text as typed', async () => {
    const whatsapp = link(await render(), 'WhatsApp');

    expect(whatsapp.getAttribute('href')).toBe(
      `https://wa.me/?text=${encodeURIComponent(`${text}\n\n${url}`)}`,
    );
    expect(whatsapp.target).toBe('_blank');
    expect(whatsapp.rel).toBe('noopener');
    expect(whatsapp.getAttribute('aria-label')).toBe('WhatsApp');
  });

  it('opens Telegram in a new tab with the link and the text', async () => {
    const telegram = link(await render(), 'Telegram');

    expect(telegram.getAttribute('href')).toBe(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    );
    expect(telegram.target).toBe('_blank');
  });

  it('writes an email with the title as subject, in the same tab', async () => {
    const email = link(await render(), 'Email');

    expect(email.getAttribute('href')).toBe(
      `mailto:?subject=${encodeURIComponent("L'Antic")}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
    );
    expect(email.target).toBe('');
  });

  it('copies the link and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fixture = await render();

    button(fixture, 'Copiar enlace').click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(url);
    expect(toast()).toBe('Enlace copiado');
  });

  it('says nothing when the browser refuses to copy', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fixture = await render();

    button(fixture, 'Copiar enlace').click();
    await fixture.whenStable();

    expect(toast()).toBeNull();
  });

  it("opens the device's share sheet with the title, the text and the link", async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const fixture = await render();

    button(fixture, 'Compartir').click();
    await fixture.whenStable();

    expect(share).toHaveBeenCalledWith({ title: "L'Antic", text, url });
    expect(toast()).toBeNull();
  });

  it('opens the share sheet on a browser that cannot check the data first', async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const fixture = await render();

    button(fixture, 'Compartir').click();
    await fixture.whenStable();

    expect(share).toHaveBeenCalledWith({ title: "L'Antic", text, url });
    expect(toast()).toBeNull();
  });

  it('says nothing when the share sheet is closed or fails', async () => {
    const share = vi.fn(() => Promise.reject(new DOMException('Cancelled', 'AbortError')));
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const fixture = await render();

    button(fixture, 'Compartir').click();
    await fixture.whenStable();

    expect(toast()).toBeNull();
  });

  it('points to the buttons below when the device has no share sheet', async () => {
    const fixture = await render();

    button(fixture, 'Compartir').click();
    await fixture.whenStable();

    expect(toast()).toBe('Usa los botones de abajo para compartir');
  });

  it('points to the buttons below when the device cannot share these data', async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const fixture = await render();

    button(fixture, 'Compartir').click();
    await fixture.whenStable();

    expect(share).not.toHaveBeenCalled();
    expect(toast()).toBe('Usa los botones de abajo para compartir');
  });
});

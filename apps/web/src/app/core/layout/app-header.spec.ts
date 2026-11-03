import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { literalValues } from '../../../styles/token-usage';
import { provideI18n } from '../i18n/provide-i18n';
import { AppHeader } from './app-header';
import headerStyles from './app-header.scss' with { loader: 'text' };

describe('AppHeader', () => {
  async function render(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [AppHeader],
      providers: [provideI18n(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(AppHeader);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(headerStyles)).toEqual([]);
  });

  it('is the page banner', async () => {
    const element = await render();

    expect(element.querySelector('header')).not.toBeNull();
  });

  it('links the qando logo to the home page', async () => {
    const element = await render();

    const logo = element.querySelector<HTMLImageElement>('header a img');
    expect(logo?.alt).toBe('qando');
    expect(logo?.closest('a')?.getAttribute('href')).toBe('/');
  });

  it('offers to sign in', async () => {
    const element = await render();

    const signIn = element.querySelector('header a[aria-label="Entrar"]');
    expect(signIn?.getAttribute('href')).toBe('/sign-in');
  });

  it('shows sign-in as an icon, hidden from screen readers behind the link name', async () => {
    const element = await render();

    const signIn = element.querySelector('header a[aria-label="Entrar"]');
    expect(signIn?.textContent.trim()).toBe('');
    expect(signIn?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

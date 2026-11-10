import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { literalValues } from '../../../styles/token-usage';
import { provideI18n } from '../i18n/provide-i18n';
import { AppHeader } from './app-header';
import headerStyles from './app-header.scss' with { loader: 'text' };

@Component({ template: '' })
class Blank {}

describe('AppHeader', () => {
  async function render(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [AppHeader],
      providers: [provideI18n(), provideRouter([{ path: '**', component: Blank }])],
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

  it('loads the logo first, with its size reserved so the page does not shift', async () => {
    const element = await render();

    const logo = element.querySelector<HTMLImageElement>('header a img');
    expect(logo?.getAttribute('src')).toBe('/logo.svg');
    expect(logo?.getAttribute('fetchpriority')).toBe('high');
    expect(logo?.getAttribute('loading')).toBe('eager');
    expect(logo?.getAttribute('width')).toBe('1116');
    expect(logo?.getAttribute('height')).toBe('304');
  });

  it('offers to sign in', async () => {
    const element = await render();

    const signIn = element.querySelector('header a[aria-label="Entrar"]');
    expect(signIn?.getAttribute('href')).toBe('/sign-in');
  });

  it('asks the sign-in page to come back to the page it is pressed on', async () => {
    const element = await render();
    const signIn = (): string | null | undefined =>
      element.querySelector('header a[aria-label="Entrar"]')?.getAttribute('href');

    await RouterTestingHarness.create('/vote/k3Jd9?x=1');
    expect(signIn()).toBe('/sign-in?returnTo=%2Fvote%2Fk3Jd9%3Fx%3D1');

    await TestBed.inject(Router).navigateByUrl('/results/Qw7p2');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(signIn()).toBe('/sign-in?returnTo=%2Fresults%2FQw7p2');

    // On the sign-in page itself: what it was asked, kept.
    await TestBed.inject(Router).navigateByUrl('/sign-in?returnTo=%2Fresults%2FQw7p2');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(signIn()).toBe('/sign-in?returnTo=%2Fresults%2FQw7p2');

    await TestBed.inject(Router).navigateByUrl('/');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(signIn()).toBe('/sign-in');
  });

  it('shows sign-in as an icon, hidden from screen readers behind the link name', async () => {
    const element = await render();

    const signIn = element.querySelector('header a[aria-label="Entrar"]');
    expect(signIn?.textContent.trim()).toBe('');
    expect(signIn?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

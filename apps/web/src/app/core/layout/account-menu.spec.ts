import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { literalValues } from '../../../styles/token-usage';
import { Toaster } from '../../shared/ui/toast';
import { ManagementTokens } from '../auth/management-tokens';
import { Session } from '../auth/session';
import { provideI18n } from '../i18n/provide-i18n';
import { AccountMenu } from './account-menu';
import menuStyles from './account-menu.scss' with { loader: 'text' };

@Component({ template: '' })
class Blank {}

const ana = { name: 'Ana', email: 'ana@example.com' };
const signOutRequest = { method: 'POST', url: '/api/auth/sign-out' };

/** Lets a settled request's promise chain run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('AccountMenu', () => {
  let fixture: ComponentFixture<AccountMenu> | undefined;
  let httpTesting: HttpTestingController;
  let outside: HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccountMenu],
      providers: [
        provideI18n(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', component: Blank }]),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    outside = document.createElement('button');
    document.body.append(outside);
  });

  afterEach(() => {
    httpTesting.verify();
    (fixture?.nativeElement as HTMLElement | undefined)?.remove();
    fixture = undefined;
    outside.remove();
    localStorage.clear();
  });

  /** The menu of the account the app found signed in when it started, on "Mis eventos". */
  async function render(account = ana): Promise<void> {
    TestBed.inject(Session);
    httpTesting.expectOne('/api/auth/session').flush(account);
    await TestBed.inject(Router).navigateByUrl('/my-events');
    fixture = TestBed.createComponent(AccountMenu);
    fixture.componentRef.setInput('account', account);
    document.body.append(element());
    await stable();
  }

  function element(): HTMLElement {
    return fixture!.nativeElement as HTMLElement;
  }

  function stable(): Promise<unknown> {
    return fixture!.whenStable();
  }

  function toggle(): HTMLButtonElement {
    return element().querySelector<HTMLButtonElement>('button[aria-expanded]')!;
  }

  function menu(): HTMLElement | null {
    return element().querySelector<HTMLElement>('.menu');
  }

  function item(name: string): HTMLElement {
    return Array.from(menu()!.querySelectorAll<HTMLElement>('a, button')).find(
      (candidate) => candidate.textContent.trim() === name,
    )!;
  }

  async function open(): Promise<void> {
    toggle().click();
    await stable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(menuStyles)).toEqual([]);
  });

  it('shows the initial of the account’s name on a button named after it, the menu closed', async () => {
    await render();

    expect(toggle().textContent.trim()).toBe('A');
    expect(toggle().getAttribute('aria-label')).toBe('Cuenta de Ana');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(menu()).toBeNull();
  });

  it.each([
    ['in capitals, whatever the name’s', { name: 'ángel', email: 'angel@example.com' }, 'Á'],
    ['past the spaces before the name', { name: '  bea', email: 'x@example.com' }, 'B'],
    ['whole, when it is more than one code unit', { name: '😀 Ana', email: 'x@example.com' }, '😀'],
  ])('shows the initial %s', async (_name, account, initial) => {
    await render(account);

    expect(toggle().textContent.trim()).toBe(initial);
  });

  it.each([
    ['', 'Z'],
    ['   ', 'Z'],
  ])('shows the email’s first letter for an account without a name (%j)', async (name, initial) => {
    await render({ name, email: 'zoe@example.com' });

    expect(toggle().textContent.trim()).toBe(initial);
    expect(toggle().getAttribute('aria-label')).toBe('Cuenta de zoe@example.com');
  });

  it('opens under its button with the email, "Mis eventos" and "Cerrar sesión"', async () => {
    await render();

    await open();

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-controls')).toBe(menu()!.id);
    expect(menu()!.querySelector('.email')?.textContent.trim()).toBe('ana@example.com');
    expect(
      Array.from(menu()!.querySelectorAll('a, button'), (each) => each.textContent.trim()),
    ).toEqual(['Mis eventos', 'Cerrar sesión']);
    expect(item('Mis eventos').getAttribute('href')).toBe('/my-events');
    expect(item('Cerrar sesión').getAttribute('type')).toBe('button');
  });

  it('closes when its button is pressed again', async () => {
    await render();
    await open();

    await open();

    expect(menu()).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes with Escape, the focus back on its button', async () => {
    await render();
    await open();
    item('Cerrar sesión').focus();

    item('Cerrar sesión').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await stable();

    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  it('leaves the focus where it is when Escape is pressed with the menu closed', async () => {
    await render();
    outside.focus();

    toggle().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await stable();

    expect(document.activeElement).toBe(outside);
  });

  it('closes with a press outside it, and stays open with one on its email', async () => {
    await render();
    await open();

    menu()!.querySelector<HTMLElement>('.email')!.click();
    await stable();
    expect(menu()).not.toBeNull();

    outside.click();
    await stable();
    expect(menu()).toBeNull();
  });

  it('closes when the focus moves out of it, and stays open while it moves inside', async () => {
    await render();
    await open();

    item('Mis eventos').focus();
    await stable();
    expect(menu()).not.toBeNull();

    outside.focus();
    await stable();
    expect(menu()).toBeNull();
  });

  it('closes once "Mis eventos" is chosen', async () => {
    await render();
    await open();

    item('Mis eventos').click();
    await stable();

    expect(menu()).toBeNull();
  });

  describe('"Cerrar sesión"', () => {
    it('signs out, opens the home page and says "Has cerrado sesión."', async () => {
      await render();
      TestBed.inject(ManagementTokens).keep('k3Jd9', 'token-of-cena');
      await open();

      item('Cerrar sesión').click();
      await stable();
      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(toggle());
      // Nothing is said before the server has ended the session.
      expect(TestBed.inject(Toaster).message()).toBeNull();
      httpTesting.expectOne(signOutRequest).flush({ signedOut: true });
      await settle();

      expect(TestBed.inject(Session).account()).toBeNull();
      expect(TestBed.inject(ManagementTokens).of('k3Jd9')).toBeNull();
      expect(TestBed.inject(Router).url).toBe('/');
      expect(TestBed.inject(Toaster).message()).toBe('Has cerrado sesión.');
    });

    it('says so and stays on the page, still signed in, when the server could not sign out', async () => {
      await render();
      await open();

      item('Cerrar sesión').click();
      httpTesting
        .expectOne(signOutRequest)
        .flush(
          { error: { code: 'INTERNAL_ERROR', message: 'Unexpected', details: [] } },
          { status: 500, statusText: 'Server Error' },
        );
      await settle();

      expect(TestBed.inject(Toaster).message()).toBe(
        'No se ha podido cerrar sesión. Inténtalo de nuevo.',
      );
      expect(TestBed.inject(Router).url).toBe('/my-events');
      expect(TestBed.inject(Session).account()).toEqual(ana);
    });
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { ConnectedApplication } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { Toaster } from '../../shared/ui/toast';
import { literalValues } from '../../../styles/token-usage';
import { ConnectedAppsPage } from './connected-apps-page';
import pageStyles from './connected-apps-page.scss' with { loader: 'text' };
import addressStyles from './connector-address.scss' with { loader: 'text' };

@Component({ template: '' })
class Elsewhere {}

const claude: ConnectedApplication = {
  id: 'Yk3s9QzX2b7Lm4Np8Rt1Vw6Hc5Jd0Fa2',
  name: 'Claude',
  host: 'claude.ai',
  // Midday: the same day in any time zone the tests may run in.
  connectedAt: '2026-11-24T12:00:00.000Z',
};
const chatgpt: ConnectedApplication = {
  id: 'Pq8r2StU4vW6xY8zA0bC2dE4fG6hI8jK',
  name: 'ChatGPT',
  host: 'chatgpt.com',
  connectedAt: '2026-11-20T12:00:00.000Z',
};

/** Lets a settled request's promise chain reach the page. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

const unauthenticated = {
  body: { error: { code: 'UNAUTHENTICATED', message: 'No session', details: [] } },
  answer: { status: 401, statusText: 'Unauthorized' },
};

describe('ConnectedAppsPage', () => {
  let httpTesting: HttpTestingController;
  let fixture: ComponentFixture<ConnectedAppsPage>;
  /** What the tests put in the page, taken away after each. */
  let appended: HTMLElement[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ConnectedAppsPage],
      providers: [
        provideI18n(),
        provideRouter([
          { path: 'sign-in', component: Elsewhere },
          { path: '', component: Elsewhere },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    appended = [];
  });

  afterEach(() => {
    // The session the app asks for when it starts, as every page's header does.
    for (const request of httpTesting.match('/api/auth/session')) request.flush(null);
    httpTesting.verify();
    Reflect.deleteProperty(navigator, 'clipboard');
    for (const element of appended) element.remove();
  });

  function render(): void {
    fixture = TestBed.createComponent(ConnectedAppsPage);
    // In the page: the focus is followed.
    const element = fixture.nativeElement as HTMLElement;
    document.body.append(element);
    appended.push(element);
    TestBed.tick();
  }

  async function listed(applications: ConnectedApplication[]): Promise<void> {
    render();
    httpTesting.expectOne('/api/me/connected-apps').flush(applications);
    await fixture.whenStable();
  }

  function page(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(element: Element | null | undefined): string {
    return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function rows(): HTMLElement[] {
    return [...page().querySelectorAll<HTMLElement>('.list li')];
  }

  function row(name: string): HTMLElement {
    const found = rows().find((each) => text(each.querySelector('.title')) === name);
    if (!found) throw new Error(`No row for ${name}`);
    return found;
  }

  function button(within: HTMLElement, name: string): HTMLButtonElement {
    const found = [...within.querySelectorAll<HTMLButtonElement>('button')].find(
      (each) => text(each) === name,
    );
    if (!found) throw new Error(`No button ${name}`);
    return found;
  }

  async function press(target: HTMLElement): Promise<void> {
    target.click();
    await fixture.whenStable();
  }

  /** "Desconectar" on the row of `name`, then "Sí": the page asks the API. */
  async function disconnect(name: string): Promise<void> {
    await press(button(row(name), 'Desconectar'));
    await press(button(row(name), 'Sí'));
  }

  function disconnection(id: string) {
    const request = httpTesting.expectOne(`/api/me/connected-apps/${id}`);
    expect(request.request.method).toBe('DELETE');
    return request;
  }

  it('takes every value of its styles from the design tokens', () => {
    expect(literalValues(pageStyles)).toEqual([]);
    expect(literalValues(addressStyles)).toEqual([]);
  });

  it('says it is loading while the list is on its way', () => {
    render();
    expect(page().querySelector('app-loading-state')).not.toBeNull();
    expect(rows()).toEqual([]);
    httpTesting.expectOne('/api/me/connected-apps').flush([]);
  });

  it('heads the card with "Apps conectadas" and says what the applications can do', async () => {
    await listed([claude]);

    expect(text(page().querySelector('h1'))).toBe('Apps conectadas');
    expect(text(page().querySelector('.lead'))).toBe(
      'Asistentes de IA que pueden ver y gestionar tus eventos por ti.',
    );
  });

  it('lists the applications in the order the API gives them, the newest connection first', async () => {
    await listed([claude, chatgpt]);

    expect(rows().map((each) => text(each.querySelector('.title')))).toEqual(['Claude', 'ChatGPT']);
  });

  it('shows each assistant’s logo before its name', async () => {
    const other = {
      ...claude,
      id: 'Zz9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k',
      name: 'Cursor',
      host: 'cursor.com',
    };
    await listed([claude, chatgpt, other]);

    const logos = (name: string) =>
      [...row(name).querySelectorAll('.title svg')].map((logo) => logo.getAttribute('class'));
    expect(logos('Claude')).toEqual(['logo claude']);
    expect(logos('ChatGPT')).toEqual(['logo chatgpt']);
    expect(logos('Cursor')).toEqual([]);
  });

  it('gives each its host and the day it was connected, the year kept with its "de"', async () => {
    await listed([claude, chatgpt]);

    expect(row('Claude').querySelector('.state')?.textContent.trim()).toBe(
      'claude.ai · Conectada el 24 de noviembre de 2026',
    );
    expect(text(row('ChatGPT').querySelector('.state'))).toBe(
      'chatgpt.com · Conectada el 20 de noviembre de 2026',
    );
  });

  it('names each "Desconectar" with its application, for screen readers', async () => {
    await listed([claude, chatgpt]);

    expect(button(row('Claude'), 'Desconectar').getAttribute('aria-label')).toBe(
      'Desconectar Claude',
    );
    expect(button(row('ChatGPT'), 'Desconectar').getAttribute('aria-label')).toBe(
      'Desconectar ChatGPT',
    );
  });

  it('asks before it disconnects, in the button’s place, and "No" disconnects nothing', async () => {
    await listed([claude]);

    await press(button(row('Claude'), 'Desconectar'));
    expect(row('Claude').querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      '¿Desconectar?',
    );
    await press(button(row('Claude'), 'No'));

    httpTesting.expectNone('/api/me/connected-apps/Yk3s9QzX2b7Lm4Np8Rt1Vw6Hc5Jd0Fa2');
    expect(rows()).toHaveLength(1);
  });

  it('disconnects with "Sí": the row leaves once the API says so, the focus on the heading', async () => {
    await listed([claude, chatgpt]);

    await disconnect('Claude');
    // Until the API answers, the application is still connected.
    expect(rows()).toHaveLength(2);
    disconnection(claude.id).flush({ disconnected: true });
    await settle();
    await fixture.whenStable();

    expect(rows().map((each) => text(each.querySelector('.title')))).toEqual(['ChatGPT']);
    expect(document.activeElement).toBe(page().querySelector('h1'));
  });

  it('asks the API once, however often "Sí" is pressed again while it answers', async () => {
    await listed([claude]);

    await disconnect('Claude');
    await disconnect('Claude');

    disconnection(claude.id).flush({ disconnected: true });
    await settle();
    await fixture.whenStable();
    expect(rows()).toEqual([]);
  });

  it('leaves the focus where it was moved to while the API answered', async () => {
    await listed([claude, chatgpt]);

    await disconnect('Claude');
    await press(button(row('ChatGPT'), 'Desconectar'));
    const no = button(row('ChatGPT'), 'No');
    expect(document.activeElement).toBe(no);
    disconnection(claude.id).flush({ disconnected: true });
    await settle();
    await fixture.whenStable();

    expect(rows().map((each) => text(each.querySelector('.title')))).toEqual(['ChatGPT']);
    expect(document.activeElement).toBe(no);
  });

  it('takes the row away when the account no longer has that connection, and reads the list again', async () => {
    // Disconnected and connected again in another tab: the same application, under a new connection.
    const reconnected: ConnectedApplication = {
      ...claude,
      id: 'Zz9y8Xw7Vv6Uu5Tt4Ss3Rr2Qq1Pp0Oo9',
      connectedAt: '2026-11-26T12:00:00.000Z',
    };
    await listed([claude, chatgpt]);

    await disconnect('Claude');
    disconnection(claude.id).flush(
      { error: { code: 'NOT_FOUND', message: 'No such connection', details: [] } },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();
    TestBed.tick();

    expect(rows().map((each) => text(each.querySelector('.title')))).toEqual(['ChatGPT']);
    expect(document.activeElement).toBe(page().querySelector('h1'));
    httpTesting.expectOne('/api/me/connected-apps').flush([reconnected, chatgpt]);
    await fixture.whenStable();
    expect(text(row('Claude').querySelector('.state'))).toBe(
      'claude.ai · Conectada el 26 de noviembre de 2026',
    );
    expect(rows()).toHaveLength(2);
  });

  describe('once the page is left before the API answers', () => {
    it('says nothing when disconnecting fails', async () => {
      await listed([claude]);
      await disconnect('Claude');
      const request = disconnection(claude.id);

      fixture.destroy();
      request.flush(
        { error: { code: 'INTERNAL', message: 'Failed', details: [] } },
        { status: 500, statusText: 'Internal Server Error' },
      );
      await settle();

      expect(TestBed.inject(Toaster).message()).toBeNull();
    });

    it('moves no focus when disconnecting succeeds', async () => {
      await listed([claude]);
      await disconnect('Claude');
      const request = disconnection(claude.id);

      fixture.destroy();
      const focused = document.activeElement;
      request.flush({ disconnected: true });
      await settle();

      expect(document.activeElement).toBe(focused);
    });
  });

  it('keeps the row and says so when disconnecting fails, to try again', async () => {
    await listed([claude]);

    await disconnect('Claude');
    disconnection(claude.id).flush(
      { error: { code: 'INTERNAL', message: 'Failed', details: [] } },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await settle();
    await fixture.whenStable();

    expect(rows()).toHaveLength(1);
    expect(TestBed.inject(Toaster).message()).toBe(
      'No se ha podido desconectar. Inténtalo de nuevo.',
    );
    await disconnect('Claude');
    disconnection(claude.id).flush({ disconnected: true });
    await settle();
    await fixture.whenStable();
    expect(rows()).toEqual([]);
  });

  it('keeps the row and says so when the API cannot be reached', async () => {
    await listed([claude]);

    await disconnect('Claude');
    disconnection(claude.id).error(new ProgressEvent('error'));
    await settle();
    await fixture.whenStable();

    expect(rows()).toHaveLength(1);
    expect(TestBed.inject(Toaster).message()).toBe(
      'No se ha podido desconectar. Inténtalo de nuevo.',
    );
  });

  describe('with no application', () => {
    it('says so, and how to connect one, with the connector’s address to copy', async () => {
      await listed([]);

      expect(text(page().querySelector('.empty'))).toBe('No tienes ninguna aplicación conectada.');
      expect(page().querySelector('.lead')).toBeNull();
      expect(text(page().querySelector('.help'))).toBe(
        'Para conectar un asistente, añade qando en sus ajustes de conectores con esta dirección:',
      );
      expect(text(page().querySelector('.well .url'))).toBe(`${location.origin}/api/mcp`);
    });

    it('copies the connector’s address with "Copiar"', async () => {
      const writeText = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      await listed([]);

      await press(button(page(), 'Copiar'));

      expect(writeText).toHaveBeenCalledWith(`${location.origin}/api/mcp`);
      expect(TestBed.inject(Toaster).message()).toBe('Enlace copiado');
    });

    it('is what is left once the last application is disconnected', async () => {
      await listed([claude]);

      await disconnect('Claude');
      disconnection(claude.id).flush({ disconnected: true });
      await settle();
      await fixture.whenStable();

      expect(text(page().querySelector('.empty'))).toBe('No tienes ninguna aplicación conectada.');
    });
  });

  it('offers to try again when the list cannot be loaded', async () => {
    render();
    httpTesting
      .expectOne('/api/me/connected-apps')
      .flush(
        { error: { code: 'INTERNAL', message: 'Failed', details: [] } },
        { status: 500, statusText: 'Internal Server Error' },
      );
    await fixture.whenStable();

    expect(page().querySelector('app-error-state')).not.toBeNull();
    // Not waited for: the page is stable only once the list is back.
    button(page(), 'Reintentar').click();
    TestBed.tick();
    httpTesting.expectOne('/api/me/connected-apps').flush([claude]);
    await fixture.whenStable();
    expect(rows()).toHaveLength(1);
  });

  describe('when the session has ended', () => {
    async function signedOutBy(answer: () => unknown): Promise<void> {
      await answer();
      await fixture.whenStable();
      const router = TestBed.inject(Router);
      // Asked again, the API says nobody is signed in; only then does the page leave.
      await vi.waitFor(() => {
        for (const request of httpTesting.match('/api/auth/session')) request.flush(null);
        expect(router.url).toBe('/sign-in?returnTo=%2Fconnected-apps');
      });
      expect(page().querySelector('[role="alert"]')).toBeNull();
    }

    it('sends to the sign-in page, back here afterwards, from the list', async () => {
      render();
      await signedOutBy(() => {
        httpTesting
          .expectOne('/api/me/connected-apps')
          .flush(unauthenticated.body, unauthenticated.answer);
      });
    });

    it('sends to the sign-in page, back here afterwards, from "Desconectar", saying nothing', async () => {
      await listed([claude]);
      await disconnect('Claude');

      await signedOutBy(async () => {
        disconnection(claude.id).flush(unauthenticated.body, unauthenticated.answer);
        await settle();
      });
      expect(TestBed.inject(Toaster).message()).toBeNull();
    });
  });
});

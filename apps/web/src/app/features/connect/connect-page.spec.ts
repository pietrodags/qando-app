import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, Component, ErrorHandler } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { SignedInAccount } from '@qando/contracts';
import { literalValues } from '../../../styles/token-usage';
import { Session } from '../../core/auth/session';
import { WholeNavigation } from '../../core/auth/whole-navigation';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { ConnectPage } from './connect-page';
import pageStyles from './connect-page.scss' with { loader: 'text' };

const session = { method: 'GET', url: '/api/auth/session' };
const which = { method: 'POST', url: '/api/auth/connecting-application' };
const consent = { method: 'POST', url: '/api/auth/oauth2/consent' };

/** A request to connect as the authorization server signs it into the page's address. */
const asked =
  'response_type=code&client_id=https%3A%2F%2Fclaude.ai%2Fmcp.json&ba_param=client_id&ba_param=response_type&sig=a%2Bb%3D';
const ana: SignedInAccount = { name: 'Ana', email: 'ana@example.com' };
const claude = { name: 'Claude', host: 'claude.ai' };
const back = 'https://claude.ai/callback?code=c0de&state=s';

function errorBody(code: string) {
  return { error: { code, message: 'x', details: [] } };
}

@Component({ template: '' })
class OtherPage {}

describe('ConnectPage', () => {
  let fixture: ComponentFixture<unknown>;
  let httpTesting: HttpTestingController;
  /** The addresses the browser was sent to with a whole navigation, leaving the app. */
  let left: string[];
  /** The errors the app was told of: a page that works reports none. */
  let reported: unknown[];

  beforeEach(() => {
    vi.useFakeTimers();
    left = [];
    reported = [];
    TestBed.configureTestingModule({
      providers: [
        provideI18n(),
        {
          provide: ErrorHandler,
          useValue: { handleError: (error: unknown) => reported.push(error) },
        },
        { provide: WholeNavigation, useValue: { replaceWith: (to: string) => left.push(to) } },
        provideRouter([
          { path: 'connect', component: ConnectPage },
          { path: '**', component: OtherPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.useRealTimers();
    expect(reported).toEqual([]);
  });

  /** Lets time pass, then the answers, effects and rendering that follow. */
  async function pass(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    TestBed.inject(ApplicationRef).tick();
    fixture.detectChanges();
  }

  /**
   * Opens the consent page at an address with `query`, in an app that asked for the session when
   * it started and was answered `account`; not answered yet when `account` is `'unanswered'`.
   */
  async function renderAt(
    query: string,
    account: SignedInAccount | null | 'unanswered' = ana,
  ): Promise<void> {
    TestBed.inject(Session);
    if (account !== 'unanswered') httpTesting.expectOne(session).flush(account);
    const harness = await RouterTestingHarness.create('/somewhere');
    fixture = harness.fixture;
    document.body.append(fixture.nativeElement as HTMLElement);
    await harness.navigateByUrl(`/connect${query === '' ? '' : `?${query}`}`, ConnectPage);
    await pass();
  }

  /** Opens the page with a request the API says `application` made. */
  async function renderAsked(application = claude): Promise<void> {
    await renderAt(asked);
    httpTesting.expectOne(which).flush(application);
    await pass();
  }

  /** The address the router is at, and whether it got there in place of the page before. */
  function at(): { path: string; query: unknown; replaced: boolean | undefined } {
    const router = TestBed.inject(Router);
    const { queryParams } = router.parseUrl(router.url);
    return {
      path: router.url.split('?')[0] ?? '',
      query: queryParams,
      replaced: router.lastSuccessfulNavigation()?.extras.replaceUrl,
    };
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(found: Element | null | undefined): string {
    return (found?.textContent ?? '').replace(/[ \t\n]+/g, ' ').trim();
  }

  function texts(selector: string): string[] {
    return [...element().querySelectorAll(selector)].map((found) => text(found));
  }

  function buttons(): HTMLButtonElement[] {
    return [...element().querySelectorAll<HTMLButtonElement>('button.answer')];
  }

  function button(name: 'Cancelar' | 'Permitir'): HTMLButtonElement {
    return buttons().find((found) => text(found) === name)!;
  }

  /** The logos shown in what `selector` finds, by the assistant each draws. */
  function logos(selector: string): string[] {
    return [...element().querySelectorAll(`${selector} svg`)].map(
      (logo) => logo.getAttribute('class') ?? '',
    );
  }

  function notice(): string {
    return text(element().querySelector('app-failure-notice'));
  }

  function expectExpiredCard(): void {
    expect(texts('main > .card h1')).toEqual(['Esta solicitud ha caducado']);
    expect(texts('.lead')).toEqual(['Vuelve a tu asistente y empieza la conexión otra vez.']);
    const links = [...element().querySelectorAll<HTMLAnchorElement>('.answers a')];
    expect(links.map((link) => [text(link), link.getAttribute('href'), link.className])).toEqual([
      ['Ir a Mis eventos', '/my-events', 'answer'],
    ]);
    expect(buttons()).toEqual([]);
    expect(element().querySelector('ul')).toBeNull();
    expect(element().querySelector('app-privacy-link')).toBeNull();
    expect(element().querySelector('app-loading-state')).toBeNull();
    expect(element().querySelector('app-error-state')).toBeNull();
  }

  const signInWithTheRequest = {
    path: '/sign-in',
    query: {
      response_type: 'code',
      client_id: 'https://claude.ai/mcp.json',
      ba_param: ['client_id', 'response_type'],
      sig: 'a+b=',
    },
    replaced: true,
  };

  it('takes every value of its styles from the design tokens', () => {
    expect(literalValues(pageStyles)).toEqual([]);
  });

  describe('opened without a request to connect', () => {
    it.each([
      ['nothing in its address', ''],
      [
        'the reason a request could not return to its application',
        'error=invalid_redirect&error_description=Unknown+redirect',
      ],
      ['something else', 'returnTo=%2Fmy-events'],
    ])('says the request expired, and asks the API nothing: %s', async (_what, query) => {
      await renderAt(query);
      expectExpiredCard();
      httpTesting.expectNone(which);
    });

    it('takes the focus to the card’s heading', async () => {
      await renderAt('');
      const heading = element().querySelector('h1');
      expect(heading?.getAttribute('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(heading);
    });
  });

  describe('opened with a request to connect', () => {
    it('asks the API which application the request names, with the whole query, and says it is loading', async () => {
      await renderAt(asked);
      const sent = httpTesting.expectOne(which);
      expect(sent.request.body).toEqual({
        connectionRequest: new URLSearchParams(asked).toString(),
      });
      // The loading state draws its own card: the page's card waits for something to say.
      expect(element().querySelector('main > app-loading-state')).not.toBeNull();
      expect(element().querySelector('.card')).toBeNull();
      expect(element().querySelector('h1')).toBeNull();
      expect(buttons()).toEqual([]);
      sent.flush(claude);
    });

    it('names the application, the host it is published at and the account, and says what it will do', async () => {
      await renderAsked();
      expect(element().querySelector('app-loading-state')).toBeNull();
      expect(texts('main > .card h1')).toEqual(['Conectar Claude con qando']);
      expect(texts('.lead')).toEqual(['Claude (claude.ai) quiere usar tu cuenta ana@example.com.']);
      expect(texts('.lead strong')).toEqual(['Claude', 'ana@example.com']);
      expect(texts('.can .label')).toEqual(['Podrá:']);
      expect(texts('.can li')).toEqual([
        'Ver tus eventos y sus resultados',
        'Crear eventos y gestionarlos por ti (confirmar la fecha, por ejemplo)',
      ]);
      expect(texts('.hint')).toEqual([
        'Permítelo solo si acabas de añadir qando en Claude. Podrás desconectarla cuando quieras en «Apps conectadas».',
      ]);
    });

    it('shows the assistant’s logo before its name in the heading, not inside the sentences', async () => {
      await renderAsked();
      expect(logos('main > .card h1')).toEqual(['logo claude']);
      expect(logos('.lead')).toEqual([]);
      expect(logos('.hint')).toEqual([]);
    });

    it('shows no logo for an application that only calls itself an assistant', async () => {
      await renderAsked({ name: 'Claude', host: 'claude.example' });
      expect(texts('main > .card h1')).toEqual(['Conectar Claude con qando']);
      expect(logos('main')).toEqual([]);
    });

    it('offers "Cancelar", then "Permitir" as the action, and nothing to tick', async () => {
      await renderAsked();
      expect(buttons().map((found) => [text(found), found.className, found.type])).toEqual([
        ['Cancelar', 'answer', 'button'],
        ['Permitir', 'answer action', 'button'],
      ]);
      expect(buttons().map((found) => found.disabled)).toEqual([false, false]);
      expect(element().querySelector('input')).toBeNull();
      expect(notice()).toBe('');
    });

    it('links to "Privacidad y condiciones" under the buttons, in a new tab', async () => {
      await renderAsked();
      const link = element().querySelector<HTMLAnchorElement>('.privacy app-privacy-link a');
      expect(text(link)).toBe('Privacidad y condiciones');
      expect(link?.getAttribute('href')).toBe('/privacy');
      expect(link?.target).toBe('_blank');
      const answers = element().querySelector('.answers')!;
      expect(
        answers.compareDocumentPosition(link!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('takes the focus to the card’s heading once it knows the application', async () => {
      await renderAsked();
      const heading = element().querySelector('h1');
      expect(heading?.getAttribute('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(heading);
    });

    it('shows what the application says of itself as plain text, never as markup, and never a logo it gives itself', async () => {
      await renderAsked({ name: '<img src="x"><b>Claude</b>', host: '<i>claude.ai</i>' });
      expect(element().querySelector('img, b, i')).toBeNull();
      expect(texts('h1')).toEqual(['Conectar <img src="x"><b>Claude</b> con qando']);
      expect(texts('.lead')).toEqual([
        '<img src="x"><b>Claude</b> (<i>claude.ai</i>) quiere usar tu cuenta ana@example.com.',
      ]);
      expect(texts('.hint')[0]).toContain('en <img src="x"><b>Claude</b>. Podrás');
    });

    it('says the request expired when the API no longer takes it', async () => {
      await renderAt(asked);
      httpTesting
        .expectOne(which)
        .flush(errorBody('CONNECTION_REQUEST_EXPIRED'), { status: 410, statusText: 'Gone' });
      await pass();
      expectExpiredCard();
      expect(document.activeElement).toBe(element().querySelector('h1'));
    });

    it('gives its place to the sign-in page, with its whole query, when the session has ended', async () => {
      await renderAt(asked);
      httpTesting
        .expectOne(which)
        .flush(errorBody('UNAUTHENTICATED'), { status: 401, statusText: 'Unauthorized' });
      await pass();
      // The header learns the session is gone before the page leaves.
      expect(at().path).toBe('/connect');
      expect(element().querySelector('app-loading-state')).not.toBeNull();
      httpTesting.expectOne(session).flush(null);
      await pass();
      expect(at()).toEqual(signInWithTheRequest);
    });

    it('stays where the person went while the session was asked about', async () => {
      await renderAt(asked);
      httpTesting
        .expectOne(which)
        .flush(errorBody('UNAUTHENTICATED'), { status: 401, statusText: 'Unauthorized' });
      await pass();
      await TestBed.inject(Router).navigateByUrl('/privacy');
      httpTesting.expectOne(session).flush(null);
      await pass();
      expect(at().path).toBe('/privacy');
    });

    it('says it could not load, and asks again with "Reintentar"', async () => {
      await renderAt(asked);
      httpTesting
        .expectOne(which)
        .flush(errorBody('INTERNAL_ERROR'), { status: 500, statusText: 'x' });
      await pass();
      expect(texts('main > app-error-state .message')).toEqual(['No se ha podido cargar']);
      expect(element().querySelector('.card')).toBeNull();
      expect(element().querySelector('h1')).toBeNull();
      expect(element().querySelector('app-loading-state')).toBeNull();

      element().querySelector<HTMLButtonElement>('app-error-state button')!.click();
      await pass();
      expect(element().querySelector('app-error-state')).toBeNull();
      expect(element().querySelector('app-loading-state')).not.toBeNull();
      const again = httpTesting.expectOne(which);
      expect(again.request.body).toEqual({
        connectionRequest: new URLSearchParams(asked).toString(),
      });
      again.flush(claude);
      await pass();
      expect(texts('h1')).toEqual(['Conectar Claude con qando']);
    });

    it('says so when the address has asked too often, and counts down to asking again', async () => {
      await renderAt(asked);
      httpTesting.expectOne(which).flush(errorBody('RATE_LIMITED'), {
        status: 429,
        statusText: 'x',
        headers: { 'Retry-After': '20' },
      });
      await pass();
      expect(texts('app-error-state .message')).toEqual([
        'Hay demasiadas visitas desde tu red en este momento.',
      ]);
      expect(texts('app-error-state button')).toEqual(['Reintentar en 20 s']);
    });

    it('waits for the session’s answer before it names the account', async () => {
      await renderAt(asked, 'unanswered');
      httpTesting.expectOne(which).flush(claude);
      await pass();
      expect(element().querySelector('app-loading-state')).not.toBeNull();
      expect(element().querySelector('h1')).toBeNull();
      httpTesting.expectOne(session).flush(ana);
      await pass();
      expect(texts('.lead strong')).toEqual(['Claude', 'ana@example.com']);
    });

    it('names the account the session holds now, when another signs in from another tab', async () => {
      await renderAsked();
      // As the session does when another tab says it signed in: it asks again.
      void TestBed.inject(Session).refresh();
      httpTesting.expectOne(session).flush({ name: 'Berta', email: 'berta@example.com' });
      await pass();
      expect(texts('.lead')).toEqual([
        'Claude (claude.ai) quiere usar tu cuenta berta@example.com.',
      ]);
      expect(at().path).toBe('/connect');
    });

    it('gives its place to the sign-in page, with its whole query, when the session ends while the card shows', async () => {
      await renderAsked();
      void TestBed.inject(Session).signOut();
      httpTesting
        .expectOne({ method: 'POST', url: '/api/auth/sign-out' })
        .flush({ signedOut: true });
      await pass();
      // No card names an account that is no longer signed in.
      expect(element().querySelector('.card')).toBeNull();
      expect(buttons()).toEqual([]);
      // The page asks again what to show, as when it opened: the session has ended.
      httpTesting
        .expectOne(which)
        .flush(errorBody('UNAUTHENTICATED'), { status: 401, statusText: 'Unauthorized' });
      await pass();
      httpTesting.expectOne(session).flush(null);
      await pass();
      expect(at()).toEqual(signInWithTheRequest);
    });

    it('stays, and names the account again, when a question about the session fails while the card shows', async () => {
      await renderAsked();
      // Another tab signed in, and this tab's question about the session failed.
      void TestBed.inject(Session).refresh();
      httpTesting.expectOne(session).flush(errorBody('INTERNAL_ERROR'), {
        status: 500,
        statusText: 'x',
      });
      await pass();
      expect(element().querySelector('app-loading-state')).not.toBeNull();
      // An unknown session is not one that ended: the page asks again what to show.
      httpTesting.expectOne(which).flush(claude);
      await pass();
      httpTesting.expectOne(session).flush(ana);
      await pass();
      expect(texts('.lead strong')).toEqual(['Claude', 'ana@example.com']);
      expect(at().path).toBe('/connect');
    });

    it('says it could not load when the account stays unknown, and asks both again with "Reintentar"', async () => {
      await renderAt(asked, 'unanswered');
      httpTesting.expectOne(session).flush(errorBody('INTERNAL_ERROR'), {
        status: 500,
        statusText: 'x',
      });
      httpTesting.expectOne(which).flush(claude);
      await pass();
      // The session is asked once more, as every page that needs it does.
      httpTesting.expectOne(session).flush(errorBody('INTERNAL_ERROR'), {
        status: 500,
        statusText: 'x',
      });
      await pass();
      expect(texts('app-error-state .message')).toEqual(['No se ha podido cargar']);
      expect(element().querySelector('h1')).toBeNull();

      element().querySelector<HTMLButtonElement>('app-error-state button')!.click();
      await pass();
      httpTesting.expectOne(which).flush(claude);
      await pass();
      httpTesting.expectOne(session).flush(ana);
      await pass();
      expect(texts('.lead strong')).toEqual(['Claude', 'ana@example.com']);
    });
  });

  describe('answering', () => {
    it.each([
      ['Permitir', true],
      ['Cancelar', false],
    ] as const)(
      '"%s" sends the answer with the whole query and follows the browser back to the application',
      async (name, accept) => {
        await renderAsked();
        button(name).click();
        await pass();
        const sent = httpTesting.expectOne(consent);
        expect(sent.request.body).toEqual({
          accept,
          oauth_query: new URLSearchParams(asked).toString(),
        });
        expect(left).toEqual([]);
        sent.flush({ redirect: true, url: back });
        await pass();
        expect(left).toEqual([back]);
        expect(at().path).toBe('/connect');
      },
    );

    it('turns both buttons off while the answer is on its way, and until the browser has left', async () => {
      await renderAsked();
      button('Permitir').click();
      await pass();
      expect(buttons().map((found) => found.disabled)).toEqual([true, true]);
      // A press that reaches the page anyway sends nothing more.
      button('Cancelar').dispatchEvent(new MouseEvent('click'));
      button('Permitir').dispatchEvent(new MouseEvent('click'));
      await pass();
      httpTesting.expectOne(consent).flush({ redirect: true, url: back });
      await pass();
      expect(buttons().map((found) => found.disabled)).toEqual([true, true]);
      expect(left).toEqual([back]);
    });

    it.each(['Permitir', 'Cancelar'] as const)(
      'says to go back to the application once "%s" is handed to one the browser does not leave for, and hands the same answer again',
      async (name) => {
        await renderAsked();
        button(name).click();
        await pass();
        httpTesting
          .expectOne(consent)
          .flush({ redirect: true, url: 'cursor://mcp/callback?code=c0de' });
        await pass();
        expect(left).toEqual(['cursor://mcp/callback?code=c0de']);
        // The page is still here, and the answer is given: no other can follow it.
        expect(texts('main > .card h1')).toEqual(['Vuelve a Claude']);
        expect(texts('.lead')).toEqual([
          'Hemos enviado tu respuesta a Claude. Si no se ha abierto, prueba de nuevo.',
        ]);
        expect(buttons().map((found) => [text(found), found.className])).toEqual([
          ['Abrir Claude', 'answer action'],
        ]);
        expect(element().querySelector('ul')).toBeNull();
        expect(element().querySelector('app-privacy-link')).toBeNull();
        expect(notice()).toBe('');
        expect(document.activeElement).toBe(element().querySelector('h1'));

        // Were the application not to open, the same answer is handed to it again.
        buttons()[0]!.click();
        await pass();
        expect(left).toEqual([
          'cursor://mcp/callback?code=c0de',
          'cursor://mcp/callback?code=c0de',
        ]);
        expect(texts('main > .card h1')).toEqual(['Vuelve a Claude']);
      },
    );

    it('shows the assistant’s logo before its name in the heading and on "Abrir", not inside the sentence', async () => {
      await renderAsked({ name: 'ChatGPT', host: 'chatgpt.com' });
      button('Permitir').click();
      await pass();
      httpTesting
        .expectOne(consent)
        .flush({ redirect: true, url: 'cursor://mcp/callback?code=c0de' });
      await pass();
      expect(texts('main > .card h1')).toEqual(['Vuelve a ChatGPT']);
      expect(logos('main > .card h1')).toEqual(['logo chatgpt']);
      expect(texts('button.answer')).toEqual(['Abrir ChatGPT']);
      expect(logos('button.answer')).toEqual(['logo chatgpt']);
      expect(logos('.lead')).toEqual([]);
    });

    it('says to go back to the application by the name it gives itself, as plain text', async () => {
      await renderAsked({ name: '<b>Cursor</b>', host: 'cursor.com' });
      button('Permitir').click();
      await pass();
      httpTesting
        .expectOne(consent)
        .flush({ redirect: true, url: 'cursor://mcp/callback?code=c0de' });
      await pass();
      expect(texts('main > .card h1')).toEqual(['Vuelve a <b>Cursor</b>']);
      expect(texts('button.answer')).toEqual(['Abrir <b>Cursor</b>']);
      expect(element().querySelector('.card b')).toBeNull();
    });

    it('keeps saying to go back to the application when the page asked again what to show while the answer was on its way', async () => {
      await renderAsked();
      button('Permitir').click();
      await pass();
      const sent = httpTesting.expectOne(consent);
      // Meanwhile another tab signed in, and this tab's question about the session failed.
      void TestBed.inject(Session).refresh();
      httpTesting.expectOne(session).flush(errorBody('INTERNAL_ERROR'), {
        status: 500,
        statusText: 'x',
      });
      await pass();
      const askedAgain = httpTesting.expectOne(which);
      sent.flush({ redirect: true, url: 'cursor://mcp/callback?code=c0de' });
      await pass();
      askedAgain.flush(claude);
      await pass();
      httpTesting.expectOne(session).flush(ana);
      await pass();
      // The answer is given: what the page learned meanwhile does not bring the consent back.
      expect(texts('main > .card h1')).toEqual(['Vuelve a Claude']);
      expect(texts('button.answer')).toEqual(['Abrir Claude']);
    });

    it('says the request expired when the authorization server no longer takes it', async () => {
      await renderAsked();
      button('Permitir').click();
      await pass();
      httpTesting
        .expectOne(consent)
        .flush({ error: 'invalid_signature' }, { status: 400, statusText: 'Bad Request' });
      await pass();
      expectExpiredCard();
      expect(document.activeElement).toBe(element().querySelector('h1'));
      expect(left).toEqual([]);
    });

    it('gives its place to the sign-in page, with its whole query, when the session has ended', async () => {
      await renderAsked();
      button('Cancelar').click();
      await pass();
      httpTesting.expectOne(consent).flush(null, { status: 401, statusText: 'Unauthorized' });
      await pass();
      httpTesting.expectOne(session).flush(null);
      await pass();
      expect(at()).toEqual(signInWithTheRequest);
      expect(left).toEqual([]);
    });

    it('says under the buttons that the answer could not be sent, and sends it again on another press', async () => {
      await renderAsked();
      button('Permitir').click();
      await pass();
      httpTesting
        .expectOne(consent)
        .flush(errorBody('INTERNAL_ERROR'), { status: 500, statusText: 'x' });
      await pass();
      expect(notice()).toBe('No se ha podido enviar tu respuesta. Inténtalo de nuevo.');
      expect(element().querySelector('app-failure-notice [role="alert"]')).not.toBeNull();
      expect(element().querySelector('app-failure-notice')?.className).toBe('error');
      expect(texts('h1')).toEqual(['Conectar Claude con qando']);
      expect(buttons().map((found) => found.disabled)).toEqual([false, false]);
      const notices = element().querySelector('app-failure-notice')!;
      const answers = element().querySelector('.answers')!;
      const privacy = element().querySelector('.privacy')!;
      expect(
        answers.compareDocumentPosition(notices) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        notices.compareDocumentPosition(privacy) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      button('Cancelar').click();
      await pass();
      // Gone while the new answer is on its way.
      expect(notice()).toBe('');
      const again = httpTesting.expectOne(consent);
      expect(again.request.body).toMatchObject({ accept: false });
      again.flush({ redirect: true, url: back });
      await pass();
      expect(left).toEqual([back]);
    });

    it('says so when the answer never reaches the authorization server', async () => {
      await renderAsked();
      button('Permitir').click();
      await pass();
      httpTesting.expectOne(consent).error(new ProgressEvent('error'));
      await pass();
      expect(notice()).toBe('No se ha podido enviar tu respuesta. Inténtalo de nuevo.');
      expect(buttons().map((found) => found.disabled)).toEqual([false, false]);
    });

    it('says so when the address has answered too often, and keeps the buttons off until the wait ends', async () => {
      await renderAsked();
      button('Permitir').click();
      await pass();
      httpTesting.expectOne(consent).flush(errorBody('RATE_LIMITED'), {
        status: 429,
        statusText: 'x',
        headers: { 'Retry-After': '30' },
      });
      await pass();
      expect(text(element().querySelector('app-failure-notice [role="alert"]'))).toBe(
        'Hay demasiadas visitas desde tu red en este momento. Podrás probar de nuevo en 30 s.',
      );
      expect(buttons().map((found) => found.disabled)).toEqual([true, true]);
      // A press that reaches the page anyway sends nothing.
      button('Permitir').dispatchEvent(new MouseEvent('click'));
      await pass(29_000);
      expect(buttons().map((found) => found.disabled)).toEqual([true, true]);
      await pass(1_000);
      expect(notice()).toBe('');
      expect(buttons().map((found) => found.disabled)).toEqual([false, false]);

      button('Permitir').click();
      await pass();
      httpTesting.expectOne(consent).flush({ redirect: true, url: back });
      await pass();
      expect(left).toEqual([back]);
    });
  });
});

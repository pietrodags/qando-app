import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { SignInPage } from './sign-in-page';
import pageStyles from './sign-in-page.scss' with { loader: 'text' };

const signIn = { method: 'POST', url: '/api/auth/sign-in' };
const sendCode = { method: 'POST', url: '/api/auth/sign-in-code' };

function errorBody(code: string) {
  return { error: { code, message: 'x', details: [] } };
}

@Component({ template: '' })
class OtherPage {}

describe('SignInPage', () => {
  let fixture: ComponentFixture<unknown>;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideI18n(),
        // The real router, as the app sets it: the query's `returnTo` reaches the page's input.
        provideRouter(
          [
            { path: 'sign-in', component: SignInPage },
            { path: '**', component: OtherPage },
          ],
          withComponentInputBinding(),
        ),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.useRealTimers();
  });

  /** Lets time pass, then the answers, effects and rendering that follow. */
  async function pass(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    TestBed.inject(ApplicationRef).tick();
    fixture.detectChanges();
  }

  /** Opens the sign-in page, asked to come back to `returnTo` when given. */
  async function render(returnTo?: string): Promise<void> {
    const harness = await RouterTestingHarness.create('/somewhere');
    fixture = harness.fixture;
    document.body.append(fixture.nativeElement as HTMLElement);
    const query = returnTo === undefined ? '' : `?returnTo=${encodeURIComponent(returnTo)}`;
    await harness.navigateByUrl(`/sign-in${query}`, SignInPage);
    await pass();
  }

  /** The address the router is at, and whether it got there in place of the page before. */
  function at(): { url: string; replaced: boolean | undefined } {
    const router = TestBed.inject(Router);
    return { url: router.url, replaced: router.lastSuccessfulNavigation()?.extras.replaceUrl };
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function emailField(): HTMLInputElement {
    return element().querySelector<HTMLInputElement>('input[type="email"]')!;
  }

  function codeField(): HTMLInputElement | null {
    return element().querySelector('app-sign-in-code input');
  }

  function button(name: string): HTMLButtonElement | undefined {
    return Array.from(element().querySelectorAll('button')).find(
      (candidate) => candidate.textContent.trim() === name,
    );
  }

  function alerts(): string[] {
    return Array.from(element().querySelectorAll('[role="alert"]'), (alert) =>
      alert.textContent.trim().replace(/\s+/g, ' '),
    );
  }

  async function typeEmail(value: string): Promise<void> {
    emailField().value = value;
    emailField().dispatchEvent(new Event('input'));
    await pass();
  }

  async function submit(): Promise<Event> {
    const event = new Event('submit', { cancelable: true });
    element().querySelector('form')?.dispatchEvent(event);
    await pass();
    return event;
  }

  /** Asks for a code for `email`, which the API sends. */
  async function reachCodeStep(email = 'ana@example.com'): Promise<void> {
    await typeEmail(email);
    await submit();
    httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds: 30 });
    await pass();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(pageStyles)).toEqual([]);
  });

  it('asks for the email in the main landmark, under the page heading', async () => {
    await render();

    expect(element().querySelector('main h1')?.textContent.trim()).toBe('Entrar');
    expect(element().querySelector('.lead')?.textContent.trim()).toBe(
      'Escribe tu email y te enviaremos un código para entrar. Sin contraseñas.',
    );
    expect(element().textContent).toContain(
      'Si es la primera vez que entras, tu cuenta se crea sola al escribir el código.',
    );
    expect(codeField()).toBeNull();
  });

  it('labels the email field, lets the browser fill it and puts the cursor in it', async () => {
    await render();

    expect(emailField().labels?.[0]?.textContent.trim()).toBe('Tu email');
    expect(emailField().getAttribute('autocomplete')).toBe('email');
    expect(emailField().placeholder).toBe('nombre@ejemplo.com');
    expect(document.activeElement).toBe(emailField());
    expect(emailField().value).toBe('');
    expect(alerts()).toEqual([]);
    expect(emailField().hasAttribute('aria-invalid')).toBe(false);
  });

  it('sends the code with the button that submits the form', async () => {
    await render();
    await typeEmail('ana@example.com');

    expect(button('Enviar código')?.type).toBe('submit');
    const event = await submit();

    // The page sends it, not the browser's form.
    expect(event.defaultPrevented).toBe(true);
    const request = httpTesting.expectOne(sendCode);
    expect(request.request.body).toEqual({ email: 'ana@example.com' });
    request.flush({ sent: true, resendAfterSeconds: 30 });
  });

  it('sends the email as the API will keep it: trimmed, in lower case', async () => {
    await render();
    await typeEmail('  Ana@Example.COM ');
    await submit();

    const request = httpTesting.expectOne(sendCode);
    expect(request.request.body).toEqual({ email: 'ana@example.com' });
    request.flush({ sent: true, resendAfterSeconds: 30 });
    await pass();

    expect(element().querySelector('.lead strong')?.textContent).toBe('ana@example.com');
  });

  it.each(['', 'ana', 'ana@example', 'ana example@example.com'])(
    'asks to check an email like "%s" without sending anything',
    async (email) => {
      await render();
      await typeEmail(email);
      emailField().blur();

      await submit();

      httpTesting.expectNone(sendCode);
      expect(alerts()).toEqual(['Revisa el email: no parece una dirección completa.']);
      expect(emailField().getAttribute('aria-invalid')).toBe('true');
      expect(emailField().getAttribute('aria-describedby')).toBe(
        element().querySelector('[role="alert"]')?.id,
      );
      expect(document.activeElement).toBe(emailField());
    },
  );

  it('forgets that complaint as soon as the email changes', async () => {
    await render();
    await typeEmail('ana');
    await submit();

    await typeEmail('ana@');

    expect(alerts()).toEqual([]);
    expect(emailField().hasAttribute('aria-invalid')).toBe(false);
    expect(emailField().hasAttribute('aria-describedby')).toBe(false);
  });

  it('sends one code: the button is off while it is on its way', async () => {
    await render();
    await typeEmail('ana@example.com');
    await submit();

    expect(button('Enviar código')?.disabled).toBe(true);
    await submit();

    httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds: 30 });
    await pass();
  });

  it('moves on to the code once it was sent, with the wait the API asks before another', async () => {
    await render();
    await typeEmail('ana@example.com');
    await submit();
    httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds: 45 });
    await pass();

    expect(element().querySelector('h1')?.textContent.trim()).toBe('Escribe el código');
    expect(element().querySelectorAll('h1')).toHaveLength(1);
    expect(emailField()).toBeNull();
    expect(document.activeElement).toBe(codeField());
    expect(button('Reenviar código en 45 s')?.disabled).toBe(true);
  });

  it('says when the code could not be sent, and sends again on the next press', async () => {
    await render();
    await typeEmail('ana@example.com');
    await submit();
    httpTesting
      .expectOne(sendCode)
      .flush(errorBody('CODE_NOT_DELIVERED'), { status: 502, statusText: 'Bad Gateway' });
    await pass();

    expect(alerts()).toEqual(['No hemos podido enviarte el código. Inténtalo de nuevo.']);
    expect(emailField().value).toBe('ana@example.com');
    expect(button('Enviar código')?.disabled).toBe(false);

    await submit();

    expect(alerts()).toEqual([]);
    httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds: 30 });
  });

  it('says one thing at a time: an email to check replaces the failure of the last send', async () => {
    await render();
    await typeEmail('ana@example.com');
    await submit();
    httpTesting
      .expectOne(sendCode)
      .flush(errorBody('CODE_NOT_DELIVERED'), { status: 502, statusText: 'Bad Gateway' });
    await pass();

    await typeEmail('ana@example');
    await submit();

    expect(alerts()).toEqual(['Revisa el email: no parece una dirección completa.']);
  });

  it('says when too many codes were asked and waits, sending nothing meanwhile', async () => {
    await render();
    await typeEmail('ana@example.com');
    await submit();
    httpTesting.expectOne(sendCode).flush(errorBody('RATE_LIMITED'), {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '720' },
    });
    await pass();

    expect(alerts()).toEqual(['Has pedido demasiados códigos. Podrás pedir otro en 12 min.']);
    expect(button('Enviar código')?.disabled).toBe(true);
    await submit();
    httpTesting.expectNone(sendCode);

    await pass(720_000);
    expect(alerts()).toEqual([]);
    expect(button('Enviar código')?.disabled).toBe(false);
  });

  it('goes back to the email, kept as typed and with the cursor, to correct it', async () => {
    await render();
    await reachCodeStep('Ana@exmaple.com');

    button('Cambiar email')?.click();
    await pass();

    expect(codeField()).toBeNull();
    expect(element().querySelector('h1')?.textContent.trim()).toBe('Entrar');
    expect(emailField().value).toBe('Ana@exmaple.com');
    expect(document.activeElement).toBe(emailField());
  });

  describe('once the code signed in', () => {
    async function signInWithCode(): Promise<void> {
      await reachCodeStep();
      const field = codeField()!;
      field.value = '482915';
      field.dispatchEvent(new Event('input'));
      await pass();
      httpTesting.expectOne(signIn).flush({ signedIn: true });
      await pass();
    }

    it('opens the page that asked to sign in, in place of this one', async () => {
      await render('/vote/k3Jd9');

      await signInWithCode();

      // Replaced: going back from that page does not return to the code.
      expect(at()).toEqual({ url: '/vote/k3Jd9', replaced: true });
    });

    it('opens "Mis eventos" when no page asked', async () => {
      await render();

      await signInWithCode();

      expect(at()).toEqual({ url: '/my-events', replaced: true });
    });

    it('never follows an address of another site', async () => {
      await render('//evil.example/x');

      await signInWithCode();

      expect(at()).toEqual({ url: '/my-events', replaced: true });
    });
  });

  it('opens nothing before the code signed in', async () => {
    await render('/vote/k3Jd9');
    await reachCodeStep();

    expect(at().url).toBe('/sign-in?returnTo=%2Fvote%2Fk3Jd9');
  });
});

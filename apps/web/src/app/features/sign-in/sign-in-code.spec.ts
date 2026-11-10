import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { SignInCode } from './sign-in-code';
import codeStyles from './sign-in-code.scss' with { loader: 'text' };

const signIn = { method: 'POST', url: '/api/auth/sign-in' };
const sendCode = { method: 'POST', url: '/api/auth/sign-in-code' };

function errorBody(code: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message: 'x', details: [], ...extra } };
}

const badRequest = { status: 400, statusText: 'Bad Request' };

describe('SignInCode', () => {
  let fixture: ComponentFixture<SignInCode>;
  let httpTesting: HttpTestingController;
  let signedIn: number;
  let changeEmail: number;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [SignInCode],
      providers: [provideI18n(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    signedIn = 0;
    changeEmail = 0;
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

  /** The code step for ana@example.com, whose code was sent `resendAfterSeconds` ago at most. */
  async function render(resendAfterSeconds = 30): Promise<void> {
    fixture = TestBed.createComponent(SignInCode);
    fixture.componentRef.setInput('email', 'ana@example.com');
    fixture.componentRef.setInput('resendAfterSeconds', resendAfterSeconds);
    fixture.componentInstance.signedIn.subscribe(() => signedIn++);
    fixture.componentInstance.changeEmail.subscribe(() => changeEmail++);
    document.body.append(fixture.nativeElement as HTMLElement);
    await pass();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function field(): HTMLInputElement {
    return element().querySelector<HTMLInputElement>('input')!;
  }

  function button(name: RegExp): HTMLButtonElement | undefined {
    return Array.from(element().querySelectorAll('button')).find((candidate) =>
      name.test(candidate.textContent.trim()),
    );
  }

  function alerts(): string[] {
    return Array.from(element().querySelectorAll('[role="alert"]'), (alert) =>
      alert.textContent.trim().replace(/\s+/g, ' '),
    );
  }

  /** Presses a button as a person does: the focus goes to it first. */
  function press(pressed: HTMLButtonElement | undefined): void {
    pressed?.focus();
    pressed?.click();
  }

  /** The field's content becomes `value`, as typing, pasting or the device's suggestion leave it. */
  async function type(value: string): Promise<void> {
    field().value = value;
    field().dispatchEvent(new Event('input'));
    await pass();
  }

  /** Types 482915 and answers its check with a refusal. */
  async function refuse(code: string, extra: Record<string, unknown> = {}): Promise<void> {
    await type('482915');
    httpTesting.expectOne(signIn).flush(errorBody(code, extra), badRequest);
    await pass();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(codeStyles)).toEqual([]);
  });

  it('says where the code was sent', async () => {
    await render();

    expect(element().querySelector('h1')?.textContent.trim()).toBe('Escribe el código');
    expect(element().querySelector('.lead')?.textContent.trim().replace(/\s+/g, ' ')).toBe(
      'Te hemos enviado un código de 6 cifras a ana@example.com',
    );
    expect(element().querySelector('.lead strong')?.textContent).toBe('ana@example.com');
  });

  it('asks for the code in one labelled field the device can fill, with the cursor in it', async () => {
    await render();

    expect(field().labels?.[0]?.textContent.trim()).toBe('Código');
    expect(field().getAttribute('autocomplete')).toBe('one-time-code');
    expect(field().getAttribute('inputmode')).toBe('numeric');
    expect(field().placeholder).toBe('······');
    expect(field().type).toBe('text');
    // No length limit of the browser's: it would cut a pasted "482 915" before its last digit.
    expect(field().hasAttribute('maxlength')).toBe(false);
    expect(document.activeElement).toBe(field());
    expect(field().value).toBe('');
  });

  it('tells beforehand that the last digit signs in', async () => {
    await render();

    const hint = element().querySelector('.hint');
    expect(hint?.textContent.trim()).toBe('Entrarás al escribir la última cifra.');
    expect(field().getAttribute('aria-describedby')).toBe(hint?.id);
    expect(hint?.id).toBeTruthy();
  });

  it('keeps only digits, and sends nothing before the sixth', async () => {
    await render();

    await type('48a 2-9');

    expect(field().value).toBe('4829');
    httpTesting.expectNone(signIn);
  });

  it('checks the code when its sixth digit is typed, and says so meanwhile', async () => {
    await render();

    await type('482915');

    const request = httpTesting.expectOne(signIn);
    expect(request.request.body).toEqual({ email: 'ana@example.com', code: '482915' });
    expect(element().querySelector('[role="status"]')?.textContent.trim()).toBe('Comprobando…');
    expect(element().querySelector('.hint')).toBeNull();
    // Read-only, not disabled: the cursor stays in the field.
    expect(field().readOnly).toBe(true);
    expect(field().disabled).toBe(false);
    expect(signedIn).toBe(0);
    request.flush({ signedIn: true });
  });

  it('tells its page once the code signed in, and keeps the field as it is', async () => {
    await render();
    await type('482915');

    httpTesting.expectOne(signIn).flush({ signedIn: true });
    await pass();

    expect(signedIn).toBe(1);
    expect(field().readOnly).toBe(true);
    expect(alerts()).toEqual([]);
  });

  it.each([
    ['482 915\n', '482915'],
    [' 4-8-2-9-1-5 ', '482915'],
    ['4829156789', '482915'],
  ])('takes the 6 digits of a pasted %j', async (pasted, code) => {
    await render();

    await type(pasted);

    expect(field().value).toBe(code);
    const request = httpTesting.expectOne(signIn);
    expect(request.request.body).toEqual({ email: 'ana@example.com', code });
    request.flush({ signedIn: true });
  });

  it('checks a code once: nothing more is sent while it is checked', async () => {
    await render();
    await type('482915');

    element()
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    await pass();

    httpTesting.expectOne(signIn).flush({ signedIn: true });
  });

  it('does not reload the page when Enter is pressed, nor send a short code', async () => {
    await render();
    await type('4829');

    const submit = new Event('submit', { cancelable: true });
    element().querySelector('form')?.dispatchEvent(submit);
    await pass();

    expect(submit.defaultPrevented).toBe(true);
    httpTesting.expectNone(signIn);
  });

  describe('a wrong code', () => {
    it('says how many tries are left and stays in the field to be corrected', async () => {
      await render();

      await refuse('WRONG_CODE', { attemptsLeft: 4 });

      expect(alerts()).toEqual(['Código incorrecto. Te quedan 4 intentos.']);
      expect(field().value).toBe('482915');
      expect(field().readOnly).toBe(false);
      expect(field().disabled).toBe(false);
      expect(element().querySelector('[role="status"]')).toBeNull();
      // The hint is gone: the field no longer names it.
      expect(element().querySelector('.hint')).toBeNull();
      expect(field().hasAttribute('aria-describedby')).toBe(false);
      expect(signedIn).toBe(0);
    });

    it('is not sent again as it is: Enter would only spend another try', async () => {
      await render();
      await refuse('WRONG_CODE', { attemptsLeft: 4 });

      element()
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { cancelable: true }));
      await pass();
      await type('48291');
      await type('482915');

      httpTesting.expectNone(signIn);
      expect(alerts()).toEqual(['Código incorrecto. Te quedan 4 intentos.']);
    });

    it('gives way to what the next check says', async () => {
      await render();
      await refuse('WRONG_CODE', { attemptsLeft: 4 });

      await type('48291');
      await type('482916');
      httpTesting.expectOne(signIn).flush(null, { status: 500, statusText: 'Error' });
      await pass();

      expect(alerts()).toEqual(['No se ha podido comprobar el código.']);
    });

    it('says the last try in the singular', async () => {
      await render();

      await refuse('WRONG_CODE', { attemptsLeft: 1 });

      expect(alerts()).toEqual(['Código incorrecto. Te queda 1 intento.']);
    });

    it('is checked again once corrected, the refusal gone meanwhile', async () => {
      await render();
      await refuse('WRONG_CODE', { attemptsLeft: 4 });

      await type('48291');
      httpTesting.expectNone(signIn);
      expect(alerts()).toEqual(['Código incorrecto. Te quedan 4 intentos.']);
      await type('482916');

      const request = httpTesting.expectOne(signIn);
      expect(request.request.body).toEqual({ email: 'ana@example.com', code: '482916' });
      expect(alerts()).toEqual([]);
      request.flush({ signedIn: true });
    });
  });

  describe.each([
    ['CODE_EXPIRED', 'El código ha caducado.'],
    ['TOO_MANY_ATTEMPTS', 'Demasiados intentos.'],
  ])('a code that no longer works (%s)', (code, message) => {
    it('says why, empties and turns off the field, and offers a new code', async () => {
      await render();
      await pass(30_000);

      await refuse(code);

      expect(alerts()).toEqual([message]);
      expect(field().value).toBe('');
      expect(field().disabled).toBe(true);
      expect(button(/^Enviar código nuevo$/)?.hasAttribute('aria-disabled')).toBe(false);
      expect(button(/^Reenviar código/)).toBeUndefined();
      expect(element().querySelector('.hint')).toBeNull();
      // The field went off under the cursor: it is on the way out, which comes before its reason.
      const sendNew = button(/^Enviar código nuevo$/);
      expect(document.activeElement).toBe(sendNew);
      expect(sendNew?.nextElementSibling).toBe(element().querySelector('[role="alert"]'));
    });

    it('sends the new code and starts again: field on, empty, with the cursor', async () => {
      await render();
      await pass(30_000);
      await refuse(code);

      press(button(/^Enviar código nuevo$/));
      await pass();
      const request = httpTesting.expectOne(sendCode);
      expect(request.request.body).toEqual({ email: 'ana@example.com' });
      request.flush({ sent: true, resendAfterSeconds: 45 });
      await pass();

      expect(alerts()).toEqual([]);
      expect(field().disabled).toBe(false);
      expect(field().value).toBe('');
      expect(document.activeElement).toBe(field());
      expect(button(/^Enviar código nuevo/)).toBeUndefined();
      expect(button(/^Reenviar código/)?.textContent.trim()).toBe('Reenviar código en 45 s');
      expect(element().querySelector('.hint')).not.toBeNull();
    });

    it('waits for the time a new code can be asked', async () => {
      await render(30);
      await pass(18_000);

      await refuse(code);

      const sendNew = button(/^Enviar código nuevo/);
      expect(sendNew?.textContent.trim()).toBe('Enviar código nuevo en 12 s');
      // Off but never disabled: it holds the cursor the field lost.
      expect(sendNew?.disabled).toBe(false);
      expect(sendNew?.getAttribute('aria-disabled')).toBe('true');
      expect(document.activeElement).toBe(sendNew);
      sendNew?.click();
      await pass();
      httpTesting.expectNone(sendCode);
      await pass(12_000);
      expect(button(/^Enviar código nuevo$/)?.hasAttribute('aria-disabled')).toBe(false);
    });

    it('keeps the refusal when the new code could not be sent', async () => {
      await render();
      await pass(30_000);
      await refuse(code);

      press(button(/^Enviar código nuevo$/));
      await pass();
      httpTesting
        .expectOne(sendCode)
        .flush(errorBody('CODE_NOT_DELIVERED'), { status: 502, statusText: 'Bad Gateway' });
      await pass();

      expect(alerts()).toEqual([message, 'No hemos podido enviarte el código.']);
      expect(field().disabled).toBe(true);
      expect(button(/^Enviar código nuevo$/)?.hasAttribute('aria-disabled')).toBe(false);
    });
  });

  describe('sending the code again', () => {
    it('waits the seconds the API asked, counting them down', async () => {
      await render(30);

      const resend = button(/^Reenviar código/);
      expect(resend?.textContent.trim()).toBe('Reenviar código en 30 s');
      expect(resend?.disabled).toBe(true);

      await pass(29_000);
      expect(resend?.textContent.trim()).toBe('Reenviar código en 1 s');
      expect(resend?.disabled).toBe(true);

      await pass(1000);
      expect(resend?.textContent.trim()).toBe('Reenviar código');
      expect(resend?.disabled).toBe(false);
    });

    it('sends a new code once, empties the field and waits again', async () => {
      await render(30);
      await type('48');
      await pass(30_000);

      press(button(/^Reenviar código$/));
      await pass();
      // Still on its way: a second press sends nothing.
      expect(button(/^Reenviar código$/)?.disabled).toBe(true);
      press(button(/^Reenviar código$/));
      await pass();
      const request = httpTesting.expectOne(sendCode);
      expect(request.request.body).toEqual({ email: 'ana@example.com' });
      request.flush({ sent: true, resendAfterSeconds: 30 });
      await pass();

      expect(field().value).toBe('');
      expect(document.activeElement).toBe(field());
      expect(button(/^Reenviar código/)?.textContent.trim()).toBe('Reenviar código en 30 s');
      expect(alerts()).toEqual([]);
    });

    it('waits for the answer about a code being checked, which is about the last code', async () => {
      await render(30);
      await pass(30_000);
      await type('482915');

      expect(button(/^Reenviar código$/)?.disabled).toBe(true);

      httpTesting.expectOne(signIn).flush(errorBody('WRONG_CODE', { attemptsLeft: 4 }), badRequest);
      await pass();
      expect(button(/^Reenviar código$/)?.disabled).toBe(false);
    });

    it('checks no code while the new one is on its way: it would be the last one', async () => {
      await render(30);
      await pass(30_000);
      press(button(/^Reenviar código$/));
      await pass();

      await type('482915');

      httpTesting.expectNone(signIn);
      httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds: 30 });
      await pass();
      expect(field().value).toBe('');
    });

    it('forgets the refusal of the code the new one replaces', async () => {
      await render(30);
      await pass(30_000);
      await refuse('WRONG_CODE', { attemptsLeft: 2 });

      press(button(/^Reenviar código$/));
      await pass();
      httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds: 30 });
      await pass();

      expect(alerts()).toEqual([]);
      expect(field().value).toBe('');
    });

    it('says when it could not be sent, and can be asked again at once', async () => {
      await render(30);
      await type('48');
      await pass(30_000);

      press(button(/^Reenviar código$/));
      await pass();
      httpTesting
        .expectOne(sendCode)
        .flush(errorBody('CODE_NOT_DELIVERED'), { status: 502, statusText: 'Bad Gateway' });
      await pass();

      expect(alerts()).toEqual(['No hemos podido enviarte el código.']);
      // The last code delivered still works: what was typed of it stays.
      expect(field().value).toBe('48');
      expect(button(/^Reenviar código$/)?.disabled).toBe(false);

      press(button(/^Reenviar código$/));
      await pass();
      expect(alerts()).toEqual([]);
      httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds: 30 });
    });

    it('says when too many codes were asked, with the wait in minutes', async () => {
      await render(30);
      await pass(30_000);

      press(button(/^Reenviar código$/));
      await pass();
      httpTesting.expectOne(sendCode).flush(errorBody('RATE_LIMITED'), {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '2400' },
      });
      await pass();

      expect(alerts()).toEqual(['Has pedido demasiados códigos. Podrás pedir otro en 40 min.']);
      expect(button(/^Reenviar código$/)?.disabled).toBe(true);

      await pass(2_400_000);
      expect(alerts()).toEqual([]);
      expect(button(/^Reenviar código$/)?.disabled).toBe(false);
    });
  });

  describe('a check that failed', () => {
    it('says so and offers to try the same code again', async () => {
      await render();
      await type('482915');
      httpTesting.expectOne(signIn).flush(null, { status: 500, statusText: 'Error' });
      await pass();

      expect(alerts()).toEqual(['No se ha podido comprobar el código.']);
      expect(field().value).toBe('482915');
      expect(field().readOnly).toBe(false);

      button(/^Reintentar$/)?.click();
      await pass();

      expect(alerts()).toEqual([]);
      expect(button(/^Reintentar$/)).toBeUndefined();
      const request = httpTesting.expectOne(signIn);
      expect(request.request.body).toEqual({ email: 'ana@example.com', code: '482915' });
      request.flush({ signedIn: true });
    });

    it('offers to try again only a whole code, and not while a new one is on its way', async () => {
      await render(30);
      await pass(30_000);
      await type('482915');
      httpTesting.expectOne(signIn).flush(null, { status: 500, statusText: 'Error' });
      await pass();

      press(button(/^Reenviar código$/));
      await pass();
      expect(button(/^Reintentar$/)).toBeUndefined();
      httpTesting
        .expectOne(sendCode)
        .flush(errorBody('CODE_NOT_DELIVERED'), { status: 502, statusText: 'Bad Gateway' });
      await pass();
      expect(button(/^Reintentar$/)).not.toBeUndefined();

      await type('48291');
      expect(button(/^Reintentar$/)).toBeUndefined();
      expect(alerts()).toContain('No se ha podido comprobar el código.');
    });

    it('tries again with Enter too', async () => {
      await render();
      await type('482915');
      httpTesting.expectOne(signIn).flush(null, { status: 500, statusText: 'Error' });
      await pass();

      element()
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { cancelable: true }));
      await pass();

      httpTesting.expectOne(signIn).flush({ signedIn: true });
    });

    it('treats a refusal outside the contract as a failure', async () => {
      await render();

      await refuse('VALIDATION_FAILED');

      expect(alerts()).toEqual(['No se ha podido comprobar el código.']);
      expect(field().disabled).toBe(false);
    });

    it('waits out a limit of tries: nothing is checked until it is over', async () => {
      await render();
      await type('482915');
      httpTesting.expectOne(signIn).flush(errorBody('RATE_LIMITED'), {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '42' },
      });
      await pass();

      expect(alerts()).toEqual([
        'Hay demasiadas visitas desde tu red en este momento. Podrás probar de nuevo en 42 s.',
      ]);
      expect(button(/^Reintentar$/)).toBeUndefined();
      await type('48291');
      await type('482916');
      httpTesting.expectNone(signIn);

      await pass(42_000);
      expect(alerts()).toEqual([]);
      button(/^Reintentar$/)?.click();
      await pass();

      const request = httpTesting.expectOne(signIn);
      expect(request.request.body).toEqual({ email: 'ana@example.com', code: '482916' });
      request.flush({ signedIn: true });
    });
  });

  it('does not let the email be changed while a code is checked: its answer may sign in', async () => {
    await render();
    expect(button(/^Cambiar email$/)?.disabled).toBe(false);

    await type('482915');
    expect(button(/^Cambiar email$/)?.disabled).toBe(true);

    httpTesting.expectOne(signIn).flush(errorBody('WRONG_CODE', { attemptsLeft: 4 }), badRequest);
    await pass();
    expect(button(/^Cambiar email$/)?.disabled).toBe(false);
  });

  it('offers the spam hint and to change the email', async () => {
    await render();

    expect(element().textContent).toContain('¿No te llega? Revisa la carpeta de spam.');
    expect(element().textContent).toContain('¿Email mal escrito?');
    button(/^Cambiar email$/)?.click();

    expect(changeEmail).toBe(1);
  });

  it('never sends its form by a button: each one only does its own action', async () => {
    await render();

    for (const each of element().querySelectorAll('button')) {
      expect(each.type).toBe('button');
    }
  });
});

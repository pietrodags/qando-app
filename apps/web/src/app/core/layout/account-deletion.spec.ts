import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { literalValues } from '../../../styles/token-usage';
import { Toaster } from '../../shared/ui/toast';
import { ManagementTokens } from '../auth/management-tokens';
import { Session } from '../auth/session';
import { provideI18n } from '../i18n/provide-i18n';
import { AccountDeletion } from './account-deletion';
import deletionStyles from './account-deletion.scss' with { loader: 'text' };

@Component({ template: '' })
class Blank {}

const ana = { name: 'Ana', email: 'ana@example.com' };
const sendCode = { method: 'POST', url: '/api/me/deletion-code' };
const deletion = { method: 'POST', url: '/api/me/deletion' };

describe('AccountDeletion', () => {
  let fixture: ComponentFixture<AccountDeletion>;
  let httpTesting: HttpTestingController;
  let closings: number;

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no modal dialogs: these stand for the browser's, closing with a `close` event.
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    TestBed.configureTestingModule({
      imports: [AccountDeletion],
      providers: [
        provideI18n(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', component: Blank }]),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    closings = 0;
  });

  afterEach(() => {
    httpTesting.verify();
    vi.useRealTimers();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    localStorage.clear();
  });

  /** Lets time pass, then the answers, effects and rendering that follow. */
  async function pass(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    TestBed.inject(ApplicationRef).tick();
    fixture.detectChanges();
  }

  /** The dialog Ana opened from "Mis eventos", signed in since the app started. */
  async function render(): Promise<void> {
    TestBed.inject(Session);
    httpTesting.expectOne('/api/auth/session').flush(ana);
    await vi.advanceTimersByTimeAsync(0);
    await TestBed.inject(Router).navigateByUrl('/my-events');
    fixture = TestBed.createComponent(AccountDeletion);
    fixture.componentRef.setInput('email', 'ana@example.com');
    fixture.componentInstance.closed.subscribe(() => {
      closings += 1;
    });
    await pass();
  }

  function dialog(): HTMLDialogElement {
    return (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
  }

  function button(name: string): HTMLButtonElement {
    return [...dialog().querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent.trim() === name,
    )!;
  }

  function buttons(): string[] {
    return [...dialog().querySelectorAll('button')].map((each) => each.textContent.trim());
  }

  function texts(selector: string): string[] {
    return [...dialog().querySelectorAll(selector)].map((each) =>
      each.textContent.replace(/\s+/g, ' ').trim(),
    );
  }

  /** "Enviar código", answered with the code sent and a wait of `resendAfterSeconds`. */
  async function codeSent(resendAfterSeconds = 30): Promise<void> {
    button('Enviar código').click();
    await pass();
    httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds });
    await pass();
  }

  function field(): HTMLInputElement {
    return dialog().querySelector<HTMLInputElement>('input')!;
  }

  async function type(code: string): Promise<void> {
    field().value = code;
    field().dispatchEvent(new Event('input'));
    await pass();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(deletionStyles)).toEqual([]);
  });

  it('asks first: what goes with the account, and that a code will be sent to its email', async () => {
    await render();

    expect(dialog().hasAttribute('open')).toBe(true);
    expect(dialog().getAttribute('aria-label')).toBe('¿Eliminar tu cuenta?');
    expect(texts('h2')).toEqual(['¿Eliminar tu cuenta?']);
    expect(texts('.note')).toEqual([
      'Se eliminarán todos tus eventos, con sus fechas, votos y emails.',
      'Quien abra el enlace para votar o el de resultados verá que la página no existe.',
    ]);
    expect(dialog().querySelector('.note strong')?.textContent).toBe('todos tus eventos');
    expect(texts('.final')).toEqual([
      'Para confirmarlo, te enviaremos un código a ana@example.com.',
    ]);
    expect(dialog().querySelector('.final strong')?.textContent).toBe('ana@example.com');
    expect(buttons()).toEqual(['Volver', 'Enviar código']);
    expect(button('Enviar código').classList).toContain('danger');
  });

  it('closes with "Volver", sending nothing', async () => {
    await render();

    button('Volver').click();
    await pass();

    expect(closings).toBe(1);
    httpTesting.expectNone(sendCode);
  });

  it('sends the code, saying so on its button, then asks for it', async () => {
    await render();

    button('Enviar código').click();
    await pass();
    expect(button('Enviando…').disabled).toBe(true);
    httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds: 30 });
    await pass();

    expect(texts('h2')).toEqual(['Escribe el código']);
    expect(texts('.lead')).toEqual(['Te hemos enviado un código de 6 cifras a ana@example.com']);
    expect(texts('.hint')).toEqual(['Tu cuenta se eliminará al escribir la última cifra.']);
    expect(buttons()).toEqual(['Reenviar código en 30 s', 'Volver']);
    expect(document.activeElement).toBe(field());
    expect(closings).toBe(0);
  });

  it('sends nothing more while the code is on its way', async () => {
    await render();

    button('Enviar código').click();
    await pass();
    button('Enviando…').click();
    await pass();

    httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds: 30 });
  });

  it('says so when the code could not be sent, and sends it again', async () => {
    await render();

    button('Enviar código').click();
    await pass();
    httpTesting
      .expectOne(sendCode)
      .flush(
        { error: { code: 'CODE_NOT_DELIVERED', message: 'Not delivered', details: [] } },
        { status: 502, statusText: 'Bad Gateway' },
      );
    await pass();

    expect(texts('.failed')).toEqual(['No se ha podido enviar el código. Inténtalo de nuevo.']);
    expect(button('Enviar código').disabled).toBe(false);
    await codeSent();
    expect(texts('h2')).toEqual(['Escribe el código']);
  });

  it('closes with "Volver" on the code too', async () => {
    await render();
    await codeSent();

    button('Volver').click();
    await pass();

    expect(closings).toBe(1);
  });

  it('deletes the account with the last digit, opens the home page and says what went with it', async () => {
    await render();
    TestBed.inject(ManagementTokens).keep('k3Jd9', 'token-of-cena');
    await codeSent();

    await type('482913');
    expect(texts('.checking')).toEqual(['Eliminando…']);
    expect(button('Volver').disabled).toBe(true);
    const request = httpTesting.expectOne(deletion);
    expect(request.request.body).toEqual({ code: '482913' });
    // Nothing is said before the server has deleted it.
    expect(TestBed.inject(Toaster).message()).toBeNull();
    request.flush({ deleted: true, events: 2 });
    await pass();

    expect(TestBed.inject(Session).account()).toBeNull();
    expect(TestBed.inject(ManagementTokens).of('k3Jd9')).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/');
    expect(TestBed.inject(Toaster).message()).toBe('Se han eliminado tu cuenta y tus eventos.');
  });

  it('says only the account went when it had no events', async () => {
    await render();
    await codeSent();

    await type('482913');
    httpTesting.expectOne(deletion).flush({ deleted: true, events: 0 });
    await pass();

    expect(TestBed.inject(Toaster).message()).toBe('Se ha eliminado tu cuenta.');
  });

  it('keeps the account, and says so, when the code is wrong', async () => {
    await render();
    await codeSent();

    await type('482914');
    httpTesting
      .expectOne(deletion)
      .flush(
        { error: { code: 'WRONG_CODE', message: 'Wrong', details: [], attemptsLeft: 4 } },
        { status: 400, statusText: 'Bad Request' },
      );
    await pass();

    expect(texts('.error')).toContain('Código incorrecto. Te quedan 4 intentos.');
    expect(button('Volver').disabled).toBe(false);
    expect(TestBed.inject(Session).account()).toEqual(ana);
    expect(TestBed.inject(Router).url).toBe('/my-events');
    expect(TestBed.inject(Toaster).message()).toBeNull();
  });

  it('sends a new deletion code with "Reenviar código" once the wait is over', async () => {
    await render();
    await codeSent(30);

    await pass(30_000);
    button('Reenviar código').click();
    await pass();
    httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds: 45 });
    await pass();

    expect(buttons()).toContain('Reenviar código en 45 s');
  });
});

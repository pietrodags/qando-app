import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Session } from '../../core/auth/session';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { Toaster } from '../../shared/ui/toast';
import { type DateSelection, NO_DATES } from './date-selection';
import {
  type CodeWait,
  type CreatedEvent,
  type EventEnding,
  NO_ENDING,
  WizardFinish,
} from './wizard-finish';

// "Crear" by an organizer without a session, who is sent a code and types it in the step, and
// the signed-in organizer who is not the one creating.

const ana = { name: 'Ana', email: 'ana@example.com' };
const session = { method: 'GET', url: '/api/auth/session' };
const sendCode = { method: 'POST', url: '/api/auth/sign-in-code' };
const signIn = { method: 'POST', url: '/api/auth/sign-in' };
const signOut = { method: 'POST', url: '/api/auth/sign-out' };
const createRequest = { method: 'POST', url: '/api/events' };
const created = {
  participationId: 'uHuaiU4BzZfa7oUR2OC3QQ',
  resultsId: 'r3sUlTs4BzZfa7oUR2OC3QQ',
};
/** Saturday 28 November and Saturday 5 December 2026, whole days. */
const twoSaturdays: DateSelection = { ...NO_DATES, singles: ['2026-11-28', '2026-12-05'] };
/** Friday 20 November 2026, noon. */
const now = new Date(2026, 10, 20, 12).getTime();

/** Lets a settled request's promise chain run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('WizardFinish, "Crear" with a code', () => {
  let fixture: ComponentFixture<WizardFinish>;
  let httpTesting: HttpTestingController;
  let sending: boolean[];
  let createdEvents: CreatedEvent[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    TestBed.configureTestingModule({
      imports: [WizardFinish],
      providers: [
        provideI18n(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.useRealTimers();
    localStorage.clear();
    document.body.replaceChildren();
  });

  async function render({
    account = null,
    ending = NO_ENDING,
    code = null,
  }: {
    account?: typeof ana | null;
    ending?: EventEnding;
    code?: CodeWait | null;
  } = {}): Promise<void> {
    TestBed.inject(Session);
    httpTesting.expectOne(session).flush(account);
    await settle();
    fixture = TestBed.createComponent(WizardFinish);
    fixture.componentRef.setInput('details', { organizerName: 'Ana', title: 'Cena de verano' });
    fixture.componentRef.setInput('selection', twoSaturdays);
    fixture.componentRef.setInput('step', 3);
    fixture.componentRef.setInput('ending', ending);
    fixture.componentRef.setInput('sent', null);
    fixture.componentRef.setInput('code', code);
    sending = [];
    createdEvents = [];
    fixture.componentInstance.sending.subscribe((on) => sending.push(on));
    fixture.componentInstance.created.subscribe((event) => createdEvents.push(event));
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string {
    return element().querySelector(selector)?.textContent.trim().replace(/\s+/g, ' ') ?? 'none';
  }

  function buttonNamed(name: string): HTMLButtonElement | undefined {
    return Array.from(element().querySelectorAll('button')).find(
      (candidate) =>
        (candidate.getAttribute('aria-label') ?? candidate.textContent.trim()) === name,
    );
  }

  function button(name: string): HTMLButtonElement {
    const found = buttonNamed(name);
    if (!found) throw new Error(`No button ${name}`);
    return found;
  }

  function emailField(): HTMLInputElement | null {
    return element().querySelector<HTMLInputElement>('input[type="email"]');
  }

  function codeField(): HTMLInputElement {
    const found = element().querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]');
    if (!found) throw new Error('No code field');
    return found;
  }

  function alerts(): string[] {
    return Array.from(element().querySelectorAll('[role="alert"]'), (alert) =>
      alert.textContent.trim().replace(/\s+/g, ' '),
    );
  }

  /** Lets the answers, effects and rendering that follow run. */
  async function pass(): Promise<void> {
    await settle();
    await fixture.whenStable();
  }

  async function click(target: HTMLElement): Promise<void> {
    target.click();
    await pass();
  }

  async function typeEmail(value: string): Promise<void> {
    const field = emailField();
    if (!field) throw new Error('No email field');
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await pass();
  }

  async function typeCode(value: string): Promise<void> {
    codeField().value = value;
    codeField().dispatchEvent(new Event('input'));
    await pass();
  }

  function code(): CodeWait | null {
    return fixture.componentInstance.code();
  }

  function ending(): EventEnding {
    return fixture.componentInstance.ending();
  }

  /** "Crear" with this email typed, its code sent and answered. */
  async function codeSentTo(email: string): Promise<void> {
    await typeEmail(email);
    await click(button('Crear'));
    httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds: 30 });
    await pass();
  }

  describe('without a session', () => {
    it('asks for the email under its label, the code it will be sent told under it', async () => {
      await render();

      const field = emailField();
      expect(field?.labels?.[0]?.textContent.trim()).toBe(
        'Tu email, para recibir un resumen y los resultados.',
      );
      expect(field?.placeholder).toBe('tu@email.com');
      expect(field?.getAttribute('autocomplete')).toBe('email');
      const hint = element().querySelector('#event-email-hint');
      expect(hint?.textContent.trim()).toBe('Te enviaremos un código para confirmar tu email.');
      expect(field?.getAttribute('aria-describedby')).toBe('event-email-hint');
      expect(element().querySelector('.email')).toBeNull();
    });

    it('ends that line with "Privacidad y condiciones", left out of what describes the field', async () => {
      await render();

      const line = element().querySelector('#event-email-hint')?.parentElement;
      expect(line?.lastElementChild?.querySelector('a')?.textContent.trim()).toBe(
        'Privacidad y condiciones',
      );
      expect(element().querySelector('#event-email-hint app-privacy-link')).toBeNull();
    });

    it('keeps the email as it is typed, with what else the step asks', async () => {
      await render();

      await typeEmail('Ana@Example.com');

      expect(ending().email).toBe('Ana@Example.com');
    });

    it('opens with the email the page held', async () => {
      await render({ ending: { ...NO_ENDING, email: 'ana@exmaple.com' } });

      expect(emailField()?.value).toBe('ana@exmaple.com');
    });

    it.each([
      ['empty', ''],
      ['not an address', 'ana@'],
    ])(
      'sends nothing for an email %s and says so, the focus in the field, until it changes',
      async (_, typed) => {
        await render();
        await typeEmail(typed);

        await click(button('Crear'));

        httpTesting.expectNone(sendCode);
        expect(alerts()).toEqual(['Revisa el email: no parece una dirección completa.']);
        expect(element().querySelector('#event-email-hint')).toBeNull();
        expect(emailField()?.getAttribute('aria-invalid')).toBe('true');
        expect(emailField()?.getAttribute('aria-describedby')).toBe('event-email-error');
        expect(document.activeElement).toBe(emailField());
        expect(sending).toEqual([]);

        await typeEmail('ana@example.com');

        expect(alerts()).toEqual([]);
        expect(emailField()?.hasAttribute('aria-invalid')).toBe(false);
      },
    );

    it('sends a code to the email, trimmed and in lower case, and asks for it in the step', async () => {
      await render();
      await typeEmail(' Ana@Example.com ');

      await click(button('Crear'));
      const request = httpTesting.expectOne(sendCode);
      expect(request.request.body).toEqual({ email: 'ana@example.com' });
      expect(sending).toEqual([true]);
      request.flush({ sent: true, resendAfterSeconds: 30 });
      await pass();

      expect(sending).toEqual([true, false]);
      expect(code()).toEqual({
        email: 'ana@example.com',
        resendAt: now + 30_000,
        sessionExpired: false,
      });
      expect(text('h2')).toBe('Escribe el código');
      expect(text('.lead strong')).toBe('ana@example.com');
      expect(text('.hint')).toBe('Crearemos el evento al escribir la última cifra.');
      expect(element().querySelector('.expired')).toBeNull();
      // The code step has no arrows: "Cambiar email" is its way back.
      expect(buttonNamed('Crear')).toBeUndefined();
      expect(element().querySelector('.nav')).toBeNull();
      expect(document.activeElement).toBe(codeField());
      httpTesting.expectNone(createRequest);
    });

    it.each([
      [
        'could not be delivered',
        { error: { code: 'CODE_NOT_DELIVERED', message: 'x', details: [] } },
        { status: 502, statusText: 'Bad Gateway' },
        'No hemos podido enviarte el código. Inténtalo de nuevo.',
      ],
      [
        'was refused: too many codes',
        { error: { code: 'RATE_LIMITED', message: 'x', details: [] } },
        { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '720' } },
        'Has pedido demasiados códigos. Podrás pedir otro en 12 min.',
      ],
    ])('keeps the step and says so when the code %s', async (_, body, answer, said) => {
      await render();
      await typeEmail('ana@example.com');

      await click(button('Crear'));
      httpTesting.expectOne(sendCode).flush(body, answer);
      await pass();

      expect(code()).toBeNull();
      expect(emailField()?.value).toBe('ana@example.com');
      expect(alerts()).toEqual([said]);
      // Under the buttons, as the failure of the event itself.
      expect(element().querySelector('.nav + .failure')).not.toBeNull();
      expect(sending).toEqual([true, false]);
    });

    it('sends a code again with "Crear" once it could not be delivered', async () => {
      await render();
      await typeEmail('ana@example.com');
      await click(button('Crear'));
      httpTesting
        .expectOne(sendCode)
        .flush(
          { error: { code: 'CODE_NOT_DELIVERED', message: 'x', details: [] } },
          { status: 502, statusText: 'Bad Gateway' },
        );
      await pass();

      await click(button('Crear'));
      httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds: 30 });
      await pass();

      expect(code()?.email).toBe('ana@example.com');
    });

    it('sends nothing again to the same email while its limit of codes lasts', async () => {
      await render();
      await typeEmail('ana@example.com');
      await click(button('Crear'));
      httpTesting
        .expectOne(sendCode)
        .flush(
          { error: { code: 'RATE_LIMITED', message: 'x', details: [] } },
          { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '25' } },
        );
      await pass();

      await click(button('Crear'));

      httpTesting.expectNone(sendCode);
      expect(alerts()).toEqual(['Has pedido demasiados códigos. Podrás pedir otro en 25 s.']);
    });

    it('sends a code to another email at once after a limit of codes for the last one', async () => {
      await render();
      await typeEmail('ana@exmaple.com');
      await click(button('Crear'));
      httpTesting
        .expectOne(sendCode)
        .flush(
          { error: { code: 'RATE_LIMITED', message: 'x', details: [] } },
          { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '25' } },
        );
      await pass();

      // The limit was the other email's: said no more once the email changes.
      await typeEmail('ana@example.com');
      expect(alerts()).toEqual([]);
      await click(button('Crear'));

      const request = httpTesting.expectOne(sendCode);
      expect(request.request.body).toEqual({ email: 'ana@example.com' });
      request.flush({ sent: true, resendAfterSeconds: 30 });
      await pass();
      expect(code()?.email).toBe('ana@example.com');
    });

    it('signs in with the right code, naming a new account as step 1, then creates the event', async () => {
      await render();
      await codeSentTo('ana@example.com');

      await typeCode('482915');
      const check = httpTesting.expectOne(signIn);
      expect(check.request.body).toEqual({ email: 'ana@example.com', code: '482915', name: 'Ana' });
      check.flush({ signedIn: true });
      await pass();
      httpTesting.expectOne(session).flush(ana);
      await pass();

      // Back on the step, as signed in, while the event is on its way, the focus on "Crear".
      expect(code()).toBeNull();
      expect(text('.email')).toBe('ana@example.com');
      expect(document.activeElement).toBe(button('Crear'));
      expect(element().querySelector('.spinner')).not.toBeNull();
      const request = httpTesting.expectOne(createRequest);
      expect(request.request.body).toMatchObject({ title: 'Cena de verano', organizerName: 'Ana' });
      request.flush(created);
      await pass();

      expect(createdEvents).toEqual([
        { participationId: created.participationId, deadline: '2026-11-27' },
      ]);
    });

    it('creates the event once the session is read again, when reading it after the code failed', async () => {
      await render();
      await codeSentTo('ana@example.com');
      await typeCode('482915');
      httpTesting.expectOne(signIn).flush({ signedIn: true });
      await pass();

      httpTesting.expectOne(session).error(new ProgressEvent('error'));
      await pass();
      httpTesting.expectOne(session).flush(ana);
      await pass();

      httpTesting.expectNone(sendCode);
      httpTesting.expectOne(createRequest).flush(created);
      await pass();
      expect(createdEvents).toHaveLength(1);
    });

    it('comes back to the step with "Cambiar email", the email as typed and the focus in it', async () => {
      await render();
      await codeSentTo('ana@exmaple.com');

      await click(button('Cambiar email'));

      expect(code()).toBeNull();
      expect(emailField()?.value).toBe('ana@exmaple.com');
      expect(document.activeElement).toBe(emailField());
      expect(buttonNamed('Crear')).toBeDefined();
    });

    it('opens on the code the page held, with the seconds left to ask for another', async () => {
      await render({
        code: { email: 'ana@example.com', resendAt: now + 12_400, sessionExpired: false },
      });

      expect(text('h2')).toBe('Escribe el código');
      expect(text('.lead strong')).toBe('ana@example.com');
      expect(buttonNamed('Reenviar código en 13 s')).toBeDefined();
      expect(emailField()).toBeNull();
    });

    it('opens a code that may be asked again at once with the button on', async () => {
      await render({
        code: { email: 'ana@example.com', resendAt: now - 5_000, sessionExpired: false },
      });

      expect(buttonNamed('Reenviar código')?.disabled).toBe(false);
    });

    it('drops the code waited for once signed in another way', async () => {
      await render({
        code: { email: 'ana@example.com', resendAt: now, sessionExpired: false },
      });

      void TestBed.inject(Session).refresh();
      httpTesting.expectOne(session).flush(ana);
      await pass();

      expect(code()).toBeNull();
      expect(text('.email')).toBe('ana@example.com');
    });

    it('holds each new code sent from the code step for the page', async () => {
      await render({
        code: { email: 'ana@example.com', resendAt: now - 5_000, sessionExpired: false },
      });

      await click(button('Reenviar código'));
      httpTesting.expectOne(sendCode).flush({ sent: true, resendAfterSeconds: 30 });
      await pass();

      expect(code()).toEqual({
        email: 'ana@example.com',
        resendAt: now + 30_000,
        sessionExpired: false,
      });
    });
  });

  describe('with a session', () => {
    it('offers "¿No eres tú? Cerrar sesión" under the email', async () => {
      await render({ account: ana });

      expect(text('.not-you')).toBe('¿No eres tú? Cerrar sesión');
      expect(emailField()).toBeNull();
    });

    it('signs out with it, keeps the step and asks for the email, the focus in it', async () => {
      await render({ account: ana, ending: { ...NO_ENDING, note: 'Cenamos en casa de Marta.' } });
      fixture.componentInstance.sent.set({ token: 'tK3nAbCdEfGhIjKlMnOpQr', body: '{}' });

      await click(button('Cerrar sesión'));
      httpTesting.expectOne(signOut).flush({ signedOut: true });
      await pass();

      expect(emailField()?.value).toBe('');
      expect(document.activeElement).toBe(emailField());
      expect(ending()).toEqual({ ...NO_ENDING, note: 'Cenamos en casa de Marta.' });
      // The event sent before was the other account's: another one is sent next.
      expect(fixture.componentInstance.sent()).toBeNull();
      expect(TestBed.inject(Toaster).message()).toBe('Has cerrado sesión.');
    });

    it('says no more of an event that could not be created once signed out', async () => {
      await render({ account: ana });
      await click(button('Crear'));
      httpTesting.expectOne(createRequest).error(new ProgressEvent('error'));
      await pass();
      expect(alerts()).toEqual(['No se ha podido crear el evento. Inténtalo de nuevo.']);

      await click(button('Cerrar sesión'));
      httpTesting.expectOne(signOut).flush({ signedOut: true });
      await pass();

      expect(alerts()).toEqual([]);
    });

    it('stays signed in and says so when the session could not be ended', async () => {
      await render({ account: ana });

      await click(button('Cerrar sesión'));
      httpTesting.expectOne(signOut).flush(null, { status: 500, statusText: 'Server Error' });
      await pass();

      expect(text('.email')).toBe('ana@example.com');
      expect(TestBed.inject(Toaster).message()).toBe(
        'No se ha podido cerrar sesión. Inténtalo de nuevo.',
      );
    });

    it('says the event could not be created when a 401 leaves the session signed in', async () => {
      await render({ account: ana });

      await click(button('Crear'));
      httpTesting
        .expectOne(createRequest)
        .flush(
          { error: { code: 'UNAUTHENTICATED', message: 'x', details: [] } },
          { status: 401, statusText: 'Unauthorized' },
        );
      await pass();
      httpTesting.expectOne(session).flush(ana);
      await pass();

      httpTesting.expectNone(sendCode);
      expect(code()).toBeNull();
      expect(alerts()).toEqual(['No se ha podido crear el evento. Inténtalo de nuevo.']);
      expect(sending).toEqual([true, false]);
    });

    it('sends a code to its email when the session expired, and asks for it, saying so', async () => {
      await render({ account: ana });

      await click(button('Crear'));
      httpTesting
        .expectOne(createRequest)
        .flush(
          { error: { code: 'UNAUTHENTICATED', message: 'x', details: [] } },
          { status: 401, statusText: 'Unauthorized' },
        );
      await pass();
      // Still on its way while the session is read again: the other steps stay closed.
      expect(sending).toEqual([true]);
      httpTesting.expectOne(session).flush(null);
      await pass();
      const request = httpTesting.expectOne(sendCode);
      expect(request.request.body).toEqual({ email: 'ana@example.com' });
      request.flush({ sent: true, resendAfterSeconds: 30 });
      await pass();

      expect(code()).toEqual({
        email: 'ana@example.com',
        resendAt: now + 30_000,
        sessionExpired: true,
      });
      expect(text('h2')).toBe('Escribe el código');
      expect(ending().email).toBe('ana@example.com');
      // Said at once, as the cursor goes to the code's field.
      expect(alerts()).toEqual(['Tu sesión ha caducado.']);
      expect(sending).toEqual([true, false]);
    });

    it('shows the email field, the email in it, when the code for an expired session could not be sent', async () => {
      await render({ account: ana });

      await click(button('Crear'));
      httpTesting
        .expectOne(createRequest)
        .flush(
          { error: { code: 'UNAUTHENTICATED', message: 'x', details: [] } },
          { status: 401, statusText: 'Unauthorized' },
        );
      await pass();
      httpTesting.expectOne(session).flush(null);
      await pass();
      httpTesting
        .expectOne(sendCode)
        .flush(
          { error: { code: 'CODE_NOT_DELIVERED', message: 'x', details: [] } },
          { status: 502, statusText: 'Bad Gateway' },
        );
      await pass();

      expect(code()).toBeNull();
      expect(emailField()?.value).toBe('ana@example.com');
      expect(alerts()).toEqual(['No hemos podido enviarte el código. Inténtalo de nuevo.']);
    });
  });
});

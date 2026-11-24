import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef, Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { type CodeActions, CodeStep } from './code-step';
import stepStyles from './code-step.scss' with { loader: 'text' };

/** A promise its test settles when it chooses. */
interface Pending<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

function pending<T>(): Pending<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolved, rejected) => {
    resolve = resolved;
    reject = rejected;
  });
  return { promise, resolve, reject };
}

/** The API's answer `status` with an error body of `code`. */
function apiAnswer(status: number, code: string, extra: Record<string, unknown> = {}) {
  return new HttpErrorResponse({
    status,
    statusText: 'Error',
    error: { error: { code, message: 'x', details: [], ...extra } },
  });
}

/** What the step asked of its page: each code it used, each new code it asked for. */
let uses: { readonly code: string; readonly answer: Pending<undefined> }[];
let sends: Pending<number>[];

const actions: CodeActions = {
  use: (code) => {
    const answer = pending<undefined>();
    uses.push({ code, answer });
    return answer.promise;
  },
  send: () => {
    const answer = pending<number>();
    sends.push(answer);
    return answer.promise;
  },
};

/** A page that adds a line under the step. */
@Component({
  imports: [CodeStep],
  template: `
    <app-code-step
      email="ana@example.com"
      hintKey="signIn.code.hint"
      checkingKey="signIn.code.checking"
      [resendAfterSeconds]="30"
      [actions]="actions"
    >
      <p class="added">Lo que añade la página</p>
    </app-code-step>
  `,
})
class PageWithStep {
  protected readonly actions = actions;
}

describe('CodeStep', () => {
  let fixture: ComponentFixture<CodeStep>;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [CodeStep], providers: [provideI18n()] });
    uses = [];
    sends = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Lets time pass, then the answers, effects and rendering that follow. */
  async function pass(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    TestBed.inject(ApplicationRef).tick();
    fixture.detectChanges();
  }

  /** The step for ana@example.com, whose code was just sent, with the inputs given. */
  async function render(inputs: Partial<Record<string, unknown>> = {}): Promise<void> {
    fixture = TestBed.createComponent(CodeStep);
    const all: Record<string, unknown> = {
      email: 'ana@example.com',
      resendAfterSeconds: 30,
      actions,
      hintKey: 'signIn.code.hint',
      checkingKey: 'signIn.code.checking',
      ...inputs,
    };
    for (const [name, value] of Object.entries(all)) fixture.componentRef.setInput(name, value);
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

  function status(): string | undefined {
    return element().querySelector('[role="status"]')?.textContent.trim();
  }

  async function type(value: string): Promise<void> {
    field().value = value;
    field().dispatchEvent(new Event('input'));
    await pass();
  }

  /** Types 482915 and its use fails with `error`. */
  async function refuse(error: unknown): Promise<void> {
    await type('482915');
    uses[0]?.answer.reject(error);
    await pass();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(stepStyles)).toEqual([]);
  });

  describe('a complete code', () => {
    it('is used, with its 6 digits, once', async () => {
      await render();

      await type('48291');
      expect(uses).toEqual([]);
      await type('482915');

      expect(uses.map((use) => use.code)).toEqual(['482915']);
    });

    it('is being checked until its use ends, and still once it was right: the page may be leaving', async () => {
      await render();
      expect(fixture.componentInstance.checking()).toBe(false);

      await type('482915');
      expect(fixture.componentInstance.checking()).toBe(true);
      expect(status()).toBe('Comprobando…');

      uses[0]?.answer.resolve(undefined);
      await pass();

      expect(fixture.componentInstance.checking()).toBe(true);
      expect(status()).toBe('Comprobando…');
      expect(field().readOnly).toBe(true);
      expect(alerts()).toEqual([]);
    });

    it('is no longer being checked once refused', async () => {
      await render();

      await refuse(apiAnswer(400, 'WRONG_CODE', { attemptsLeft: 4 }));

      expect(fixture.componentInstance.checking()).toBe(false);
      expect(status()).toBeUndefined();
    });
  });

  describe('the refusal of a code', () => {
    it('reads a wrong code from a 400 answer, with the tries left', async () => {
      await render();

      await refuse(apiAnswer(400, 'WRONG_CODE', { attemptsLeft: 3 }));

      expect(alerts()).toEqual(['Código incorrecto. Te quedan 3 intentos.']);
      expect(field().value).toBe('482915');
      expect(field().disabled).toBe(false);
    });

    it.each([
      ['CODE_EXPIRED', 'El código ha caducado.'],
      ['TOO_MANY_ATTEMPTS', 'Demasiados intentos.'],
    ])('reads a void code from a 400 %s answer: the field goes off', async (code, message) => {
      await render();

      await refuse(apiAnswer(400, code));

      expect(alerts()).toEqual([message]);
      expect(field().value).toBe('');
      expect(field().disabled).toBe(true);
      expect(button(/^Enviar código nuevo/)).toBeDefined();
    });

    it.each([
      [
        'a wrong code answered with another status',
        apiAnswer(401, 'WRONG_CODE', { attemptsLeft: 3 }),
      ],
      ['a void code answered with another status', apiAnswer(403, 'CODE_EXPIRED')],
      ['a 400 answer outside the refusals', apiAnswer(400, 'VALIDATION_FAILED')],
      ['a 400 answer with no body', new HttpErrorResponse({ status: 400, statusText: 'Error' })],
      ['a failure that is no answer', new Error('offline')],
    ])('is not read from %s: the check went unanswered', async (_, error) => {
      await render();

      await refuse(error);

      expect(alerts()).toEqual(['No se ha podido comprobar el código.']);
      expect(field().disabled).toBe(false);
      expect(button(/^Reintentar$/)).toBeDefined();
    });
  });

  describe('a new code', () => {
    it('is asked of the page by "Reenviar código" once the wait is over, and its seconds start the wait again', async () => {
      await render({ resendAfterSeconds: 30 });

      expect(button(/^Reenviar código en 30 s$/)?.disabled).toBe(true);
      await pass(30_000);
      button(/^Reenviar código$/)?.click();
      await pass();
      expect(sends).toHaveLength(1);
      sends[0]?.resolve(45);
      await pass();

      expect(button(/^Reenviar código en 45 s$/)?.disabled).toBe(true);
      expect(document.activeElement).toBe(field());
    });
  });

  describe('the lines it shows', () => {
    it('tells under the field what its last digit does, as its page says', async () => {
      await render({ hintKey: 'signIn.code.createHint' });

      expect(element().querySelector('.hint')?.textContent.trim()).toBe(
        'Crearemos el evento al escribir la última cifra.',
      );
    });

    it('says what the check does, as its page says', async () => {
      await render({ checkingKey: 'common.loading' });

      await type('482915');

      expect(status()).toBe('Cargando…');
    });
  });

  describe('its heading', () => {
    it('is a second level one unless told otherwise', async () => {
      await render();

      expect(element().querySelector('h1')).toBeNull();
      expect(element().querySelector('h2')?.textContent.trim()).toBe('Escribe el código');
    });

    it('is the page’s own heading at level 1', async () => {
      await render({ headingLevel: 1 });

      expect(element().querySelector('h2')).toBeNull();
      expect(element().querySelector('h1')?.textContent.trim()).toBe('Escribe el código');
    });
  });

  describe('its look', () => {
    it('is a page’s unless told otherwise', async () => {
      await render();

      expect(element().classList.contains('dialog')).toBe(false);
    });

    it('is a page’s when told so', async () => {
      await render({ look: 'page' });

      expect(element().classList.contains('dialog')).toBe(false);
    });

    it('is a dialog’s when told so', async () => {
      await render({ look: 'dialog' });

      expect(element().classList.contains('dialog')).toBe(true);
    });
  });

  it('shows what its page adds after the spam line', async () => {
    const page = TestBed.createComponent(PageWithStep);
    await vi.advanceTimersByTimeAsync(0);
    page.detectChanges();

    const added = (page.nativeElement as HTMLElement).querySelector('.more > .added');
    expect(added?.textContent).toBe('Lo que añade la página');
    expect(added?.previousElementSibling?.textContent.trim()).toBe(
      '¿No te llega? Revisa la carpeta de spam.',
    );
    expect(added?.nextElementSibling).toBeNull();
  });
});

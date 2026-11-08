import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ManagedEvent, Option } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { EventManagement } from './event-management';
import { ManagePage } from './manage-page';
import pageStyles from './manage-page.scss' with { loader: 'text' };

const TOKEN = 'Zx81aB2cD4eF6gH8iJ0kLm';

function day(date: string, n: number): Option {
  return {
    id: `6f1c2a0e-0000-4000-8000-00000000000${String(n)}`,
    dates: { kind: 'single', date },
    time: null,
  };
}

const july6 = day('2026-07-06', 1);
const july10 = day('2026-07-10', 2);

const cena: ManagedEvent = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  state: 'closed',
  options: [july6, july10],
  confirmedOption: null,
  voters: 2,
  recommendedOptionIds: [july10.id],
  participationId: 'k3Jd9aB2cD4eF6gH8iJ0kL',
  resultsId: 'Qw7p2aB2cD4eF6gH8iJ0kL',
};
const confirmed: ManagedEvent = {
  ...cena,
  state: 'confirmed',
  confirmedOption: july10,
  recommendedOptionIds: [],
};

const managed = '/api/events/k3Jd9';
const confirmation = '/api/events/k3Jd9/confirmation';

function errorBody(code: string, extra: object = {}) {
  return { error: { code, message: code, details: [], ...extra } };
}

/** Lets a settled request's promise chain reach the next request. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('ManagePage', () => {
  let httpTesting: HttpTestingController;
  let fixture: ComponentFixture<ManagePage>;

  // jsdom has no modal dialogs: these stand for the browser's, closing with a `close` event.
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ManagePage],
      providers: [
        provideI18n(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    TestBed.inject(EventManagement).claim('k3Jd9', TOKEN);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });

  function render(): ComponentFixture<ManagePage> {
    fixture = TestBed.createComponent(ManagePage);
    fixture.componentRef.setInput('eventId', 'k3Jd9');
    TestBed.tick();
    return fixture;
  }

  async function update(): Promise<void> {
    await settle();
    await fixture.whenStable();
  }

  async function opened(event: ManagedEvent): Promise<void> {
    render();
    const read = httpTesting.expectOne(managed);
    expect(read.request.headers.get('x-management-token')).toBe(TOKEN);
    read.flush(event);
    await update();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string | undefined {
    return element().querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim();
  }

  function confirmButton(): HTMLButtonElement {
    return element().querySelector<HTMLButtonElement>('button.confirm')!;
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(pageStyles)).toEqual([]);
  });

  it('says it is loading while it reads the event', () => {
    render();

    expect(element().querySelector('app-loading-state')).not.toBeNull();
    httpTesting.expectOne(managed);
  });

  it('shows the event to manage: title, state, final date and links', async () => {
    await opened({ ...cena, state: 'open' });

    expect(text('.corner')).toBe('gestión');
    expect(text('h1')).toBe('Cena de verano');
    expect(text('.state')).toBe(
      'Votación abierta hasta el 1 de julio de 2026 · Han votado 2 personas',
    );
    expect(element().querySelector('app-final-date')).not.toBeNull();
    expect(element().querySelector('app-event-links')).not.toBeNull();
    expect(text('app-final-date [role="status"]')).toBe('');
    expect(confirmButton().disabled).toBe(false);
  });

  it.each([
    [
      { state: 'closed', voters: 1 },
      'Votación cerrada el 1 de julio de 2026 · Ha votado 1 persona',
    ],
    [
      { state: 'open', voters: 0 },
      'Votación abierta hasta el 1 de julio de 2026 · Nadie ha votado todavía',
    ],
    [{ state: 'confirmed', voters: 2 }, 'Votación cerrada · Han votado 2 personas'],
  ] as const)('tells the state %o', async (facts, expected) => {
    await opened({ ...cena, ...facts });

    expect(text('.state')).toBe(expected);
  });

  it('refuses a browser whose link does not manage the event', async () => {
    render();
    httpTesting
      .expectOne(managed)
      .flush(errorBody('FORBIDDEN'), { status: 403, statusText: 'Forbidden' });
    await update();

    expect(text('.refused h1')).toBe('No tienes acceso a este evento');
    expect(text('.refused p')).toBe(
      'Para gestionarlo, abre el enlace de gestión completo que recibiste al crear el evento.',
    );
    expect(document.activeElement).toBe(element().querySelector('.refused h1'));
    expect(element().querySelector('app-final-date')).toBeNull();
  });

  it('tells a cancelled event under its kept title', async () => {
    render();
    httpTesting
      .expectOne(managed)
      .flush(errorBody('EVENT_CANCELLED', { title: 'Cena de verano' }), {
        status: 410,
        statusText: 'Gone',
      });
    await update();

    expect(text('app-vote-ended h1')).toBe('Cena de verano');
    expect(text('app-vote-ended h2')).toBe('Evento cancelado');
  });

  it('offers to try again when the event could not be read', async () => {
    render();
    httpTesting.expectOne(managed).flush(null, { status: 500, statusText: 'Error' });
    await update();

    element().querySelector<HTMLButtonElement>('app-error-state button')!.click();
    TestBed.tick();
    httpTesting.expectOne(managed).flush(cena);
    await update();

    expect(text('h1')).toBe('Cena de verano');
  });

  it('confirms the chosen date and shows it confirmed', async () => {
    await opened(cena);

    confirmButton().click();
    await fixture.whenStable();
    const request = httpTesting.expectOne(confirmation);
    expect(request.request.body).toEqual({ optionId: july10.id });
    expect(confirmButton().textContent.trim()).toBe('Confirmando…');
    request.flush(confirmed);
    await update();

    expect(text('.confirmed h2')).toBe('Fecha confirmada');
    expect(text('.state')).toBe('Votación cerrada · Han votado 2 personas');
  });

  it('says when the confirmation did not get through, and tries again', async () => {
    await opened(cena);

    confirmButton().click();
    httpTesting.expectOne(confirmation).flush(null, { status: 500, statusText: 'Error' });
    await update();
    expect(text('app-final-date [role="status"]')).toBe(
      'No se ha podido confirmar la fecha. Inténtalo de nuevo.',
    );
    expect(confirmButton().disabled).toBe(false);

    confirmButton().click();
    await fixture.whenStable();
    expect(text('app-final-date [role="status"]')).toBe('');
    httpTesting.expectOne(confirmation).flush(confirmed);
    await update();

    expect(text('.confirmed h2')).toBe('Fecha confirmada');
  });

  it('shows the date confirmed meanwhile when another was confirmed first', async () => {
    await opened(cena);
    // July 6 chosen, but July 10 was confirmed meanwhile (another tab).
    element().querySelectorAll<HTMLInputElement>('input[type="radio"]')[0]!.click();
    await fixture.whenStable();
    confirmButton().click();
    await fixture.whenStable();
    element().querySelectorAll<HTMLButtonElement>('dialog button')[1]!.click();
    await fixture.whenStable();

    httpTesting
      .expectOne(confirmation)
      .flush(errorBody('ALREADY_CONFIRMED'), { status: 409, statusText: 'Conflict' });
    await update();
    httpTesting.expectOne(managed).flush(confirmed);
    await update();

    expect(text('.confirmed .date')).toBe('viernes 10 de julio de 2026');
  });

  it('ignores a confirmation answered after the page moved to another event', async () => {
    await opened(cena);
    confirmButton().click();
    const pending = httpTesting.expectOne(confirmation);

    fixture.componentRef.setInput('eventId', 'Re0YV');
    TestBed.tick();
    httpTesting.expectOne('/api/events/Re0YV').flush({ ...cena, title: 'Café' });
    await update();
    pending.flush(confirmed);
    await update();

    expect(text('h1')).toBe('Café');
    expect(element().querySelector('.confirmed')).toBeNull();
    expect(confirmButton().disabled).toBe(false);
  });

  it('reads the event again when this page takes a new management link', async () => {
    render();
    httpTesting
      .expectOne(managed)
      .flush(errorBody('FORBIDDEN'), { status: 403, statusText: 'Forbidden' });
    await update();

    TestBed.inject(EventManagement).claim('k3Jd9', 'Ab12aB2cD4eF6gH8iJ0kLm');
    TestBed.tick();
    const reread = httpTesting.expectOne(managed);
    expect(reread.request.headers.get('x-management-token')).toBe('Ab12aB2cD4eF6gH8iJ0kLm');
    reread.flush(cena);
    await update();

    expect(text('h1')).toBe('Cena de verano');
  });

  it('turns refused when the link no longer manages the event', async () => {
    await opened(cena);

    confirmButton().click();
    httpTesting
      .expectOne(confirmation)
      .flush(errorBody('FORBIDDEN'), { status: 403, statusText: 'Forbidden' });
    await update();

    expect(text('.refused h1')).toBe('No tienes acceso a este evento');
  });
});

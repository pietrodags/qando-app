import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
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
  emails: [],
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

const rateLimited = errorBody('RATE_LIMITED');
const limitedFor42 = {
  status: 429,
  statusText: 'Too Many Requests',
  headers: { 'Retry-After': '42' },
};

describe('ManagePage', () => {
  let httpTesting: HttpTestingController;
  // The page alone, or the routed page that holds it.
  let fixture: ComponentFixture<unknown>;

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
    const page = TestBed.createComponent(ManagePage);
    fixture = page;
    page.componentRef.setInput('eventId', 'k3Jd9');
    TestBed.tick();
    return page;
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
    expect(text('app-final-date .outcome[role="status"]')).toBe('');
    expect(confirmButton().disabled).toBe(false);
  });

  it('shows the emails after the links, and the event as the emails hand it back', async () => {
    await opened({ ...cena, state: 'open', emails: [{ type: 'summary', status: 'failed' }] });
    vi.useFakeTimers();

    const card = [...element().querySelectorAll('.card > *')];
    expect(card.slice(-3).map((child) => child.tagName.toLowerCase())).toEqual([
      'app-event-links',
      'app-event-emails',
      'app-cancel-event',
    ]);
    element().querySelector<HTMLButtonElement>('app-event-emails li button')!.click();
    httpTesting
      .expectOne(`${managed}/emails/summary/retry`)
      .flush({ type: 'summary', status: 'pending' });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(text('app-event-emails li')).toBe('Resumen del evento Enviando…');
    // Being sent: the emails read the event again 10 seconds later.
    await vi.advanceTimersByTimeAsync(10_000);
    httpTesting.expectOne(managed).flush({
      ...cena,
      state: 'open',
      voters: 3,
      emails: [{ type: 'summary', status: 'sent', sentAt: '2026-06-20T08:00:00.000Z' }],
    });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    vi.useRealTimers();

    expect(text('.state')).toBe(
      'Votación abierta hasta el 1 de julio de 2026 · Han votado 3 personas',
    );
    expect(text('app-event-emails li')).toBe(
      'Resumen del evento Enviado el 20 de junio de 2026 a las 10:00',
    );
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
      'Para gestionarlo, abre el enlace de gestión completo que recibiste al crear el evento. Los eventos se borran 6 meses después de su fecha.',
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
    expectTextToForward('Se ha cancelado "Cena de verano".');
  });

  /** The cancelled card's message for the group, with the share row that sends it alone. */
  function expectTextToForward(message: string): void {
    expect(text('app-vote-ended .lead')).toBe('Avisa al grupo con este mensaje:');
    expect(text('app-vote-ended .forward')).toBe(message);
    const whatsapp = element().querySelector('app-vote-ended app-share-links a[title="WhatsApp"]');
    expect(whatsapp?.getAttribute('href')).toBe(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
    );
    expect(
      element().querySelector('app-vote-ended app-share-links button[title="Copiar mensaje"]'),
    ).not.toBeNull();
  }

  it.each(['open', 'closed', 'confirmed'] as const)(
    'offers to cancel the event last, also when %s',
    async (state) => {
      await opened({
        ...cena,
        state,
        confirmedOption: state === 'confirmed' ? cena.options[0]! : null,
      });

      const card = element().querySelector('article.card');
      expect(card?.lastElementChild?.tagName.toLowerCase()).toBe('app-cancel-event');
      expect(text('app-cancel-event button.cancel')).toBe('Cancelar evento');
    },
  );

  it('shows the event cancelled once the organizer cancels it, with the text to forward', async () => {
    await opened(cena);

    element().querySelector<HTMLButtonElement>('app-cancel-event button.cancel')!.click();
    await fixture.whenStable();
    [...element().querySelectorAll<HTMLButtonElement>('dialog button')]
      .find((button) => button.textContent.trim() === 'Cancelar evento')!
      .click();
    await fixture.whenStable();
    const cancelling = httpTesting.expectOne(managed);
    expect(cancelling.request.method).toBe('DELETE');
    cancelling.flush({ title: 'Cena de verano' });
    await update();

    expect(element().querySelector('article.card')).toBeNull();
    expect(text('app-vote-ended h1')).toBe('Cena de verano');
    expect(text('app-vote-ended h2')).toBe('Evento cancelado');
    expectTextToForward('Se ha cancelado "Cena de verano".');
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

  it('says to wait when the API limits the requests, counting the seconds on the retry', async () => {
    render();
    httpTesting.expectOne(managed).flush(rateLimited, limitedFor42);
    await update();

    expect(text('app-error-state [role="alert"]')).toBe(
      'Hay demasiadas visitas desde tu red en este momento.',
    );
    expect(text('app-error-state button')).toBe('Reintentar en 42 s');
    expect(element().querySelector<HTMLButtonElement>('app-error-state button')?.disabled).toBe(
      true,
    );
  });

  it('holds the confirmation while the API limits the requests, saying for how long', async () => {
    await opened(cena);

    confirmButton().click();
    httpTesting.expectOne(confirmation).flush(rateLimited, limitedFor42);
    await update();

    expect(text('app-final-date .wait')).toBe(
      'Hay demasiadas visitas desde tu red en este momento.',
    );
    expect(confirmButton().textContent.trim()).toBe('Confirmar fecha en 42 s');
    expect(confirmButton().disabled).toBe(true);
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
    expect(text('app-final-date .outcome[role="status"]')).toBe(
      'No se ha podido confirmar la fecha. Inténtalo de nuevo.',
    );
    expect(confirmButton().disabled).toBe(false);

    confirmButton().click();
    await fixture.whenStable();
    expect(text('app-final-date .outcome[role="status"]')).toBe('');
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

  it('shows the new options and says why when the options changed before the confirmation', async () => {
    const july11 = {
      id: '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c21',
      dates: { kind: 'single', date: '2026-07-11' },
      time: null,
    } as const;
    const replaced: ManagedEvent = {
      ...cena,
      state: 'open',
      options: [july11],
      voters: 0,
      recommendedOptionIds: [],
    };
    await opened(cena);
    confirmButton().click();
    await fixture.whenStable();

    httpTesting
      .expectOne(confirmation)
      .flush(errorBody('OPTIONS_CHANGED'), { status: 409, statusText: 'Conflict' });
    await update();
    httpTesting.expectOne(managed).flush(replaced);
    await update();

    expect(text('app-final-date app-notice-box')).toBe(
      'No se ha confirmado la fecha: las opciones han cambiado desde otra pestaña o dispositivo. Elige de nuevo entre las de ahora.',
    );
    expect(text('app-final-date .option .label')).toBe('sábado 11 de julio');
    expect(element().querySelector('.confirmed')).toBeNull();

    element().querySelector<HTMLInputElement>('input[type="radio"]')!.click();
    await fixture.whenStable();
    confirmButton().click();
    await fixture.whenStable();
    element().querySelectorAll<HTMLButtonElement>('dialog button')[1]!.click();
    await fixture.whenStable();
    // The box goes as the next confirmation is sent.
    expect(element().querySelector('app-final-date app-notice-box')).toBeNull();
    httpTesting.expectOne(confirmation).flush({ ...confirmed, confirmedOption: july11 });
    await update();
  });

  it('does not carry a notice over to the next event', async () => {
    await opened(cena);
    confirmButton().click();
    httpTesting
      .expectOne(confirmation)
      .flush(errorBody('OPTIONS_CHANGED'), { status: 409, statusText: 'Conflict' });
    await update();
    httpTesting.expectOne(managed).flush(cena);
    await update();

    fixture.componentRef.setInput('eventId', 'Re0YV');
    TestBed.tick();
    httpTesting.expectOne('/api/events/Re0YV').flush({ ...cena, title: 'Café' });
    await update();

    expect(text('h1')).toBe('Café');
    expect(element().querySelector('app-final-date app-notice-box')).toBeNull();
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

  it('lets the next event be confirmed while the last one’s confirmation is on its way', async () => {
    await opened(cena);
    confirmButton().click();
    const pending = httpTesting.expectOne(confirmation);

    fixture.componentRef.setInput('eventId', 'Re0YV');
    TestBed.tick();
    httpTesting.expectOne('/api/events/Re0YV').flush({ ...cena, title: 'Café' });
    await update();

    expect(text('h1')).toBe('Café');
    expect(confirmButton().disabled).toBe(false);
    expect(confirmButton().textContent.trim()).toBe('Confirmar fecha');
    pending.flush(confirmed);
    await update();
  });

  it('keeps the next event’s own confirmation on its way when the last one’s answer arrives', async () => {
    await opened(cena);
    confirmButton().click();
    const first = httpTesting.expectOne(confirmation);
    fixture.componentRef.setInput('eventId', 'Re0YV');
    TestBed.tick();
    httpTesting.expectOne('/api/events/Re0YV').flush({ ...cena, title: 'Café' });
    await update();
    confirmButton().click();
    const second = httpTesting.expectOne('/api/events/Re0YV/confirmation');

    first.flush(confirmed);
    await update();

    expect(confirmButton().textContent.trim()).toBe('Confirmando…');
    second.flush({ ...confirmed, title: 'Café' });
    await update();
  });

  it('does not carry a failed confirmation over to the next event', async () => {
    await opened(cena);
    confirmButton().click();
    httpTesting.expectOne(confirmation).flush(null, { status: 500, statusText: 'Error' });
    await update();

    fixture.componentRef.setInput('eventId', 'Re0YV');
    TestBed.tick();
    httpTesting.expectOne('/api/events/Re0YV').flush({ ...cena, title: 'Café' });
    await update();

    expect(text('app-final-date .outcome[role="status"]')).toBe('');
  });

  it('says nothing of a failed confirmation of the event the page moved away from', async () => {
    await opened(cena);
    confirmButton().click();
    const pending = httpTesting.expectOne(confirmation);

    fixture.componentRef.setInput('eventId', 'Re0YV');
    TestBed.tick();
    httpTesting.expectOne('/api/events/Re0YV').flush({ ...cena, title: 'Café' });
    await update();
    pending.flush(null, { status: 500, statusText: 'Error' });
    await update();

    expect(text('h1')).toBe('Café');
    expect(text('app-final-date .outcome[role="status"]')).toBe('');
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

  describe('without a stored management link or a live session', () => {
    /** The management route of the event, its page. */
    @Component({ imports: [ManagePage], template: '<app-manage-page eventId="k3Jd9" />' })
    class ManageRoute {}

    @Component({ template: '' })
    class Elsewhere {}

    function router(): Router {
      return TestBed.inject(Router);
    }

    /** The event's management page, opened from "Mis eventos"; the API answers its read. */
    async function openFromMyEvents(
      answer: [body: object, init: { status: number; statusText: string }],
    ): Promise<void> {
      router().resetConfig([
        { path: 'manage/k3Jd9', component: ManageRoute },
        { path: '**', component: Elsewhere },
      ]);
      const harness = await RouterTestingHarness.create('/my-events');
      fixture = harness.fixture;
      // As the app does when it starts: the browser's back and forward move the router.
      router().setUpLocationChangeListener();
      await router().navigateByUrl('/manage/k3Jd9');
      TestBed.tick();
      httpTesting.expectOne(managed).flush(...answer);
      await update();
    }

    const unauthenticated = [
      errorBody('UNAUTHENTICATED'),
      { status: 401, statusText: 'Unauthorized' },
    ] as const;
    const signInHere = `/sign-in?returnTo=${encodeURIComponent('/manage/k3Jd9')}`;

    it('asks to sign in, to come back to the event, in place of the page in the history', async () => {
      await openFromMyEvents([...unauthenticated]);

      expect(router().url).toBe(signInHere);
      TestBed.inject(Location).back();
      await update();
      expect(router().url).toBe('/my-events');
    });

    it('asks to sign in when the session ends while the page is open', async () => {
      await openFromMyEvents([cena, { status: 200, statusText: 'OK' }]);

      confirmButton().click();
      httpTesting.expectOne(confirmation).flush(...unauthenticated);
      await update();

      expect(router().url).toBe(signInHere);
    });

    it('stays on the event, refused, when a credential does not manage it', async () => {
      await openFromMyEvents([errorBody('FORBIDDEN'), { status: 403, statusText: 'Forbidden' }]);

      expect(router().url).toBe('/manage/k3Jd9');
      expect(text('.refused h1')).toBe('No tienes acceso a este evento');
    });
  });

  describe('opened from the options editor, which could not save them', () => {
    /** The management route: the page, of the event the address names. */
    @Component({ imports: [ManagePage], template: '<app-manage-page [eventId]="eventId()" />' })
    class ManageRoute {
      readonly eventId = signal('k3Jd9');
    }

    @Component({ template: '' })
    class Elsewhere {}

    let harness: RouterTestingHarness;

    function router(): Router {
      return TestBed.inject(Router);
    }

    function routes(): void {
      router().resetConfig([
        { path: 'manage', component: ManageRoute },
        { path: '**', component: Elsewhere },
      ]);
    }

    /**
     * The editor sends the organizer back here, saying why the options were not saved; without a
     * state, another page of the app opens it.
     */
    async function arrive(state?: Record<string, unknown>): Promise<void> {
      routes();
      harness = await RouterTestingHarness.create('/editor');
      fixture = harness.fixture;
      await router().navigateByUrl(
        '/manage',
        state === undefined ? {} : { replaceUrl: true, state },
      );
      TestBed.tick();
      httpTesting.expectOne(managed).flush({ ...cena, state: 'open', voters: 1 });
      await update();
    }

    function notice(): string | undefined {
      return text('app-final-date app-notice-box');
    }

    it.each([
      [
        'votedMeanwhile',
        'No se han guardado tus cambios: alguien ha votado mientras editabas, y con votos las opciones ya no se pueden cambiar.',
      ],
      [
        'optionsOutdated',
        'No se han guardado tus cambios: las opciones se cambiaron antes desde otra pestaña o dispositivo. Estas son las de ahora.',
      ],
    ])('says why (%s) at the top of the final date, its section open', async (why, said) => {
      await arrive({ notice: why });

      expect(notice()).toBe(said);
      expect(
        element()
          .querySelector('app-final-date app-manage-section h2 > button')
          ?.getAttribute('aria-expanded'),
      ).toBe('true');
    });

    it('says nothing when another page of the app opens it', async () => {
      await arrive();

      expect(text('.title')).toBe('Cena de verano');
      expect(notice()).toBeUndefined();
    });

    it('says nothing of anything else a navigation carries', async () => {
      await arrive({ notice: 'somethingElse' });

      expect(notice()).toBeUndefined();
    });

    it('says nothing when the page opens with the app, as on a reload, which brings the last state back', async () => {
      routes();
      harness = await RouterTestingHarness.create();
      fixture = harness.fixture;
      await router().navigateByUrl('/manage', { state: { notice: 'votedMeanwhile' } });
      TestBed.tick();
      httpTesting.expectOne(managed).flush(cena);
      await update();

      expect(text('.title')).toBe('Cena de verano');
      expect(notice()).toBeUndefined();
    });

    it('says nothing when the organizer comes back to it through the history', async () => {
      await arrive({ notice: 'votedMeanwhile' });
      // As the app does when it starts: the browser's back and forward move the router.
      router().setUpLocationChangeListener();
      await router().navigateByUrl('/results');
      await update();

      TestBed.inject(Location).back();
      await settle();
      TestBed.tick();
      httpTesting.expectOne(managed).flush(cena);
      await update();

      expect(router().url).toBe('/manage');
      expect(text('.title')).toBe('Cena de verano');
      expect(notice()).toBeUndefined();
    });

    it('does not carry it over to the next event', async () => {
      await arrive({ notice: 'votedMeanwhile' });

      (harness.routeDebugElement?.componentInstance as ManageRoute).eventId.set('Zz9');
      TestBed.tick();
      httpTesting.expectOne('/api/events/Zz9').flush(cena);
      await update();

      expect(text('.title')).toBe('Cena de verano');
      expect(notice()).toBeUndefined();
    });
  });
});

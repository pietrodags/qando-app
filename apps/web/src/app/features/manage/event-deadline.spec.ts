import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ManagedEvent } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { Toaster } from '../../shared/ui/toast';
import { literalValues } from '../../../styles/token-usage';
import { EventDeadline } from './event-deadline';
import { EventManagement, type Management } from './event-management';
import deadlineStyles from './event-deadline.scss' with { loader: 'text' };

const TOKEN = 'Zx81aB2cD4eF6gH8iJ0kLm';
const deadlineChange = '/api/events/k3Jd9/deadline';
const closing = '/api/events/k3Jd9/close';
const dec5 = '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11';
const dec12 = '1c8d3a7f-4b63-4054-8e2f-7a1f3c0b2d22';

/** Voting open until Tuesday 1 December; the first date is Saturday 5 December. */
const cena: ManagedEvent = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-12-01',
  state: 'open',
  options: [
    { id: dec5, dates: { kind: 'single', date: '2026-12-05' }, time: null },
    { id: dec12, dates: { kind: 'single', date: '2026-12-12' }, time: null },
  ],
  confirmedOption: null,
  voters: 4,
  recommendedOptionIds: [dec5],
  participationId: 'k3Jd9aB2cD4eF6gH8iJ0kL',
  resultsId: 'Qw7p2aB2cD4eF6gH8iJ0kL',
  emails: [],
};
const closedToday: ManagedEvent = { ...cena, state: 'closed', deadline: '2026-11-22' };

@Component({
  imports: [EventDeadline],
  template: `
    <app-event-deadline [eventId]="eventId()" [event]="event()" (changed)="take($event)" />
  `,
})
class Host {
  readonly eventId = signal('k3Jd9');
  readonly event = signal<ManagedEvent>(cena);
  readonly changes: Management[] = [];

  /** As the page does: it shows the event as it comes back. */
  take(change: Management): void {
    this.changes.push(change);
    if (change.kind === 'managed') this.event.set(change.event);
  }
}

type Part = 'Día' | 'Mes' | 'Año';

/** Lets a settled request's promise chain reach the page. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('EventDeadline', () => {
  let httpTesting: HttpTestingController;
  let fixture: ComponentFixture<Host>;

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
    // Sunday 22 November 2026, midday in Madrid.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-22T11:00:00Z'));
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideI18n(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.useRealTimers();
    localStorage.clear();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });

  /** The section as the page shows it, opened by the organizer unless told not to. */
  async function render(event: ManagedEvent = cena, { open = true } = {}): Promise<void> {
    // The management link this browser opened: its token goes with every request.
    TestBed.inject(EventManagement).claim('k3Jd9', TOKEN);
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.event.set(event);
    await fixture.whenStable();
    if (open) {
      toggle()?.click();
      await fixture.whenStable();
    }
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(node: Element | null | undefined): string {
    return node?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  }

  function toggle(): HTMLButtonElement | null {
    return element().querySelector('button[aria-expanded]');
  }

  function help(): string {
    return text(element().querySelector('.help'));
  }

  function select(part: Part): HTMLSelectElement {
    const found = element().querySelector<HTMLSelectElement>(`select[aria-label="${part}"]`);
    if (!found) throw new Error(`No select "${part}"`);
    return found;
  }

  /** The three selects as they read: "1 diciembre 2026". */
  function reading(): string {
    return (['Día', 'Mes', 'Año'] as const)
      .map((part) => text(select(part).selectedOptions[0]))
      .join(' ');
  }

  /** An option chosen in a select, by its value, as the browser does it. */
  async function choose(part: Part, value: string): Promise<void> {
    const chosen = select(part);
    chosen.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    chosen.value = value;
    chosen.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  /** The section's own buttons, by what they read, out of the question. */
  function buttons(): HTMLButtonElement[] {
    return [...element().querySelectorAll<HTMLButtonElement>('.actions button')];
  }

  function button(name: string): HTMLButtonElement {
    const found = buttons().find((candidate) => text(candidate) === name);
    if (found === undefined) throw new Error(`No button "${name}"`);
    return found;
  }

  async function press(name: string): Promise<void> {
    button(name).click();
    await fixture.whenStable();
  }

  function failure(): string {
    return text(element().querySelector('.failed'));
  }

  function warning(): string {
    return text(element().querySelector('.warning'));
  }

  function toast(): string | null {
    return TestBed.inject(Toaster).message();
  }

  function dialog(): HTMLDialogElement | null {
    return element().querySelector('dialog');
  }

  function answer(name: string): HTMLButtonElement {
    const found = [...(dialog()?.querySelectorAll('button') ?? [])].find(
      (candidate) => text(candidate) === name,
    );
    if (found === undefined) throw new Error(`No answer "${name}"`);
    return found;
  }

  /** "Cerrar votación", then the question's own "Cerrar votación". */
  async function closeVoting(): Promise<void> {
    await press('Cerrar votación');
    answer('Cerrar votación').click();
    await fixture.whenStable();
  }

  async function answerWith(url: string, body: object | null, status = 200): Promise<void> {
    httpTesting
      .expectOne(url)
      .flush(body, status === 200 ? {} : { status, statusText: String(status) });
    await settle();
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(deadlineStyles)).toEqual([]);
  });

  it('is a section "Plazo de votación", closed as the page opens', async () => {
    await render(cena, { open: false });

    expect(text(toggle())).toBe('Plazo de votación');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows nothing once a date is confirmed: the deadline can no longer change', async () => {
    await render(
      { ...cena, state: 'confirmed', confirmedOption: cena.options[0]! },
      { open: false },
    );

    expect(toggle()).toBeNull();
    expect(text(element())).toBe('');
  });

  describe('while voting is open', () => {
    it('offers to change the deadline, from the current one, or to close voting now', async () => {
      await render();

      expect(help()).toBe(
        'Se puede votar hasta las 23:59 del día elegido. Puedes ampliarlo, acortarlo o cerrar ya la votación.',
      );
      expect(reading()).toBe('1 diciembre 2026');
      expect(buttons().map((each) => text(each))).toEqual(['Cambiar plazo', 'Cerrar votación']);
      expect(button('Cambiar plazo').disabled).toBe(true);
      expect(button('Cerrar votación').disabled).toBe(false);
    });

    it('names the selects by its help line', async () => {
      await render();

      const group = element().querySelector('[role="group"]');
      const name = element().querySelector(`#${group?.getAttribute('aria-labelledby') ?? 'none'}`);
      expect(text(name)).toBe(help());
    });

    it('offers the days from today in the event’s time zone', async () => {
      // 12:00 in Madrid is already Monday 23 in Kiritimati (UTC+14).
      await render({ ...cena, timeZone: 'Pacific/Kiritimati' });

      await choose('Mes', '11');

      expect(reading()).toBe('23 noviembre 2026');
      expect(text(select('Día').options[0])).toBe('23');
    });

    it('lets the deadline be changed once another day is chosen', async () => {
      await render();

      await choose('Día', '3');
      expect(button('Cambiar plazo').disabled).toBe(false);

      await choose('Día', '1');
      expect(button('Cambiar plazo').disabled).toBe(true);
    });

    it('warns when voting would close on the first date or after it, and lets it be', async () => {
      await render();
      expect(warning()).toBe('');

      await choose('Día', '5');
      expect(warning()).toBe(
        'Ojo: la votación cierra después de la primera fecha, el sábado 5 de diciembre.',
      );
      expect(button('Cambiar plazo').disabled).toBe(false);

      await choose('Día', '4');
      expect(warning()).toBe('');
    });

    it('changes the deadline: says it is saving, then the new day', async () => {
      await render();
      await choose('Día', '3');

      await press('Cambiar plazo');

      const request = httpTesting.expectOne(deadlineChange);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ deadline: '2026-12-03' });
      expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
      await fixture.whenStable();
      expect(buttons().map((each) => text(each))).toEqual(['Guardando…', 'Cerrar votación']);
      expect(buttons().every((each) => each.matches(':disabled'))).toBe(true);
      expect(select('Día').matches(':disabled')).toBe(true);

      const changed = { ...cena, deadline: '2026-12-03' };
      request.flush(changed);
      await settle();
      await fixture.whenStable();

      expect(fixture.componentInstance.changes).toEqual([{ kind: 'managed', event: changed }]);
      expect(toast()).toBe('Plazo cambiado: se puede votar hasta el 3 de diciembre.');
      expect(reading()).toBe('3 diciembre 2026');
      expect(button('Cambiar plazo').disabled).toBe(true);
      expect(select('Día').matches(':disabled')).toBe(false);
    });

    it('sends today for a day chosen that became yesterday at midnight', async () => {
      await render();
      await choose('Mes', '11');
      await choose('Día', '22');
      // Monday 23, half past midnight in Madrid.
      vi.setSystemTime(new Date('2026-11-22T23:30:00Z'));

      await press('Cambiar plazo');

      expect(httpTesting.expectOne(deadlineChange).request.body).toEqual({
        deadline: '2026-11-23',
      });
      expect(reading()).toBe('23 noviembre 2026');
    });

    it('says when the change did not get through, keeping the day chosen', async () => {
      await render();
      await choose('Día', '3');
      await press('Cambiar plazo');

      await answerWith(deadlineChange, null, 500);

      expect(failure()).toBe('No se ha podido cambiar el plazo. Inténtalo de nuevo.');
      expect(reading()).toBe('3 diciembre 2026');
      expect(button('Cambiar plazo').disabled).toBe(false);
      expect(toast()).toBeNull();
      expect(fixture.componentInstance.changes).toEqual([]);

      await press('Cambiar plazo');
      expect(failure()).toBe('');
      await answerWith(deadlineChange, { ...cena, deadline: '2026-12-03' });
    });

    it('hands the page the event confirmed meanwhile, with no toast', async () => {
      await render();
      await choose('Día', '3');
      await press('Cambiar plazo');

      await answerWith(deadlineChange, { error: { code: 'ALREADY_CONFIRMED', message: '' } }, 409);
      const confirmed = { ...cena, state: 'confirmed', confirmedOption: cena.options[0]! } as const;
      await answerWith('/api/events/k3Jd9', confirmed);

      expect(fixture.componentInstance.changes).toEqual([{ kind: 'managed', event: confirmed }]);
      expect(toast()).toBeNull();
    });

    it('hands the page a refusal, with no toast', async () => {
      await render();
      await choose('Día', '3');
      await press('Cambiar plazo');

      await answerWith(deadlineChange, { error: { code: 'FORBIDDEN', message: '' } }, 403);

      expect(fixture.componentInstance.changes).toEqual([{ kind: 'refused' }]);
      expect(toast()).toBeNull();
      expect(failure()).toBe('');
    });

    it('asks before closing voting, naming the event and what follows', async () => {
      await render();

      await press('Cerrar votación');

      expect(dialog()?.hasAttribute('open')).toBe(true);
      expect(dialog()?.getAttribute('aria-label')).toBe('¿Cerrar la votación de "Cena de verano"?');
      expect(text(dialog()?.querySelector('h2'))).toBe('¿Cerrar la votación de "Cena de verano"?');
      expect(text(dialog()?.querySelector('.note'))).toBe(
        'Nadie más podrá votar ni cambiar su voto, y te enviaremos los resultados por email.',
      );
      expect(text(dialog()?.querySelector('.note strong'))).toBe('te enviaremos los resultados');
      expect(text(dialog()?.querySelector('.final'))).toBe(
        'Si cambias de idea, podrás reabrirla eligiendo un plazo nuevo.',
      );
      expect(answer('Cerrar votación').classList).toContain('plain');
    });

    it('writes the title as typed, never as markup', async () => {
      await render({ ...cena, title: '<b>Cena</b> & "copas"' });

      await press('Cerrar votación');

      expect(text(dialog()?.querySelector('h2'))).toBe(
        '¿Cerrar la votación de "<b>Cena</b> & "copas""?',
      );
      expect(dialog()?.querySelector('h2 b')).toBeNull();
    });

    it('asks again at once after the organizer went back, before the page settled', async () => {
      await render();
      await press('Cerrar votación');

      // Escape closes the dialog at once, but the browser fires its `close` event in a later
      // task: Enter on the button comes in between.
      const closing = dialog()!;
      closing.removeAttribute('open');
      button('Cerrar votación').click();
      closing.dispatchEvent(new Event('close'));
      await fixture.whenStable();

      expect(dialog()?.hasAttribute('open')).toBe(true);
    });

    it('hands the page the date confirmed meanwhile, when closing', async () => {
      await render();
      await closeVoting();

      await answerWith(closing, { error: { code: 'ALREADY_CONFIRMED', message: '' } }, 409);
      const confirmed = { ...cena, state: 'confirmed', confirmedOption: cena.options[0]! } as const;
      await answerWith('/api/events/k3Jd9', confirmed);

      expect(fixture.componentInstance.changes).toEqual([{ kind: 'managed', event: confirmed }]);
      expect(toggle()).toBeNull();
    });

    it('closes nothing when the question is answered "Volver"', async () => {
      await render();
      await press('Cerrar votación');

      answer('Volver').click();
      await fixture.whenStable();

      expect(dialog()).toBeNull();
      expect(fixture.componentInstance.changes).toEqual([]);
    });

    it('closes voting once accepted, then offers to reopen it, with the focus there', async () => {
      await render();

      await closeVoting();

      const request = httpTesting.expectOne(closing);
      expect(request.request.method).toBe('POST');
      expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
      await fixture.whenStable();
      expect(dialog()).toBeNull();
      expect(buttons().map((each) => text(each))).toEqual(['Cambiar plazo', 'Cerrando…']);
      expect(buttons().every((each) => each.matches(':disabled'))).toBe(true);

      request.flush(closedToday);
      await settle();
      await fixture.whenStable();

      expect(fixture.componentInstance.changes).toEqual([{ kind: 'managed', event: closedToday }]);
      expect(help()).toBe('La votación está cerrada. Para reabrirla, elige un plazo nuevo.');
      expect(buttons().map((each) => text(each))).toEqual(['Reabrir votación']);
      expect(document.activeElement).toBe(button('Reabrir votación'));
      expect(toast()).toBeNull();
    });

    it('says when the closing did not get through', async () => {
      await render();
      await closeVoting();

      await answerWith(closing, null, 500);

      expect(failure()).toBe('No se ha podido cerrar la votación. Inténtalo de nuevo.');
      expect(button('Cerrar votación').disabled).toBe(false);
      expect(fixture.componentInstance.changes).toEqual([]);
    });
  });

  describe('once voting has closed', () => {
    it('suggests a new deadline: a week from today, before the first date', async () => {
      await render(closedToday);

      expect(help()).toBe('La votación está cerrada. Para reabrirla, elige un plazo nuevo.');
      expect(reading()).toBe('29 noviembre 2026');
      expect(button('Reabrir votación').disabled).toBe(false);
    });

    it('suggests the day before the first date when that comes sooner', async () => {
      const soon = { id: dec5, dates: { kind: 'single', date: '2026-11-26' }, time: null } as const;
      await render({ ...closedToday, options: [soon] });

      expect(reading()).toBe('25 noviembre 2026');
    });

    it('suggests from today in the event’s time zone', async () => {
      // 12:00 in Madrid is already Monday 23 in Kiritimati (UTC+14): a week ahead, the 30th.
      await render({ ...closedToday, timeZone: 'Pacific/Kiritimati' });

      expect(reading()).toBe('30 noviembre 2026');
    });

    it('reopens voting until the day chosen', async () => {
      await render(closedToday);

      await press('Reabrir votación');

      const request = httpTesting.expectOne(deadlineChange);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ deadline: '2026-11-29' });
      await fixture.whenStable();
      expect(buttons().map((each) => text(each))).toEqual(['Reabriendo…']);
      expect(button('Reabriendo…').matches(':disabled')).toBe(true);

      const reopened = { ...cena, deadline: '2026-11-29' };
      request.flush(reopened);
      await settle();
      await fixture.whenStable();

      expect(fixture.componentInstance.changes).toEqual([{ kind: 'managed', event: reopened }]);
      expect(toast()).toBe('Votación reabierta: se puede votar hasta el 29 de noviembre.');
      expect(buttons().map((each) => text(each))).toEqual(['Cambiar plazo', 'Cerrar votación']);
    });

    it('reopens from today when the day suggested became yesterday at midnight', async () => {
      // The first date is tomorrow: the day suggested is today, Sunday 22.
      const soon = { id: dec5, dates: { kind: 'single', date: '2026-11-23' }, time: null } as const;
      await render({ ...closedToday, options: [soon] });
      expect(reading()).toBe('22 noviembre 2026');
      vi.setSystemTime(new Date('2026-11-22T23:30:00Z'));

      await press('Reabrir votación');

      expect(httpTesting.expectOne(deadlineChange).request.body).toEqual({
        deadline: '2026-11-23',
      });
    });

    it('says when the reopening did not get through', async () => {
      await render(closedToday);
      await press('Reabrir votación');

      await answerWith(deadlineChange, null, 500);

      expect(failure()).toBe('No se ha podido reabrir la votación. Inténtalo de nuevo.');
      expect(button('Reabrir votación').disabled).toBe(false);
    });

    it('says the year of a new deadline in another year', async () => {
      await render(closedToday);
      await choose('Año', '2027');
      await press('Reabrir votación');

      await answerWith(deadlineChange, { ...cena, deadline: '2027-11-22' });

      expect(toast()).toBe('Votación reabierta: se puede votar hasta el 22 de noviembre de 2027.');
    });
  });

  describe('when the event is read again', () => {
    it('keeps the day chosen while the deadline and the state stay', async () => {
      await render();
      await choose('Día', '3');

      fixture.componentInstance.event.set({ ...cena, voters: 5 });
      await fixture.whenStable();

      expect(reading()).toBe('3 diciembre 2026');
    });

    it('follows a deadline changed elsewhere', async () => {
      await render();
      await choose('Día', '3');

      fixture.componentInstance.event.set({ ...cena, deadline: '2026-12-02' });
      await fixture.whenStable();

      expect(reading()).toBe('2 diciembre 2026');
      expect(button('Cambiar plazo').disabled).toBe(true);
    });

    it('follows voting closed elsewhere, to the suggested day', async () => {
      await render();
      await choose('Día', '3');

      fixture.componentInstance.event.set({ ...cena, state: 'closed' });
      await fixture.whenStable();

      expect(reading()).toBe('29 noviembre 2026');
      expect(buttons().map((each) => text(each))).toEqual(['Reabrir votación']);
    });
  });

  it('starts another event with no failure and no question', async () => {
    await render();
    await choose('Día', '3');
    await press('Cambiar plazo');
    await answerWith(deadlineChange, null, 500);
    await press('Cerrar votación');

    fixture.componentInstance.eventId.set('Other');
    await fixture.whenStable();

    expect(failure()).toBe('');
    expect(dialog()).toBeNull();
  });

  it('leaves a failure of the event it was asked for, and its end, to that event', async () => {
    await render();
    await choose('Día', '3');
    await press('Cambiar plazo');
    fixture.componentInstance.eventId.set('Other');
    await fixture.whenStable();
    // The new event's own change, on its way.
    await press('Cambiar plazo');
    const own = httpTesting.expectOne('/api/events/Other/deadline');

    await answerWith(deadlineChange, null, 500);

    expect(failure()).toBe('');
    expect(text(buttons()[0])).toBe('Guardando…');
    own.flush({ ...cena, deadline: '2026-12-03' });
    await settle();
  });

  it('leaves an answer to the page it was asked for, once it shows another event', async () => {
    await render();
    await choose('Día', '3');
    await press('Cambiar plazo');

    fixture.componentInstance.eventId.set('Other');
    await fixture.whenStable();
    expect(button('Cambiar plazo').disabled).toBe(false);

    await answerWith(deadlineChange, { ...cena, deadline: '2026-12-03' });

    expect(fixture.componentInstance.changes).toEqual([]);
    expect(toast()).toBeNull();
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { CancelEvent } from './cancel-event';
import { EventManagement, type Management } from './event-management';
import cancelStyles from './cancel-event.scss' with { loader: 'text' };
import questionStyles from '../../../styles/_question.scss' with { loader: 'text' };

const TOKEN = 'Zx81aB2cD4eF6gH8iJ0kLm';
const cancelling = '/api/events/k3Jd9';

@Component({
  imports: [CancelEvent],
  template: `
    <app-cancel-event [eventId]="eventId()" [title]="title()" (changed)="changes.push($event)" />
  `,
})
class Host {
  readonly eventId = signal('k3Jd9');
  readonly title = signal('Cena de verano');
  readonly changes: Management[] = [];
}

/** Lets a settled request's promise chain reach the page. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('CancelEvent', () => {
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
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideI18n(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });

  async function render(): Promise<void> {
    // The management link this browser opened: its token goes with every request.
    TestBed.inject(EventManagement).claim('k3Jd9', TOKEN);
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(node: Element | null | undefined): string {
    return node?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  }

  /** The page's "Cancelar evento", out of the question. */
  function cancelButton(): HTMLButtonElement {
    const button = element().querySelector<HTMLButtonElement>('button.cancel');
    if (button === null) throw new Error('No "Cancelar evento" on the page');
    return button;
  }

  function dialog(): HTMLDialogElement | null {
    return element().querySelector('dialog');
  }

  function answer(name: string): HTMLButtonElement {
    const found = [...(dialog()?.querySelectorAll('button') ?? [])].find(
      (button) => text(button) === name,
    );
    if (found === undefined) throw new Error(`No answer "${name}"`);
    return found;
  }

  async function ask(): Promise<void> {
    cancelButton().click();
    await fixture.whenStable();
  }

  async function accept(): Promise<void> {
    await ask();
    answer('Cancelar evento').click();
    await fixture.whenStable();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(cancelStyles)).toEqual([]);
    expect(literalValues(questionStyles)).toEqual([]);
  });

  it('offers to cancel the event, asking nothing yet', async () => {
    await render();

    expect(text(cancelButton())).toBe('Cancelar evento');
    expect(cancelButton().disabled).toBe(false);
    expect(dialog()).toBeNull();
  });

  it('asks first, naming the event, what goes with it and that it is final', async () => {
    await render();

    await ask();

    expect(dialog()?.hasAttribute('open')).toBe(true);
    expect(dialog()?.getAttribute('aria-label')).toBe('¿Cancelar "Cena de verano"?');
    expect(text(dialog()?.querySelector('h2'))).toBe('¿Cancelar "Cena de verano"?');
    expect([...dialog()!.querySelectorAll('.note')].map((note) => text(note))).toEqual([
      'Se borrarán las fechas propuestas y los votos, y no se enviará ningún email más.',
      'Quien abra el enlace para votar o el de resultados verá que se ha cancelado.',
    ]);
    expect(dialog()?.querySelector('.note strong')?.textContent).toBe(
      'las fechas propuestas y los votos',
    );
    expect(text(dialog()?.querySelector('.final'))).toBe(
      'La cancelación es definitiva: no se puede deshacer.',
    );
    expect(answer('Cancelar evento').classList).toContain('danger');
    httpTesting.expectNone(cancelling);
  });

  it('writes the title as typed, never as markup', async () => {
    await render();
    fixture.componentInstance.title.set('<b>Cena</b> & "copas"');
    await fixture.whenStable();

    await ask();

    expect(text(dialog()?.querySelector('h2'))).toBe('¿Cancelar "<b>Cena</b> & "copas""?');
    expect(dialog()?.querySelector('h2 b')).toBeNull();
  });

  it('cancels nothing when the organizer goes back', async () => {
    await render();
    await ask();

    answer('Volver').click();
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    httpTesting.expectNone(cancelling);
    expect(fixture.componentInstance.changes).toEqual([]);
  });

  it('cancels once accepted, says so while it is sent, and hands the page the cancelled event', async () => {
    await render();

    await accept();

    expect(dialog()).toBeNull();
    expect(text(cancelButton())).toBe('Cancelando…');
    expect(cancelButton().disabled).toBe(true);
    const request = httpTesting.expectOne(cancelling);
    expect(request.request.method).toBe('DELETE');
    expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
    request.flush({ title: 'Cena de verano' });
    await settle();

    expect(fixture.componentInstance.changes).toEqual([
      { kind: 'cancelled', title: 'Cena de verano' },
    ]);
  });

  it('hands the page a refusal: the link no longer manages the event', async () => {
    await render();
    await accept();

    httpTesting
      .expectOne(cancelling)
      .flush(
        { error: { code: 'FORBIDDEN', message: 'Forbidden', details: [] } },
        { status: 403, statusText: 'Forbidden' },
      );
    await settle();

    expect(fixture.componentInstance.changes).toEqual([{ kind: 'refused' }]);
  });

  it('says so when the cancellation did not get through, and lets it be tried again', async () => {
    await render();
    await accept();

    httpTesting.expectOne(cancelling).flush(null, { status: 500, statusText: 'Error' });
    await settle();
    await fixture.whenStable();

    expect(text(element().querySelector('[role="status"]'))).toBe(
      'No se ha podido cancelar el evento. Inténtalo de nuevo.',
    );
    expect(text(cancelButton())).toBe('Cancelar evento');
    expect(cancelButton().disabled).toBe(false);
    expect(fixture.componentInstance.changes).toEqual([]);

    await accept();

    expect(text(element().querySelector('[role="status"]'))).toBe('');
    httpTesting.expectOne(cancelling).flush({ title: 'Cena de verano' });
    await settle();
    expect(fixture.componentInstance.changes).toEqual([
      { kind: 'cancelled', title: 'Cena de verano' },
    ]);
  });

  it('asks again at once after the organizer went back, before the page settled', async () => {
    await render();
    await ask();

    // Escape closes the dialog at once, but the browser fires its `close` event in a later task:
    // Enter on the button comes in between.
    const closing = dialog()!;
    closing.removeAttribute('open');
    cancelButton().click();
    closing.dispatchEvent(new Event('close'));
    await fixture.whenStable();

    expect(dialog()?.hasAttribute('open')).toBe(true);
  });

  it('keeps the answer of another event to itself, once the page shows a new one', async () => {
    await render();
    await accept();

    fixture.componentInstance.eventId.set('Pq4rT');
    await fixture.whenStable();
    httpTesting.expectOne(cancelling).flush({ title: 'Cena de verano' });
    await settle();

    expect(fixture.componentInstance.changes).toEqual([]);
    expect(text(cancelButton())).toBe('Cancelar evento');
    expect(cancelButton().disabled).toBe(false);
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal, viewChild } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DateInterpretation } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { PhraseBox, type PhraseMarked } from './phrase-box';
import boxStyles from './phrase-box.scss' with { loader: 'text' };

/** A page that shows the box while it is open, and holds its text. */
@Component({
  imports: [PhraseBox],
  template: `
    @if (open()) {
      <app-phrase-box [(text)]="text" [timed]="timed()" (marked)="marked.push($event)" />
    }
  `,
})
class Page {
  readonly open = signal(true);
  readonly text = signal('');
  readonly timed = signal(false);
  readonly marked: PhraseMarked[] = [];
  readonly box = viewChild(PhraseBox);
}

const UNCLEAR = 'No hemos entendido bien tu petición. Prueba a ser más específico.';

/** The reading of a phrase that gives one day and tells nothing. */
function oneDay(date: string): DateInterpretation {
  return { options: [{ dates: { kind: 'single', date }, time: null }], questions: [], notices: [] };
}

/** The reading of a phrase that gives no dates. */
function nothing(): DateInterpretation {
  return { options: [], questions: [], notices: [{ kind: 'unclear' }] };
}

describe('PhraseBox', () => {
  let fixture: ComponentFixture<Page>;
  let httpTesting: HttpTestingController;
  /** The last phrase the test had read, done once the box has taken its answer. */
  let reading: Promise<void>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Page],
      providers: [provideI18n(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  /** The box open on a page that holds `text`. */
  async function render(text = '', timed = false): Promise<void> {
    fixture = TestBed.createComponent(Page);
    page().text.set(text);
    page().timed.set(timed);
    // In the page: the focus is followed.
    document.body.append(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
  }

  function page(): Page {
    return fixture.componentInstance;
  }

  function box(): PhraseBox {
    const found = page().box();
    if (!found) throw new Error('No box');
    return found;
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function field(): HTMLTextAreaElement {
    const found = host().querySelector('textarea');
    if (!found) throw new Error('No text box');
    return found;
  }

  async function write(text: string): Promise<void> {
    field().value = text;
    field().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  /** A key goes down on the text box; says whether the box kept it from writing. */
  async function key(init: KeyboardEventInit): Promise<boolean> {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    field().dispatchEvent(event);
    await fixture.whenStable();
    return event.defaultPrevented;
  }

  async function generate(): Promise<void> {
    reading = box().generate();
    await fixture.whenStable();
  }

  /** The API answers the one phrase it was asked to read. */
  async function answer(read: DateInterpretation): Promise<void> {
    httpTesting.expectOne('/api/date-interpretations').flush(read);
    await reading;
    await fixture.whenStable();
  }

  /** The API leaves the one phrase it was asked to read unread. */
  async function refuse(status: number): Promise<void> {
    httpTesting.expectOne('/api/date-interpretations').flush('', { status, statusText: 'No' });
    await reading;
    await fixture.whenStable();
  }

  /** The phrases the API has been asked to read and has not answered. */
  function asked(): string[] {
    return httpTesting
      .match('/api/date-interpretations')
      .map((each) => (each.request.body as { text: string }).text);
  }

  function counter(): string | undefined {
    return host().querySelector('.counter')?.textContent.trim();
  }

  /** What a live region of the box says, each of its lines; `[]` while it says nothing. */
  function said(role: 'status' | 'alert'): string[] {
    const region = host().querySelector(`[role="${role}"]`);
    if (!region) throw new Error(`No ${role}`);
    return [...region.querySelectorAll('p, .visually-hidden')].map((each) =>
      each.textContent.replace(/\s+/g, ' ').trim(),
    );
  }

  /** The cross of the notice a live region shows. */
  function cross(role: 'status' | 'alert'): HTMLButtonElement {
    const found = host().querySelector<HTMLButtonElement>(`[role="${role}"] app-notice-box button`);
    if (!found) throw new Error('No cross');
    return found;
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(boxStyles)).toEqual([]);
  });

  describe('when it opens', () => {
    it('is a text box, named and with an example, that takes the focus', async () => {
      await render();

      expect(field().getAttribute('aria-label')).toBe('Escribe las fechas con tus palabras');
      expect(field().placeholder).toBe('Todos los lunes de junio...');
      expect(field().value).toBe('');
      expect(document.activeElement).toBe(field());
    });

    it('counts no character of 120, takes no more than those, and has nothing to send', async () => {
      await render();

      expect(counter()).toBe('0/120');
      expect(field().getAttribute('maxlength')).toBe('120');
      expect(box().ready()).toBe(false);
      expect(said('status')).toEqual([]);
      expect(said('alert')).toEqual([]);
    });

    it('shows the text the page holds, counted', async () => {
      await render('todos los lunes de julio');

      expect(field().value).toBe('todos los lunes de julio');
      expect(counter()).toBe('24/120');
      expect(box().ready()).toBe(true);
    });
  });

  describe('while a phrase is written', () => {
    it('gives the page each text, counts it and lays it out again under the text box, which grows with it', async () => {
      await render();
      await write('el viernes');

      expect(page().text()).toBe('el viernes');
      expect(counter()).toBe('10/120');
      expect(field().parentElement?.getAttribute('data-text')).toBe('el viernes');
      expect(box().ready()).toBe(true);
    });

    it('shows a text the page changes', async () => {
      await render('el viernes');
      page().text.set('');
      await fixture.whenStable();

      expect(field().value).toBe('');
      expect(counter()).toBe('0/120');
    });

    it('takes the focus when asked', async () => {
      await render();
      field().blur();
      expect(document.activeElement).not.toBe(field());

      box().focus();
      expect(document.activeElement).toBe(field());
    });
  });

  describe('a phrase of blanks', () => {
    it('is not sent, by the button nor by Enter', async () => {
      await render();
      await write('  \n ');

      expect(box().ready()).toBe(false);
      await generate();
      const kept = await key({ key: 'Enter' });

      expect(kept).toBe(true);
      expect(asked()).toEqual([]);
      expect(said('status')).toEqual([]);
    });
  });

  describe('Enter', () => {
    it('has the phrase read in place of writing a line', async () => {
      await render('el viernes');
      const kept = await key({ key: 'Enter' });

      expect(kept).toBe(true);
      expect(asked()).toEqual(['el viernes']);
    });

    it('writes a line with Shift, and sends nothing', async () => {
      await render('el viernes');
      const kept = await key({ key: 'Enter', shiftKey: true });

      expect(kept).toBe(false);
      expect(asked()).toEqual([]);
    });

    it('ends a character being composed, and sends nothing', async () => {
      await render('el viernes');
      const kept = await key({ key: 'Enter', isComposing: true });

      expect(kept).toBe(false);
      expect(asked()).toEqual([]);
    });

    it('is the only key that has the phrase read', async () => {
      await render('el viernes');
      const kept = await key({ key: 'a' });

      expect(kept).toBe(false);
      expect(asked()).toEqual([]);
    });
  });

  describe('while the answer is waited for', () => {
    it('says so to screen readers beside a spinner, and has nothing to send', async () => {
      await render('el viernes');
      await generate();

      expect(said('status')).toEqual(['Generando fechas…']);
      expect(host().querySelector('[role="status"] .spinner[aria-hidden="true"]')).not.toBeNull();
      expect(box().ready()).toBe(false);

      await answer(nothing());
    });

    it('sends no other phrase, by the button nor by Enter', async () => {
      await render('el viernes');
      await generate();
      await write('el sábado');
      await generate();
      await key({ key: 'Enter' });

      expect(asked()).toEqual(['el viernes']);
    });

    it('stops waiting when the answer comes, and can send the next phrase', async () => {
      await render('cuando queráis');
      await generate();
      await answer(nothing());

      expect(host().querySelector('.spinner')).toBeNull();
      expect(said('status')).toEqual([UNCLEAR]);
      expect(box().ready()).toBe(true);

      await generate();
      expect(asked()).toEqual(['cuando queráis']);
    });
  });

  describe('a phrase that gives dates', () => {
    it('tells the page what it leaves chosen, and keeps nothing in the box', async () => {
      await render('el lunes 5 de julio');
      await generate();
      await answer(oneDay('2027-07-05'));

      expect(page().marked).toEqual([
        {
          selection: { singles: ['2027-07-05'], ranges: [], saved: [], times: {}, timed: false },
          lines: [],
        },
      ]);
      expect(said('status')).toEqual([]);
      expect(said('alert')).toEqual([]);
      expect(page().text()).toBe('el lunes 5 de julio');
    });

    it('tells with them what the reading says about them', async () => {
      await render('el lunes 5 de julio o así');
      await generate();
      await answer({ ...oneDay('2027-07-05'), notices: [{ kind: 'unclear' }] });

      expect(page().marked.map((each) => each.lines)).toEqual([[{ lead: null, text: UNCLEAR }]]);
      expect(said('status')).toEqual([]);
    });

    it('keeps the times asked for before it, whatever it says', async () => {
      await render('el lunes 5 de julio', true);
      await generate();
      await answer(oneDay('2027-07-05'));

      expect(page().marked.map((each) => each.selection.timed)).toEqual([true]);
    });
  });

  describe('a phrase that gives no dates', () => {
    beforeEach(async () => {
      await render('cuando queráis');
      await generate();
      await answer(nothing());
    });

    it('stays in the box with why, in amber, and tells the page nothing', () => {
      expect(said('status')).toEqual([UNCLEAR]);
      expect(host().querySelector('[role="status"] app-notice-box.error')).toBeNull();
      expect(said('alert')).toEqual([]);
      expect(page().marked).toEqual([]);
      expect(field().value).toBe('cuando queráis');
    });

    it('loses the notice to its cross', async () => {
      cross('status').click();
      await fixture.whenStable();

      expect(said('status')).toEqual([]);
    });

    it('loses the notice to the next phrase, as soon as it is sent', async () => {
      await write('el lunes 5 de julio');
      await generate();

      expect(said('status')).toEqual(['Generando fechas…']);

      await answer(oneDay('2027-07-05'));
      expect(said('status')).toEqual([]);
      expect(page().marked).toHaveLength(1);
    });
  });

  describe('a phrase left unread', () => {
    it('says in red that it could not be read, and can be sent again', async () => {
      await render('el viernes');
      await generate();
      await refuse(500);

      expect(said('alert')).toEqual(['No se ha podido interpretar']);
      expect(host().querySelector('[role="alert"] app-notice-box.error')).not.toBeNull();
      expect(said('status')).toEqual([]);
      expect(page().marked).toEqual([]);
      expect(box().ready()).toBe(true);
    });

    it('says in red that too many were asked for', async () => {
      await render('el viernes');
      await generate();
      await refuse(429);

      expect(said('alert')).toEqual(['Demasiadas peticiones, inténtalo en un momento']);
      expect(host().querySelector('[role="alert"] app-notice-box.error')).not.toBeNull();
    });

    it('loses the red line to its cross', async () => {
      await render('el viernes');
      await generate();
      await refuse(500);
      cross('alert').click();
      await fixture.whenStable();

      expect(said('alert')).toEqual([]);
    });

    it('loses the red line to the next phrase, as soon as it is sent', async () => {
      await render('el viernes');
      await generate();
      await refuse(500);
      await generate();

      expect(said('alert')).toEqual([]);

      await refuse(429);
      expect(said('alert')).toEqual(['Demasiadas peticiones, inténtalo en un momento']);
    });
  });

  describe('an answer that comes once the box is gone', () => {
    it('is dropped: the page is told nothing', async () => {
      await render('el lunes 5 de julio');
      await generate();
      page().open.set(false);
      await fixture.whenStable();
      await answer(oneDay('2027-07-05'));

      expect(page().marked).toEqual([]);
    });
  });
});

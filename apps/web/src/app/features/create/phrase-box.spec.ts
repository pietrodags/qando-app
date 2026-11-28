import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal, viewChild } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DateInterpretation } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import {
  type TestRecognizer,
  type TestRecognizers,
  installTestRecognizer,
  removeTestRecognizer,
} from '../../../test/recognizer';
import { timesOf } from './day-times';
import { PhraseBox, type PhraseMarked } from './phrase-box';
import boxStyles from './phrase-box.scss' with { loader: 'text' };

/** A page that shows the box while it is open, and holds its text. */
@Component({
  imports: [PhraseBox],
  template: `
    @if (open()) {
      <app-phrase-box
        [(text)]="text"
        [timed]="timed()"
        (marked)="marked.push($event)"
        (closed)="closes = closes + 1"
      />
    }
  `,
})
class Page {
  readonly open = signal(true);
  readonly text = signal('');
  readonly timed = signal(false);
  readonly marked: PhraseMarked[] = [];
  closes = 0;
  readonly box = viewChild(PhraseBox);
}

const UNCLEAR = 'No hemos entendido bien tu petición. Prueba a ser más específico.';

/** The reading of a phrase that gives one day and tells nothing. */
function oneDay(date: string): DateInterpretation {
  return {
    options: [{ dates: { kind: 'single', date }, time: null }],
    questions: [],
    notices: [],
    timesLeftOut: [],
    questionsNotAsked: [],
  };
}

/** The reading of a phrase that gives no dates. */
function nothing(): DateInterpretation {
  return {
    options: [],
    questions: [],
    notices: [{ kind: 'unclear' }],
    timesLeftOut: [],
    questionsNotAsked: [],
  };
}

/**
 * The reading of "el viernes por la tarde y el sábado a las 8", written on Monday 15 June 2026:
 * two days, a time to ask about and a time not understood.
 */
function withQuestion(): DateInterpretation {
  return {
    options: [
      { dates: { kind: 'single', date: '2026-06-19' }, time: null },
      { dates: { kind: 'single', date: '2026-06-20' }, time: { kind: 'question', question: 0 } },
    ],
    questions: [
      {
        fragment: 'a las 8',
        dates: ['2026-06-20'],
        morning: { kind: 'single', at: '08:00' },
        afternoon: { kind: 'single', at: '20:00' },
      },
    ],
    notices: [{ kind: 'timeUnclear', fragment: 'por la tarde', dates: ['2026-06-19'] }],
    timesLeftOut: [],
    questionsNotAsked: [],
  };
}

/**
 * The reading of "el sábado de 8 a 20:30", written on Monday 15 June 2026: an event can hold 8:00
 * to 20:30, not 20:00 to 20:30.
 */
function withReadingLeftOut(): DateInterpretation {
  return {
    options: [
      { dates: { kind: 'single', date: '2026-06-20' }, time: { kind: 'question', question: 0 } },
    ],
    questions: [
      {
        fragment: 'de 8 a 20:30',
        dates: ['2026-06-20'],
        morning: { kind: 'range', start: '08:00', end: '20:30' },
        afternoon: { kind: 'range', start: '20:00', end: '20:30' },
        leftOut: 'afternoon',
      },
    ],
    notices: [],
    timesLeftOut: [],
    questionsNotAsked: [],
  };
}

/** The reading of "el lunes a las 10 o el martes a las 5", written on Monday 15 June 2026. */
function withTwoQuestions(): DateInterpretation {
  return {
    options: [
      { dates: { kind: 'single', date: '2026-06-22' }, time: { kind: 'question', question: 0 } },
      { dates: { kind: 'single', date: '2026-06-16' }, time: { kind: 'question', question: 1 } },
    ],
    questions: [
      {
        fragment: 'a las 10',
        dates: ['2026-06-22'],
        morning: { kind: 'single', at: '10:00' },
        afternoon: { kind: 'single', at: '22:00' },
      },
      {
        fragment: 'a las 5',
        dates: ['2026-06-16'],
        morning: { kind: 'single', at: '05:00' },
        afternoon: { kind: 'single', at: '17:00' },
      },
    ],
    notices: [],
    timesLeftOut: [],
    questionsNotAsked: [],
  };
}

/**
 * The reading of "el lunes de 9 a 9:30", written on Monday 15 June 2026: no event can hold 9:00 to
 * 9:30 nor 21:00 to 21:30, so nothing is asked and the Monday is a whole day.
 */
function withQuestionNotAsked(): DateInterpretation {
  return {
    options: [{ dates: { kind: 'single', date: '2026-06-22' }, time: null }],
    questions: [],
    notices: [],
    timesLeftOut: [],
    questionsNotAsked: [
      {
        fragment: 'de 9 a 9:30',
        dates: ['2026-06-22'],
        morning: { kind: 'range', start: '09:00', end: '09:30' },
        afternoon: { kind: 'range', start: '21:00', end: '21:30' },
      },
    ],
  };
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
  });

  describe('when it is emptied', () => {
    it('loses its text, which the page is given, and takes the focus', async () => {
      await render('todos los lunes de julio');
      field().blur();
      expect(document.activeElement).not.toBe(field());

      box().clear();
      await fixture.whenStable();

      expect(page().text()).toBe('');
      expect(field().value).toBe('');
      expect(counter()).toBe('0/120');
      expect(document.activeElement).toBe(field());
    });

    it('loses why a phrase gave no dates', async () => {
      await render('cuando sea');
      await generate();
      await answer(nothing());
      expect(said('status')).toEqual([UNCLEAR]);

      box().clear();
      await fixture.whenStable();

      expect(said('status')).toEqual([]);
    });

    it('loses the red line of a phrase left unread', async () => {
      await render('el lunes 5 de julio');
      await generate();
      await refuse(500);
      expect(said('alert')).toEqual(['No se ha podido interpretar']);

      box().clear();
      await fixture.whenStable();

      expect(said('alert')).toEqual([]);
    });

    it('stops waiting for an answer, and drops it when it comes', async () => {
      await render('el lunes 5 de julio');
      await generate();

      box().clear();
      await fixture.whenStable();
      expect(said('status')).toEqual([]);

      await answer(oneDay('2027-07-05'));
      expect(page().marked).toEqual([]);
      expect(said('status')).toEqual([]);
      expect(said('alert')).toEqual([]);
    });

    it('sends the next phrase at once, and takes its answer though the dropped one comes first', async () => {
      await render('el lunes 5 de julio');
      await generate();
      box().clear();
      await write('el martes 6 de julio');
      expect(box().ready()).toBe(true);
      await generate();
      const [dropped, awaited] = httpTesting.match('/api/date-interpretations');

      dropped?.flush(oneDay('2027-07-05'));
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
      // Still waiting for the phrase sent last.
      expect(page().marked).toEqual([]);
      expect(box().ready()).toBe(false);

      awaited?.flush(oneDay('2027-07-06'));
      await reading;
      await fixture.whenStable();
      expect(page().marked.map((each) => each.selection.singles)).toEqual([['2027-07-06']]);
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

  /** The questions the box asks, each as it reads. */
  function questions(): string[] {
    return [...host().querySelectorAll('app-time-questions p')].map((each) =>
      each.textContent.replace(/\s+/g, ' ').trim(),
    );
  }

  /** Presses the answer that reads so. */
  async function pick(shown: string): Promise<void> {
    const found = [...host().querySelectorAll<HTMLButtonElement>('app-time-questions button')].find(
      (each) => each.querySelector('[aria-hidden="true"]')?.textContent === shown,
    );
    if (!found) throw new Error(`No answer "${shown}"`);
    found.click();
    await fixture.whenStable();
  }

  /** The times each phrase read left on a day. */
  function timesMarked(date: string): unknown[] {
    return page().marked.map(({ selection }) => {
      const day = selection.times[date];
      return day === undefined ? null : timesOf(day);
    });
  }

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

    it('asks nothing of a time no event can hold either way: its day is told with the words said, and times are asked for', async () => {
      await render('el lunes de 9 a 9:30');
      await generate();
      await answer(withQuestionNotAsked());

      expect(page().marked).toEqual([
        {
          selection: { singles: ['2026-06-22'], ranges: [], saved: [], times: {}, timed: true },
          lines: [
            {
              lead: 'lun 22 jun',
              text: 'hemos marcado el día, pero no hemos podido marcar el horario «de 9 a 9:30». Elige la hora en el paso siguiente.',
            },
          ],
        },
      ]);
      expect(host().querySelector('app-time-questions')).toBeNull();
    });

    it('keeps the times asked for before it, whatever it says', async () => {
      await render('el lunes 5 de julio', true);
      await generate();
      await answer(oneDay('2027-07-05'));

      expect(page().marked.map((each) => each.selection.timed)).toEqual([true]);
    });
  });

  describe('a phrase with a time said without its half of the day', () => {
    beforeEach(async () => {
      await render('el viernes por la tarde y el sábado a las 8');
      await generate();
      await answer(withQuestion());
    });

    it('asks about it in the box, and tells the page nothing yet', () => {
      expect(questions()).toEqual(['«a las 8» del sáb 20 jun: ¿mañana o tarde?']);
      expect(page().marked).toEqual([]);
      expect(field().value).toBe('el viernes por la tarde y el sábado a las 8');
    });

    it('keeps what the reading tells for the calendar: the box holds the question alone', () => {
      expect(said('status')).toEqual([]);
      expect(said('alert')).toEqual([]);
    });

    it('tells the page, once answered, its days with the reading picked and what the reading tells, and asks no more', async () => {
      await pick('20:00 · tarde');

      expect(page().marked).toHaveLength(1);
      expect(questions()).toEqual([]);
      expect(page().marked[0]?.selection.singles).toEqual(['2026-06-19', '2026-06-20']);
      expect(timesMarked('2026-06-20')).toEqual([[{ kind: 'single', at: '20:00' }]]);
      expect(timesMarked('2026-06-19')).toEqual([null]);
      expect(page().marked[0]?.selection.timed).toBe(true);
      expect(page().marked[0]?.lines).toEqual([
        {
          lead: 'vie 19 jun',
          text: 'hemos marcado el día, pero no hemos entendido la hora («por la tarde»). Elígela en el paso siguiente.',
        },
      ]);
    });

    it('takes the other reading as well', async () => {
      await pick('8:00 · mañana');

      expect(timesMarked('2026-06-20')).toEqual([[{ kind: 'single', at: '08:00' }]]);
    });

    it('keeps the question while the text is edited, and can send the text', async () => {
      await write('el sábado a las 8');

      expect(questions()).toEqual(['«a las 8» del sáb 20 jun: ¿mañana o tarde?']);
      expect(box().ready()).toBe(true);
    });

    it('loses the question to the next phrase, as soon as it is sent', async () => {
      await write('el lunes 5 de julio');
      await generate();

      expect(questions()).toEqual([]);

      await answer(oneDay('2027-07-05'));
      expect(page().marked.map((each) => each.selection.singles)).toEqual([['2027-07-05']]);
    });

    it('asks again when the next phrase has a question too', async () => {
      await generate();
      await answer(withTwoQuestions());

      expect(questions()).toEqual([
        '«a las 10» del lun 22 jun: ¿mañana o tarde?',
        '«a las 5» del mar 16 jun: ¿mañana o tarde?',
      ]);
      expect(page().marked).toEqual([]);
    });

    it('loses the question when the box is emptied', async () => {
      box().clear();
      await fixture.whenStable();

      expect(questions()).toEqual([]);
      expect(page().marked).toEqual([]);
      expect(document.activeElement).toBe(field());
    });
  });

  describe('a phrase with a time only one of whose readings an event can hold', () => {
    beforeEach(async () => {
      await render('el sábado de 8 a 20:30');
      await generate();
      await answer(withReadingLeftOut());
    });

    it('asks about it with both readings', () => {
      expect(questions()).toEqual(['«de 8 a 20:30» del sáb 20 jun: ¿mañana o tarde?']);
    });

    it('marks the day whole when the reading picked is the one no event can hold, and tells it', async () => {
      await pick('20:00 → 20:30 · tarde');

      expect(page().marked).toEqual([
        {
          selection: { singles: ['2026-06-20'], ranges: [], saved: [], times: {}, timed: true },
          lines: [
            {
              lead: 'sáb 20 jun',
              text: 'hemos marcado el día, pero no hemos podido marcar el horario de 20:00 a 20:30. Elige la hora en el paso siguiente.',
            },
          ],
        },
      ]);
    });

    it('marks the other reading, with nothing to tell', async () => {
      await pick('8:00 → 20:30 · mañana');

      expect(timesMarked('2026-06-20')).toEqual([
        [{ kind: 'range', start: '08:00', end: '20:30' }],
      ]);
      expect(page().marked[0]?.lines).toEqual([]);
    });
  });

  describe('a phrase with several times to ask about', () => {
    beforeEach(async () => {
      await render('el lunes a las 10 o el martes a las 5');
      await generate();
      await answer(withTwoQuestions());
    });

    it('tells the page nothing until the last one is answered', async () => {
      await pick('17:00 · tarde');

      expect(page().marked).toEqual([]);
      expect(questions()).toHaveLength(2);
    });

    it('tells the page each day with the reading picked for it', async () => {
      await pick('17:00 · tarde');
      await pick('10:00 · mañana');

      expect(page().marked).toHaveLength(1);
      expect(timesMarked('2026-06-22')).toEqual([[{ kind: 'single', at: '10:00' }]]);
      expect(timesMarked('2026-06-16')).toEqual([[{ kind: 'single', at: '17:00' }]]);
      expect(page().marked[0]?.lines).toEqual([]);
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

  describe('where the browser offers dictation', () => {
    const DENIED = 'Permiso de micrófono denegado. Actívalo en los ajustes del navegador.';
    let recognizers: TestRecognizers;

    beforeEach(() => {
      recognizers = installTestRecognizer();
    });

    afterEach(() => {
      removeTestRecognizer();
    });

    function mic(): HTMLButtonElement {
      const found = host().querySelector<HTMLButtonElement>('.grow > app-dictation button');
      if (!found) throw new Error('No microphone');
      return found;
    }

    /** The microphone pressed: the recognizer that listens. */
    async function dictate(): Promise<TestRecognizer> {
      mic().click();
      await fixture.whenStable();
      const listening = recognizers.at(-1);
      if (!listening) throw new Error('No recognizer');
      return listening;
    }

    it('has a microphone in the well of the text, reached after the text', async () => {
      await render();

      expect(mic().getAttribute('aria-label')).toBe('Dictar con micrófono');
      expect(field().compareDocumentPosition(mic())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(document.activeElement).toBe(field());
    });

    it('writes what is heard after the text, counted and ready to be sent', async () => {
      await render('Cena');
      const listening = await dictate();

      listening.hears('el viernes');
      await fixture.whenStable();

      expect(page().text()).toBe('Cena el viernes');
      expect(field().value).toBe('Cena el viernes');
      expect(counter()).toBe('15/120');
      expect(box().ready()).toBe(true);
    });

    it('takes no more words than fit in its 120 characters', async () => {
      await render();
      const listening = await dictate();

      listening.hears('todos los lunes de julio '.repeat(6));
      await fixture.whenStable();

      expect(page().text()).toHaveLength(120);
      expect(counter()).toBe('120/120');
    });

    it('says in red that the microphone was refused', async () => {
      await render('Cena');
      const listening = await dictate();

      listening.fails('not-allowed');
      await fixture.whenStable();

      expect(said('alert')).toEqual([DENIED]);
      expect(host().querySelector('[role="alert"] app-notice-box.error')).not.toBeNull();
      expect(box().ready()).toBe(true);
    });

    it('loses that red line to its cross', async () => {
      await render();
      const listening = await dictate();
      listening.fails('not-allowed');
      await fixture.whenStable();

      cross('alert').click();
      await fixture.whenStable();

      expect(said('alert')).toEqual([]);
    });

    it('loses that red line to the next phrase, as soon as it is sent', async () => {
      await render('el viernes');
      const listening = await dictate();
      listening.fails('not-allowed');
      await fixture.whenStable();

      await generate();

      expect(said('alert')).toEqual([]);
      await answer(oneDay('2026-06-19'));
    });

    it('stops listening when the phrase is sent, which is read as it was then', async () => {
      await render('Cena');
      const listening = await dictate();
      listening.hears('el viernes');
      await fixture.whenStable();

      await generate();
      listening.hears('el viernes por la tarde');
      await fixture.whenStable();

      expect(listening.state).toBe('aborted');
      expect(mic().getAttribute('aria-label')).toBe('Dictar con micrófono');
      expect(asked()).toEqual(['Cena el viernes']);
      expect(page().text()).toBe('Cena el viernes');
    });

    it('goes on listening when Enter finds nothing to send', async () => {
      await render();
      const listening = await dictate();

      await key({ key: 'Enter' });

      expect(listening.state).toBe('started');
      expect(mic().getAttribute('aria-label')).toBe('Detener dictado');
    });

    it('stops listening when the box is emptied, and stays empty', async () => {
      await render('Cena');
      const listening = await dictate();
      listening.hears('el viernes');

      box().clear();
      listening.hears('el viernes por la tarde');
      await fixture.whenStable();

      expect(listening.state).toBe('aborted');
      expect(mic().getAttribute('aria-label')).toBe('Dictar con micrófono');
      expect(page().text()).toBe('');
    });

    it('stops listening when the box closes', async () => {
      await render();
      const listening = await dictate();

      page().open.set(false);
      await fixture.whenStable();

      expect(listening.state).toBe('aborted');
    });
  });

  describe('where the browser offers no dictation', () => {
    it('has no microphone, and reads and empties as ever', async () => {
      await render('el viernes');

      expect(host().querySelector('.grow button')).toBeNull();

      await generate();
      await answer(oneDay('2026-06-19'));
      expect(page().marked).toHaveLength(1);

      box().clear();
      expect(page().text()).toBe('');
    });
  });

  describe('its "X"', () => {
    /** The box's "X", by its name. */
    function closer(): HTMLButtonElement {
      const found = host().querySelector<HTMLButtonElement>(
        'button[aria-label="Cerrar el calendario inteligente"]',
      );
      if (!found) throw new Error('No "X" in the box');
      return found;
    }

    it('is a button named in words, its cross drawn and unheard', async () => {
      await render();

      expect(closer().getAttribute('type')).toBe('button');
      expect(closer().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('tells that it was pressed, and leaves closing the box to whoever shows it', async () => {
      await render('el viernes');

      closer().click();
      await fixture.whenStable();

      expect(page().closes).toBe(1);
      expect(page().box()).toBeDefined();
      expect(page().text()).toBe('el viernes');
      expect(page().marked).toEqual([]);
    });

    it('comes after what the box holds, last in the Tab order', async () => {
      installTestRecognizer();
      try {
        await render('el viernes por la tarde y el sábado a las 8');
        await generate();
        await answer(withQuestion());

        // The text box, the microphone, the question's two readings and the "X".
        const reachable = [...host().querySelectorAll('app-phrase-box :is(textarea, button)')];

        expect(reachable).toHaveLength(5);
        expect(reachable[0]).toBe(field());
        expect(reachable.at(-1)).toBe(closer());
      } finally {
        removeTestRecognizer();
      }
    });
  });

  describe('an answer that comes once the box is gone', () => {
    it('is dropped: the page is told nothing', async () => {
      await render('el lunes 5 de julio');
      await generate();
      page().open.set(false);
      await fixture.whenStable();
      // An output of a component that is gone warns when it is told something.
      const warned = vi.spyOn(console, 'warn');
      await answer(oneDay('2027-07-05'));

      expect(page().marked).toEqual([]);
      expect(warned).not.toHaveBeenCalled();
      warned.mockRestore();
    });
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DateInterpretation } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { installTestScreen } from '../../../test/media-queries';
import { REPEAT_DELAY_MS, REPEAT_EVERY_MS } from '../../shared/ui/hold-repeat';
import { TIP_LINGER_MS } from '../../shared/ui/hover-tip';
import { HOLD_MS } from '../../shared/ui/long-press';
import { type DateSelection, NO_DATES, pressDay } from './date-selection';
import { SIDE_HOLD_MS } from './day-drag';
import { daysFrom } from './days-from';
import { WizardDates } from './wizard-dates';
import datesStyles from './wizard-dates.scss' with { loader: 'text' };

describe('WizardDates', () => {
  let fixture: ComponentFixture<WizardDates>;
  let went: string[];
  /** The element under the pointer, as the last pointer event left it. */
  let under: Element | null;

  beforeEach(() => {
    // Monday 15 June 2026: the calendar goes up to 15 June 2027.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    // jsdom has neither.
    under = null;
    // A computer with a mouse, until a test says otherwise.
    installTestScreen();
    document.elementFromPoint = () => under;
    Element.prototype.setPointerCapture = () => undefined;
    TestBed.configureTestingModule({ imports: [WizardDates], providers: [provideI18n()] });
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'elementFromPoint');
    Reflect.deleteProperty(Element.prototype, 'setPointerCapture');
  });

  async function render(month = '2026-06', selection = NO_DATES, phrase = ''): Promise<void> {
    fixture = TestBed.createComponent(WizardDates);
    fixture.componentRef.setInput('month', month);
    fixture.componentRef.setInput('selection', selection);
    fixture.componentRef.setInput('phrase', phrase);
    went = [];
    fixture.componentInstance.back.subscribe(() => went.push('back'));
    fixture.componentInstance.next.subscribe(() => went.push('next'));
    await fixture.whenStable();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function all<T extends HTMLElement = HTMLElement>(selector: string): T[] {
    return [...element().querySelectorAll<T>(selector)];
  }

  /** The button of a day of the month on screen, by its number. */
  function day(number: number): HTMLButtonElement {
    const button = all<HTMLButtonElement>('button.day').find(
      (each) => each.textContent.trim() === String(number),
    );
    if (!button) throw new Error(`No day ${String(number)}`);
    return button;
  }

  /** The window on the days of the month: what a drag and a slide are made over. */
  function grid(): HTMLElement {
    const found = element().querySelector<HTMLElement>('.window');
    if (!found) throw new Error('No window on the days');
    return found;
  }

  function button(name: string): HTMLButtonElement {
    const found = element().querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
    if (!found) throw new Error(`No button "${name}"`);
    return found;
  }

  async function click(target: HTMLElement): Promise<void> {
    target.click();
    await fixture.whenStable();
  }

  /** A key pressed on the day with the focus; answers whether the page kept its own reaction. */
  async function key(name: string, shiftKey = false): Promise<boolean> {
    const event = new KeyboardEvent('keydown', {
      key: name,
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    document.activeElement?.dispatchEvent(event);
    await fixture.whenStable();
    return !event.defaultPrevented;
  }

  /**
   * A pointer event as jsdom has them: a mouse event that says which pointer made it. The pointer
   * is over the event's target, or over `over`: a finger's events stay with the day it pressed.
   */
  function fire(
    target: Element,
    type: string,
    init: {
      x?: number;
      buttons?: number;
      pointerType?: string;
      pointerId?: number;
      over?: Element;
    } = {},
  ): void {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: init.x ?? 0,
      buttons: init.buttons ?? 1,
    });
    Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
    Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 });
    under = init.over ?? target;
    target.dispatchEvent(event);
  }

  /** The mouse is pressed on a day and moved onto another: a drag, not released yet. */
  async function drag(from: HTMLElement, to: HTMLElement): Promise<void> {
    fire(from, 'pointerdown', { x: 100 });
    fire(to, 'pointerenter', { x: 200 });
    fire(to, 'pointermove', { x: 200 });
    await fixture.whenStable();
  }

  /** The mouse is released where it is, or over `over`. */
  async function drop(over: Element | null = under): Promise<void> {
    fire(document.body, 'pointerup', { buttons: 0, over: over ?? document.body });
    await fixture.whenStable();
  }

  /** Shift+Enter on a day: it is held as the first day of a range. */
  async function hold(target: HTMLElement): Promise<void> {
    target.focus();
    await key('Enter', true);
  }

  /**
   * From here the test's waits are faked too. `whenStable()` no longer comes: the test draws with
   * `fixture.detectChanges()`.
   */
  function fakeWaits(): void {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
  }

  const finger = { pointerType: 'touch', pointerId: 7 };

  /** A finger rests on a day until its ring closes: its drag begins. */
  function rest(target: HTMLElement): void {
    fakeWaits();
    fire(target, 'pointerdown', finger);
    vi.advanceTimersByTime(HOLD_MS);
    fixture.detectChanges();
  }

  /** The finger that pressed `from` slides onto another day. */
  function slide(from: HTMLElement, over: HTMLElement): void {
    fire(from, 'pointermove', { ...finger, x: 200, over });
    fixture.detectChanges();
  }

  function lift(): void {
    fire(document.body, 'pointerup', { ...finger, buttons: 0 });
    fixture.detectChanges();
  }

  const june = (number: number): string => `2026-06-${String(number).padStart(2, '0')}`;

  /** A selection of ranges in June 2026, each by its first and last day. */
  function ranges(...spans: [number, number][]): DateSelection {
    return {
      singles: [],
      ranges: spans.map(([start, end]) => ({ start: june(start), end: june(end) })),
      saved: [],
      times: {},
      timed: false,
    };
  }

  /** How a day is drawn: its classes, in order, without the one every day has. */
  function look(number: number): string {
    return [...day(number).classList]
      .filter((name) => name !== 'day')
      .sort()
      .join(' ');
  }

  /** What the calendar waits for, as screen readers hear it: a text that is not seen. */
  function hint(): string {
    return (
      element().querySelector('.waits.visually-hidden[role="status"]')?.textContent.trim() ??
      'no hint'
    );
  }

  /** The tip over a day, as it reads; `null` without one. */
  function tip(): string | null {
    return element().querySelector('app-tooltip')?.textContent.trim() ?? null;
  }

  function title(): string {
    return element().querySelector('h2')?.textContent.trim() ?? '';
  }

  function marked(): string[] {
    return all('button.day[aria-pressed="true"]').map((each) => each.textContent.trim());
  }

  function selection(): DateSelection {
    return fixture.componentInstance.selection();
  }

  /** The numbers of the days in the Tab order. */
  function tabStops(): string[] {
    return all('button.day:enabled')
      .filter((each) => each.tabIndex === 0)
      .map((each) => each.textContent.trim());
  }

  function focusedDay(): string {
    const focused = document.activeElement;
    return focused?.classList.contains('day') ? (focused.getAttribute('aria-label') ?? '') : '';
  }

  describe('the month', () => {
    it('is drawn under the step’s question, with its name and year as the title', async () => {
      await render();

      expect(element().querySelector('.question')?.textContent.trim()).toBe('¿Cuándo?');
      expect(title()).toBe('Junio 2026');
    });

    it('starts each week on Monday', async () => {
      await render('2026-07');

      expect(all('.weekday').map((each) => each.textContent.trim())).toEqual([
        'L',
        'M',
        'X',
        'J',
        'V',
        'S',
        'D',
      ]);
      // 1 July 2026 is a Wednesday.
      expect(all('.grid > *')[2]?.textContent.trim()).toBe('1');
      expect(all('.blank')).toHaveLength(2);
      expect(all('button.day')).toHaveLength(31);
    });

    it('names each day in full for screen readers, while it shows only its number', async () => {
      await render();

      expect(day(20).getAttribute('aria-label')).toBe('sábado, 20 de junio');
      expect(day(14).getAttribute('aria-label')).toBe('domingo, 14 de junio');
    });

    it('lets today and the days after it be pressed, never the days before', async () => {
      await render();

      expect(all<HTMLButtonElement>('button.day').map((each) => each.disabled)).toEqual([
        ...Array.from({ length: 14 }, () => true),
        ...Array.from({ length: 16 }, () => false),
      ]);
      expect(day(14).hasAttribute('aria-pressed')).toBe(false);
    });

    it('ends twelve months after today', async () => {
      await render('2027-06');

      expect(day(15).disabled).toBe(false);
      expect(day(16).disabled).toBe(true);
    });
  });

  describe('a press on a day', () => {
    it('marks a free day as a date', async () => {
      await render();
      expect(marked()).toEqual([]);
      expect(day(20).getAttribute('aria-pressed')).toBe('false');

      await click(day(20));

      expect(marked()).toEqual(['20']);
      expect(day(20).classList.contains('marked')).toBe(true);
      expect(selection()).toEqual({
        singles: ['2026-06-20'],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
    });

    it('marks the day next to a marked one as another date', async () => {
      await render('2026-06', pressDay(NO_DATES, '2026-06-20'));

      await click(day(21));

      expect(marked()).toEqual(['20', '21']);
      expect(selection()).toEqual({
        singles: ['2026-06-20', '2026-06-21'],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
    });

    it('removes the date of a marked day', async () => {
      await render('2026-06', ['2026-06-20', '2026-06-21'].reduce(pressDay, NO_DATES));

      await click(day(20));

      expect(marked()).toEqual(['21']);
      expect(day(20).classList.contains('marked')).toBe(false);
      expect(selection()).toEqual({
        singles: ['2026-06-21'],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
    });

    it('takes a double-click as two presses: the day is marked and removed again', async () => {
      await render();

      await click(day(18));
      day(18).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
      day(18).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
      await fixture.whenStable();

      expect(selection()).toEqual(NO_DATES);
      expect(hint()).toBe('');
    });

    it('does nothing on a day before today', async () => {
      await render();

      await click(day(14));

      expect(selection()).toEqual(NO_DATES);
    });
  });

  describe('a range', () => {
    it('is drawn as one band: its ends as dates, the days between fainter', async () => {
      await render('2026-06', ranges([17, 19]));

      expect(look(17)).toBe('joins-next marked');
      expect(look(18)).toBe('joins-next joins-previous marked middle');
      expect(look(19)).toBe('joins-previous marked');
      expect(look(16)).toBe('');
      expect(marked()).toEqual(['17', '18', '19']);
    });

    it('is cut where it goes on in the next week', async () => {
      // 21 June 2026 is a Sunday.
      await render('2026-06', ranges([20, 23]));

      expect(look(20)).toBe('joins-next marked');
      expect(look(21)).toBe('cut-after joins-previous marked middle');
      expect(look(22)).toBe('cut-before joins-next marked middle');
      expect(look(23)).toBe('joins-previous marked');
    });

    it('keeps a date of its own next to it apart', async () => {
      await render('2026-06', { ...ranges([17, 18]), singles: [june(19)] });

      expect(look(18)).toBe('joins-previous marked');
      expect(look(19)).toBe('marked');
    });

    it('is named on each of its days for screen readers', async () => {
      await render('2026-06', { ...ranges([18, 20]), singles: [june(22)] });

      expect(day(19).getAttribute('aria-label')).toBe(
        'viernes, 19 de junio, rango del 18 de junio al 20 de junio',
      );
      expect(day(20).getAttribute('aria-label')).toBe(
        'sábado, 20 de junio, rango del 18 de junio al 20 de junio',
      );
      expect(day(22).getAttribute('aria-label')).toBe('lunes, 22 de junio');
    });

    it('is removed whole by a press on any of its days', async () => {
      await render('2026-06', ranges([17, 19], [22, 23]));

      await click(day(18));

      expect(selection()).toEqual(ranges([22, 23]));
      expect(marked()).toEqual(['22', '23']);
    });

    it('lights up whole while the mouse is over any of its days', async () => {
      await render('2026-06', { ...ranges([17, 19], [20, 21]), singles: [june(23)] });

      fire(day(18), 'pointerenter');
      await fixture.whenStable();

      expect(all('.day.lit').map((each) => each.textContent.trim())).toEqual(['17', '18', '19']);

      fire(day(18), 'pointerleave');
      fire(day(23), 'pointerenter');
      await fixture.whenStable();

      expect(all('.day.lit')).toEqual([]);

      fire(day(23), 'pointerleave');
      await fixture.whenStable();

      expect(all('.day.lit')).toEqual([]);
    });
  });

  describe('a mouse drag', () => {
    it('joins its days into a range when the mouse is released', async () => {
      await render();

      await drag(day(18), day(20));

      expect(selection()).toEqual(NO_DATES);

      await drop();

      expect(selection()).toEqual(ranges([18, 20]));
      expect(look(18)).toBe('joins-next lit marked');
      expect(look(19)).toBe('joins-next joins-previous lit marked middle');
      expect(look(20)).toBe('joins-previous lit marked');
    });

    it('shows, while it goes on, the day it began on, the days on the way and the day reached', async () => {
      await render('2026-06', pressDay(NO_DATES, june(19)));

      await drag(day(17), day(20));

      expect(look(17)).toBe('drag-anchor');
      expect(look(18)).toBe('drag-way');
      expect(look(19)).toBe('drag-way marked');
      expect(look(20)).toBe('drag-reached');
      expect(look(21)).toBe('');
      expect(grid().classList.contains('backward')).toBe(false);
    });

    it('tells the days that a range is being made, so that no marked day answers the mouse', async () => {
      await render('2026-06', ranges([19, 21]));

      expect(grid().classList.contains('making')).toBe(false);

      await drag(day(16), day(20));

      expect(grid().classList.contains('making')).toBe(true);

      await drop();

      expect(grid().classList.contains('making')).toBe(false);
    });

    it('points back when it goes to an earlier day', async () => {
      await render();

      await drag(day(20), day(18));

      expect(look(20)).toBe('drag-anchor');
      expect(look(18)).toBe('drag-reached');
      expect(grid().classList.contains('backward')).toBe(true);

      await drop();

      expect(selection()).toEqual(ranges([18, 20]));
      expect(grid().classList.contains('backward')).toBe(false);
    });

    it('lets "Siguiente" be used as soon as it would leave a date', async () => {
      await render();

      await drag(day(18), day(20));

      expect(button('Siguiente').getAttribute('aria-disabled')).toBe('false');
    });

    it('does not go on with "Siguiente" before its release', async () => {
      await render('2026-06', pressDay(NO_DATES, june(25)));
      await drag(day(18), day(20));

      await click(button('Siguiente'));

      expect(went).toEqual([]);

      await drop();
      await click(button('Siguiente'));

      expect(went).toEqual(['next']);
      expect(selection()).toEqual({
        singles: [june(25)],
        ranges: ranges([18, 20]).ranges,
        saved: [],
        times: {},
        timed: false,
      });
    });

    it('takes no press on another day before its release: nothing is undone by it', async () => {
      await render('2026-06', pressDay(NO_DATES, june(25)));
      await drag(day(18), day(20));

      // Enter on a day, or another finger: a click that is not the drag's.
      await click(day(25));
      await click(day(23));

      expect(selection()).toEqual({
        singles: [june(25)],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });

      await drop();

      expect(selection()).toEqual({
        singles: [june(25)],
        ranges: ranges([18, 20]).ranges,
        saved: [],
        times: {},
        timed: false,
      });
    });

    it('holds no day with the keyboard before its release', async () => {
      await render();
      await drag(day(18), day(20));

      await hold(day(23));
      await drop();

      expect(hint()).toBe('');
      expect(look(23)).toBe('');
      expect(selection()).toEqual(ranges([18, 20]));
    });

    it('stops at the day next to another range, which is not lit under the mouse', async () => {
      await render('2026-06', ranges([19, 21]));

      await drag(day(16), day(20));

      expect(look(18)).toBe('drag-reached');
      expect(look(19)).toBe('joins-next marked');
      expect(look(20)).toBe('joins-next joins-previous marked middle');
      expect(all('.day.lit')).toEqual([]);

      await drop();

      expect(selection()).toEqual(ranges([16, 18], [19, 21]));
      // The mouse is on the 20th: it is its range that lights up.
      expect(all('.day.lit').map((each) => each.textContent.trim())).toEqual(['19', '20', '21']);
    });

    it('moves the end of a range it begins on, drawn meanwhile from the other end', async () => {
      await render('2026-06', ranges([17, 20]));

      await drag(day(20), day(18));

      expect(look(17)).toBe('drag-anchor');
      expect(look(18)).toBe('drag-reached');
      expect(look(19)).toBe('');
      expect(look(20)).toBe('');

      await drop();

      expect(selection()).toEqual(ranges([17, 18]));
    });

    it('does nothing from a day between the ends of a range, and does not remove it', async () => {
      await render('2026-06', ranges([17, 20]));

      await drag(day(18), day(23));

      expect(look(18)).toBe('joins-next joins-previous marked middle');
      expect(look(23)).toBe('');

      // The release, and the click a browser sends after it.
      fire(document.body, 'pointerup', { buttons: 0 });
      await click(day(23));

      expect(selection()).toEqual(ranges([17, 20]));
    });

    it('leaves everything as it was when its release never comes', async () => {
      await render();
      await drag(day(18), day(20));

      // The mouse comes back with no button down.
      fire(day(20), 'pointermove', { x: 200, buttons: 0 });
      await fixture.whenStable();

      expect(look(18)).toBe('');
      expect(look(20)).toBe('');
      expect(selection()).toEqual(NO_DATES);
    });

    it('goes on in the next month when the mouse rests at the side of the days', async () => {
      await render();
      fakeWaits();
      // The days are 300 px wide, from 100 to 400.
      grid().getBoundingClientRect = () => new DOMRect(100, 0, 300, 200);
      fire(day(29), 'pointerdown', { x: 200 });
      fire(grid(), 'pointermove', { x: 395 });

      vi.advanceTimersByTime(SIDE_HOLD_MS);
      fixture.detectChanges();

      expect(title()).toBe('Julio 2026');

      fire(day(2), 'pointermove', { x: 200 });
      fire(document.body, 'pointerup', { buttons: 0 });
      fixture.detectChanges();

      expect(selection()).toEqual({
        singles: [],
        ranges: [{ start: '2026-06-29', end: '2026-07-02' }],
        saved: [],
        times: {},
        timed: false,
      });
    });
  });

  describe('a finger’s drag', () => {
    it('begins once the finger has rested on a day, drawn as the first of a range', async () => {
      await render();

      rest(day(18));

      expect(look(18)).toBe('drag-anchor');
      expect(grid().classList.contains('making')).toBe(true);
      expect(selection()).toEqual(NO_DATES);
      // The text is for the keyboard, which holds a day without dragging.
      expect(hint()).toBe('');
    });

    it('does not begin while the finger has not rested long enough', async () => {
      await render();
      fakeWaits();
      fire(day(18), 'pointerdown', finger);
      vi.advanceTimersByTime(HOLD_MS - 1);
      slide(day(18), day(20));
      lift();

      expect(look(18)).toBe('');
      expect(selection()).toEqual(NO_DATES);
    });

    it('waits for each finger’s own rest when a second one presses another day', async () => {
      await render();
      fakeWaits();
      fire(day(18), 'pointerdown', finger);
      vi.advanceTimersByTime(HOLD_MS - 100);
      fire(day(20), 'pointerdown', { pointerType: 'touch', pointerId: 8 });
      vi.advanceTimersByTime(100);
      fixture.detectChanges();

      // The first finger has rested, but the press followed is the second's by now.
      expect(grid().classList.contains('making')).toBe(false);

      vi.advanceTimersByTime(HOLD_MS - 100);
      fixture.detectChanges();

      expect(look(20)).toBe('drag-anchor');
      expect(look(18)).toBe('');
    });

    it('shows the days up to the one under the finger, and joins them when it lifts', async () => {
      await render();
      rest(day(18));

      slide(day(18), day(20));

      expect(look(18)).toBe('drag-anchor');
      expect(look(19)).toBe('drag-way');
      expect(look(20)).toBe('drag-reached');
      expect(button('Siguiente').getAttribute('aria-disabled')).toBe('false');

      lift();

      expect(selection()).toEqual(ranges([18, 20]));
      expect(grid().classList.contains('making')).toBe(false);
    });

    it('leaves a date of its own when the finger lifts without sliding', async () => {
      await render();
      rest(day(18));

      lift();

      expect(selection()).toEqual({
        singles: [june(18)],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
      expect(look(18)).toBe('marked');
    });

    it('keeps a date already marked when the finger rests on it and lifts', async () => {
      await render('2026-06', pressDay(NO_DATES, june(18)));
      rest(day(18));

      lift();

      expect(selection()).toEqual({
        singles: [june(18)],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
    });

    it('keeps a range as it was when the finger rests on one of its ends and lifts', async () => {
      await render('2026-06', ranges([17, 19]));

      rest(day(19));

      expect(look(17)).toBe('drag-anchor');
      expect(look(19)).toBe('drag-reached');

      lift();

      expect(selection()).toEqual(ranges([17, 19]));
    });

    it('moves the end of a range it begins on', async () => {
      await render('2026-06', ranges([17, 19]));
      rest(day(17));

      slide(day(17), day(16));
      lift();

      expect(selection()).toEqual(ranges([16, 19]));
    });

    it('does nothing from a day between the ends of a range', async () => {
      await render('2026-06', ranges([17, 19]));
      rest(day(18));

      slide(day(18), day(21));
      lift();

      expect(selection()).toEqual(ranges([17, 19]));
    });

    it('takes the place of a day held with the keyboard', async () => {
      await render();
      await hold(day(16));

      rest(day(18));

      expect(look(16)).toBe('');
      expect(hint()).toBe('');

      lift();

      expect(selection()).toEqual({
        singles: [june(18)],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
    });

    it('leaves the day to the keyboard afterwards: Enter on it is a press', async () => {
      await render();
      rest(day(18));
      lift();
      // No click came with the lift.
      vi.advanceTimersByTime(0);

      // Enter on a button: the key, then a click that no pointer made.
      day(18).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      day(18).click();
      fixture.detectChanges();

      expect(selection()).toEqual(NO_DATES);
    });

    it('makes no date of a day that is yesterday when the finger lifts', async () => {
      await render();
      rest(day(15));
      vi.setSystemTime(new Date(2026, 5, 16, 0, 1));

      lift();

      expect(selection()).toEqual(NO_DATES);
      expect(day(15).disabled).toBe(true);
    });
  });

  describe('the ring of a finger’s rest', () => {
    /** The elements the browser was asked to draw in its top layer. */
    let raised: Element[];

    beforeEach(() => {
      raised = [];
      // jsdom has no popovers: the browser's part, standing in.
      HTMLElement.prototype.showPopover = function (this: HTMLElement) {
        raised.push(this);
      };
    });

    afterEach(() => {
      Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
    });

    function ring(): HTMLElement | null {
      return document.querySelector('app-hold-ring');
    }

    /** A finger is put down on the day and rests `ms` milliseconds. */
    function restFor(target: HTMLElement, ms: number): void {
      fakeWaits();
      fire(target, 'pointerdown', finger);
      vi.advanceTimersByTime(ms);
      fixture.detectChanges();
    }

    it('is drawn over the whole page around the day, while the finger rests on it', async () => {
      await render();
      day(18).getBoundingClientRect = () => new DOMRect(180, 300, 46, 46);

      restFor(day(18), HOLD_MS - 1);

      expect(raised).toEqual([ring()]);
      expect(ring()?.style.insetInlineStart).toBe('180px');
      expect(ring()?.style.insetBlockStart).toBe('300px');
      expect(ring()?.style.inlineSize).toBe('46px');
    });

    it('is gone once the day is held, when its drag begins', async () => {
      await render();
      restFor(day(18), HOLD_MS);

      expect(ring()).toBeNull();
      expect(look(18)).toBe('drag-anchor');
    });

    it('is gone when the finger moves away before', async () => {
      await render();
      restFor(day(18), 200);
      fire(day(18), 'pointermove', { ...finger, x: 40 });
      fixture.detectChanges();

      expect(ring()).toBeNull();
    });

    it('is not drawn on a day between the ends of a range, which cannot be held', async () => {
      await render('2026-06', ranges([17, 20]));
      restFor(day(18), 200);

      expect(ring()).toBeNull();

      restFor(day(17), 200);

      expect(ring()).not.toBeNull();
    });

    it('is not drawn for a mouse, which drags by moving', async () => {
      await render();
      fakeWaits();
      fire(day(18), 'pointerdown');
      vi.advanceTimersByTime(200);
      fixture.detectChanges();

      expect(ring()).toBeNull();
    });
  });

  describe('a finger’s slide sideways', () => {
    /** When the touch events happen, in milliseconds. */
    let now: number;

    beforeEach(() => {
      now = 1000;
    });

    /** A touch event of one finger at `x` on `target`, or of none; the event, as it ends. */
    function touch(target: Element, type: string, x?: number, y = 300): Event {
      const touches = x === undefined ? [] : [{ identifier: 1, clientX: x, clientY: y }];
      const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        touches,
      });
      Object.defineProperty(event, 'timeStamp', { value: now });
      target.dispatchEvent(event);
      return event;
    }

    /** The real month 350 px wide; the months beside it, while they are there, 20 px from it. */
    function place(): void {
      const at = (left: number) => () => new DOMRect(left, 0, 350, 300);
      element().querySelector<HTMLElement>('.grid:not(.glimpse)')!.getBoundingClientRect = at(10);
      for (const glimpse of all('.glimpse.before')) glimpse.getBoundingClientRect = at(-360);
      for (const glimpse of all('.glimpse.after')) glimpse.getBoundingClientRect = at(380);
    }

    /**
     * A finger put down on the 18th, at 200 px, goes sideways to each of `to`, a move each
     * `every` milliseconds; it lifts `every` ms after the last one unless `lifted` is false.
     */
    async function swipe(to: number[], every = 100, lifted = true): Promise<void> {
      place();
      const target = day(18);
      touch(target, 'touchstart', 200);
      for (const x of to) {
        now += every;
        touch(target, 'touchmove', x);
        await fixture.whenStable();
        place();
      }
      if (!lifted) return;
      now += every;
      touch(target, 'touchend');
      await fixture.whenStable();
    }

    function strip(): HTMLElement {
      return element().querySelector<HTMLElement>('.strip')!;
    }

    /** The months drawn beside the one on screen, each `side month`, and how they read. */
    function glimpses(): string[] {
      return all('.glimpse').map(
        (glimpse) =>
          `${glimpse.classList.contains('before') ? 'before' : 'after'} ${String(glimpse.querySelectorAll('.day').length)}`,
      );
    }

    /** The glide of the days to their place ends. */
    async function glided(): Promise<void> {
      strip().dispatchEvent(new Event('animationend', { bubbles: true }));
      await fixture.whenStable();
    }

    it('moves the days with the finger, the months beside them in sight', async () => {
      await render('2026-07');

      await swipe([150], 100, false);

      expect(strip().style.translate).toBe('-50px');
      // June and August.
      expect(glimpses()).toEqual(['before 30', 'after 31']);
      expect(title()).toBe('Julio 2026');
    });

    it('draws the months beside for the eyes only, as they are marked', async () => {
      await render('2026-07', pressDay(pressDay(NO_DATES, '2026-08-04'), '2026-06-20'));

      await swipe([150], 100, false);

      for (const glimpse of all('.glimpse')) {
        expect(glimpse.getAttribute('aria-hidden')).toBe('true');
        expect(glimpse.querySelector('button')).toBeNull();
      }
      const august = all('.glimpse.after .day');
      expect(august[3]?.classList.contains('marked')).toBe(true);
      expect(august.filter((each) => each.classList.contains('marked'))).toHaveLength(1);
      const june = all('.glimpse.before .day');
      // Before today, 15 June, a day cannot be chosen.
      expect(june[13]?.classList.contains('off')).toBe(true);
      expect(june[14]?.classList.contains('off')).toBe(false);
      expect(june[19]?.classList.contains('marked')).toBe(true);
    });

    it('draws no month beside while no finger slides', async () => {
      await render('2026-07');

      expect(glimpses()).toEqual([]);
      expect(strip().style.translate).toBe('');
    });

    it('goes to the next month when the finger lifts past a quarter of the calendar', async () => {
      await render('2026-07');

      await swipe([150, 110]);

      expect(fixture.componentInstance.month()).toBe('2026-08');
      expect(title()).toBe('Agosto 2026');
      // The days glide on from where the finger left them: August, 20 px after July, was 90 px
      // into its way.
      expect(strip().style.translate).toBe('');
      expect(strip().classList.contains('gliding')).toBe(true);
      expect(strip().style.getPropertyValue('--glide-from')).toBe(`${String(-90 + 370)}px`);
      // July and September.
      expect(glimpses()).toEqual(['before 31', 'after 30']);

      await glided();

      expect(strip().classList.contains('gliding')).toBe(false);
      expect(glimpses()).toEqual([]);
    });

    it('goes back when the finger lifts before a quarter, slowly', async () => {
      await render('2026-07');

      await swipe([150, 115]);

      expect(fixture.componentInstance.month()).toBe('2026-07');
      expect(strip().style.getPropertyValue('--glide-from')).toBe('-85px');
      expect(strip().classList.contains('gliding')).toBe(true);
    });

    it('goes to the previous month the other way', async () => {
      await render('2026-07');

      await swipe([250, 290]);

      expect(fixture.componentInstance.month()).toBe('2026-06');
      expect(strip().style.getPropertyValue('--glide-from')).toBe(`${String(90 - 370)}px`);
    });

    it('goes to the next month with a quick flick, short of a quarter', async () => {
      await render('2026-07');

      await swipe([185, 170, 160], 10);

      expect(fixture.componentInstance.month()).toBe('2026-08');
    });

    it('stays when the flick goes back the way the days came from', async () => {
      await render('2026-07');
      // Slowly to the left, 120 px, and then quickly back, 40 px.
      await swipe([150, 80], 100, false);
      for (const x of [100, 120]) {
        now += 10;
        touch(day(18), 'touchmove', x);
      }
      now += 10;
      touch(day(18), 'touchend');
      await fixture.whenStable();

      expect(fixture.componentInstance.month()).toBe('2026-07');
      expect(strip().style.getPropertyValue('--glide-from')).toBe('-80px');
    });

    it('goes no farther than a month', async () => {
      await render('2026-07');

      await swipe([-300], 100, false);

      expect(strip().style.translate).toBe('-350px');
    });

    it('does not move past the first month, nor go before it', async () => {
      await render('2026-06');

      await swipe([300], 100, false);

      expect(strip().style.translate).toBe('0px');
      expect(glimpses()).toEqual(['after 31']);

      now += 10;
      touch(day(18), 'touchend');
      await fixture.whenStable();

      expect(fixture.componentInstance.month()).toBe('2026-06');
      expect(strip().classList.contains('gliding')).toBe(false);
    });

    it('does not move past the last month, nor go after it', async () => {
      await render('2027-06');

      await swipe([185, 170, 120], 10);

      expect(fixture.componentInstance.month()).toBe('2027-06');
    });

    it('goes back where it was when the browser takes the slide away', async () => {
      await render('2026-07');
      await swipe([100], 100, false);
      touch(day(18), 'touchcancel');
      await fixture.whenStable();

      expect(fixture.componentInstance.month()).toBe('2026-07');
      expect(strip().style.getPropertyValue('--glide-from')).toBe('-100px');
    });

    it('changes the month at once with reduced motion, with no glide', async () => {
      installTestScreen({ '(prefers-reduced-motion: reduce)': true });
      await render('2026-07');

      await swipe([150, 110]);

      expect(fixture.componentInstance.month()).toBe('2026-08');
      expect(strip().classList.contains('gliding')).toBe(false);
      expect(glimpses()).toEqual([]);
    });

    it('lets a new slide take over from a glide on its way', async () => {
      await render('2026-07');
      await swipe([150, 110]);

      await swipe([170], 100, false);

      expect(strip().classList.contains('gliding')).toBe(false);
      expect(strip().style.translate).toBe('-30px');
      expect(title()).toBe('Agosto 2026');
    });

    describe('begun while the days still glide', () => {
      /** The days, gliding, are `shown` pixels from their place now, as the browser draws them. */
      function glidingAt(shown: string): void {
        const computed = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((target, pseudo) => {
          const style = computed(target, pseudo);
          // jsdom runs no animations: the browser's part, standing in.
          if (target === strip()) Object.defineProperty(style, 'translate', { value: shown });
          return style;
        });
      }

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('takes the days from where the glide has brought them', async () => {
        await render('2026-07');
        await swipe([150, 110]);
        // August came in 280 px from its place, and is 150 px from it by now.
        glidingAt('150px');

        await swipe([170], 100, false);

        expect(strip().style.translate).toBe('120px');
      });

      it('stays on the month the glide was going to when the finger brings no other', async () => {
        await render('2026-07');
        await swipe([150, 110]);
        glidingAt('150px');

        await swipe([170]);

        expect(title()).toBe('Agosto 2026');
        expect(strip().style.getPropertyValue('--glide-from')).toBe('120px');
      });

      it('goes on to the next month when the finger brings it', async () => {
        await render('2026-07');
        await swipe([150, 110]);
        glidingAt('150px');

        await swipe([150, 100]);

        expect(title()).toBe('Septiembre 2026');
        // August, now before September, is where the finger left it: 50 px from its place.
        expect(strip().style.getPropertyValue('--glide-from')).toBe(`${String(50 + 370)}px`);
      });

      it('takes the days from their place once the glide has ended', async () => {
        await render('2026-07');
        await swipe([150, 110]);
        await glided();
        glidingAt('150px');

        await swipe([170], 100, false);

        expect(strip().style.translate).toBe('-30px');
      });
    });

    it('does not end the glide when something inside ends its own motion', async () => {
      await render('2026-07');
      await swipe([150, 110]);

      day(18).dispatchEvent(new Event('animationend', { bubbles: true }));
      await fixture.whenStable();

      expect(strip().classList.contains('gliding')).toBe(true);
    });

    it('leaves the month to a finger that goes up or down: the page scrolls', async () => {
      await render('2026-07');
      place();
      touch(day(18), 'touchstart', 200, 300);
      const moved = touch(day(18), 'touchmove', 170, 360);
      await fixture.whenStable();

      expect(moved.defaultPrevented).toBe(false);
      expect(strip().style.translate).toBe('');
      expect(glimpses()).toEqual([]);
    });

    it('is a drag of a range, not a slide, once the finger has rested on a day', async () => {
      await render('2026-07');
      place();
      touch(day(18), 'touchstart', 200);
      rest(day(18));
      const moved = touch(day(18), 'touchmove', 120);
      slide(day(18), day(20));
      lift();
      touch(day(18), 'touchend');
      fixture.detectChanges();

      expect(moved.defaultPrevented).toBe(true);
      expect(strip().style.translate).toBe('');
      expect(glimpses()).toEqual([]);
      expect(fixture.componentInstance.month()).toBe('2026-07');
      expect(selection().ranges).toEqual([{ start: '2026-07-18', end: '2026-07-20' }]);
    });

    it('leaves the month arrows as they were: the month changes at once', async () => {
      await render('2026-07');

      await click(button('Mes siguiente'));

      expect(title()).toBe('Agosto 2026');
      expect(strip().classList.contains('gliding')).toBe(false);
      expect(glimpses()).toEqual([]);
    });
  });

  describe('the tip over the day held', () => {
    it('asks for the last day of the range, for the eyes only', async () => {
      await render();
      expect(tip()).toBeNull();
      // jsdom lays nothing out: the day is given a place, its centre 200 px from the left.
      day(18).getBoundingClientRect = () => new DOMRect(180, 300, 40, 40);

      await hold(day(18));

      const shown = element().querySelector<HTMLElement>('.calendar > app-tooltip');
      expect(tip()).toBe('Elige el último día del rango.');
      expect(shown?.getAttribute('aria-hidden')).toBe('true');
      expect(shown?.style.getPropertyValue('--stem-left')).toBe('200px');
    });

    it('gets out of the way while another day has the focus, and is back with it', async () => {
      await render();
      await hold(day(18));

      await key('ArrowDown');
      expect(focusedDay()).toBe('jueves, 25 de junio');
      expect(tip()).toBeNull();
      // Screen readers were told once, and the text is still there for them.
      expect(hint()).toBe('Elige el último día del rango.');

      await key('ArrowUp');
      expect(tip()).toBe('Elige el último día del rango.');
    });

    it('goes with the month of the day held, and is back with it', async () => {
      await render();
      await hold(day(18));

      await click(button('Mes siguiente'));
      expect(tip()).toBeNull();

      await click(button('Mes anterior'));
      expect(tip()).toBe('Elige el último día del rango.');
    });

    it('is gone once the range is made', async () => {
      await render();
      await hold(day(18));

      await key('ArrowRight');
      await click(day(19));

      expect(selection()).toEqual(ranges([18, 19]));
      expect(tip()).toBeNull();
    });

    it('is gone when the day is let go', async () => {
      await render();
      await hold(day(18));

      await key('Escape');

      expect(tip()).toBeNull();
    });

    it('leaves nothing written between the two arrows', async () => {
      await render('2026-06', ranges([22, 23]));

      await hold(day(18));

      expect(element().querySelector('.nav')?.textContent.trim()).toBe('');
      expect(element().querySelector('.nav [role="status"]')).toBeNull();
    });
  });

  describe('holding a day', () => {
    it('makes it the first day of a range, and tells screen readers what to do', async () => {
      await render();

      expect(hint()).toBe('');

      await hold(day(18));

      expect(look(18)).toBe('drag-anchor');
      expect(grid().classList.contains('making')).toBe(true);
      expect(hint()).toBe('Elige el último día del rango.');
      expect(selection()).toEqual(NO_DATES);
    });

    it('makes the range with a press on its last day', async () => {
      await render();
      await hold(day(18));

      await click(day(20));

      expect(selection()).toEqual(ranges([18, 20]));
      expect(look(18)).toBe('joins-next marked');
      expect(hint()).toBe('');
    });

    it('makes the range backwards too', async () => {
      await render();
      await hold(day(20));

      await click(day(18));

      expect(selection()).toEqual(ranges([18, 20]));
    });

    it('leaves a date of its own when the day held is pressed again', async () => {
      await render();
      await hold(day(18));

      await click(day(18));

      expect(selection()).toEqual({
        singles: [june(18)],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
      expect(hint()).toBe('');
    });

    it('lets go without a range when the day held is no longer an end to begin from', async () => {
      await render();
      await hold(day(18));
      // The page gives other dates: the day held is between the ends of a range now.
      fixture.componentRef.setInput('selection', ranges([17, 19]));

      await click(day(21));

      expect(selection()).toEqual(ranges([17, 19]));
      expect(hint()).toBe('');
    });

    it('holds a date of its own without removing it', async () => {
      await render('2026-06', pressDay(NO_DATES, june(18)));

      await hold(day(18));

      expect(selection()).toEqual({
        singles: [june(18)],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
      expect(look(18)).toBe('drag-anchor marked');

      await click(day(19));

      expect(selection()).toEqual(ranges([18, 19]));
    });

    it('holds the end of a range to move it, the range drawn meanwhile from its other end', async () => {
      await render('2026-06', ranges([17, 19]));

      await hold(day(19));

      expect(selection()).toEqual(ranges([17, 19]));
      expect(look(17)).toBe('drag-anchor');
      expect(look(18)).toBe('drag-way');
      expect(look(19)).toBe('drag-reached');
      expect(hint()).toBe('Elige el último día del rango.');

      await click(day(23));

      expect(selection()).toEqual(ranges([17, 23]));
    });

    it('holds the first day of a range too', async () => {
      await render('2026-06', ranges([17, 19]));
      await hold(day(17));

      await click(day(16));

      expect(selection()).toEqual(ranges([16, 19]));
    });

    it('holds the focused day with Shift+Enter, and Enter on another day makes the range', async () => {
      await render();
      day(18).focus();

      const left = await key('Enter', true);

      // No click follows: the day is not marked.
      expect(left).toBe(false);
      expect(selection()).toEqual(NO_DATES);
      expect(look(18)).toBe('drag-anchor');
      expect(hint()).toBe('Elige el último día del rango.');

      await key('ArrowRight');
      await key('ArrowRight');
      // Enter on a button is a click that no pointer made.
      await click(day(20));

      expect(selection()).toEqual(ranges([18, 20]));
    });

    it('holds the day the arrow keys have got to, also before the focus has moved', async () => {
      await render();
      day(16).focus();
      const press = (name: string, shiftKey = false): void => {
        day(16).dispatchEvent(
          new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }),
        );
      };

      // Faster than the calendar is drawn: the focus is still on the 16th.
      press('ArrowRight');
      press('ArrowRight');
      press('Enter', true);
      await fixture.whenStable();

      expect(look(18)).toBe('drag-anchor');
      expect(look(16)).toBe('');
    });

    it('moves to another day held after it', async () => {
      await render();
      day(18).focus();
      await key('Enter', true);
      day(22).focus();

      await key('Enter', true);

      expect(look(18)).toBe('');
      expect(look(22)).toBe('drag-anchor');

      await click(day(23));

      expect(selection()).toEqual(ranges([22, 23]));
    });

    it('does not hold a day between the ends of a range with the keyboard either', async () => {
      await render('2026-06', ranges([17, 19]));
      day(18).focus();

      await key('Enter', true);

      expect(hint()).toBe('');
      expect(look(18)).toBe('joins-next joins-previous marked middle');
    });

    it('lets go with Escape: nothing is marked', async () => {
      await render();
      await hold(day(18));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await fixture.whenStable();

      expect(look(18)).toBe('');
      expect(hint()).toBe('');
      expect(selection()).toEqual(NO_DATES);

      await click(day(20));

      expect(selection()).toEqual({
        singles: [june(20)],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
    });

    it('lets go when a mouse drag begins', async () => {
      await render();
      await hold(day(17));

      await drag(day(19), day(20));

      expect(look(17)).toBe('');
      expect(hint()).toBe('');

      await drop();

      expect(selection()).toEqual(ranges([19, 20]));
    });

    it('goes on through the months: the last day can be in another one', async () => {
      await render();
      await hold(day(29));

      await click(button('Mes siguiente'));

      expect(hint()).toBe('Elige el último día del rango.');

      await click(day(2));

      expect(selection()).toEqual({
        singles: [],
        ranges: [{ start: '2026-06-29', end: '2026-07-02' }],
        saved: [],
        times: {},
        timed: false,
      });
    });

    it('lets "Siguiente" go on: the day held stays as a date of its own', async () => {
      await render();
      await hold(day(18));

      expect(button('Siguiente').getAttribute('aria-disabled')).toBe('false');

      await click(button('Siguiente'));

      expect(went).toEqual(['next']);
      expect(selection()).toEqual({
        singles: [june(18)],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
      expect(hint()).toBe('');
    });

    it('goes on with a range held by an end as it was', async () => {
      await render('2026-06', ranges([17, 19]));
      await hold(day(19));

      await click(button('Siguiente'));

      expect(went).toEqual(['next']);
      expect(selection()).toEqual(ranges([17, 19]));
    });
  });

  describe('the month arrows', () => {
    it('go to the next month and back', async () => {
      await render();

      await click(button('Mes siguiente'));

      expect(title()).toBe('Julio 2026');
      expect(fixture.componentInstance.month()).toBe('2026-07');
      expect(button('Mes anterior').getAttribute('aria-disabled')).toBe('false');

      await click(button('Mes anterior'));

      expect(title()).toBe('Junio 2026');
    });

    it('stop at the current month', async () => {
      await render();
      expect(button('Mes anterior').getAttribute('aria-disabled')).toBe('true');
      expect(button('Mes siguiente').getAttribute('aria-disabled')).toBe('false');

      await click(button('Mes anterior'));

      expect(title()).toBe('Junio 2026');
    });

    it('stop at the month of the last day that can be proposed', async () => {
      await render('2027-06');
      expect(button('Mes siguiente').getAttribute('aria-disabled')).toBe('true');
      expect(button('Mes anterior').getAttribute('aria-disabled')).toBe('false');

      await click(button('Mes siguiente'));

      expect(title()).toBe('Junio 2027');
    });

    it('go on month after month while one is held down', async () => {
      await render();
      fakeWaits();

      fire(button('Mes siguiente'), 'pointerdown');
      fixture.detectChanges();

      expect(title()).toBe('Julio 2026');

      vi.advanceTimersByTime(REPEAT_DELAY_MS + REPEAT_EVERY_MS);
      fixture.detectChanges();

      expect(title()).toBe('Septiembre 2026');

      fire(button('Mes siguiente'), 'pointerup', { buttons: 0 });
      vi.advanceTimersByTime(REPEAT_EVERY_MS);
      fixture.detectChanges();

      expect(title()).toBe('Septiembre 2026');
    });

    it('keep the dates marked in other months', async () => {
      await render('2026-06', pressDay(NO_DATES, '2026-06-20'));

      await click(button('Mes siguiente'));
      expect(marked()).toEqual([]);
      await click(day(6));
      await click(button('Mes anterior'));

      expect(marked()).toEqual(['20']);
      expect(selection()).toEqual({
        singles: ['2026-06-20', '2026-07-06'],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
    });
  });

  describe('the keyboard', () => {
    it('reaches one day with Tab: the first that can be pressed', async () => {
      await render();
      expect(tabStops()).toEqual(['15']);

      await click(button('Mes siguiente'));

      expect(tabStops()).toEqual(['1']);
    });

    it('opens on the last month when it is asked for a later one', async () => {
      await render('2027-07');

      expect(fixture.componentInstance.month()).toBe('2027-06');
      expect(title()).toBe('Junio 2027');
    });

    it('opens on the current month when it is asked for an earlier one', async () => {
      await render('2026-05');

      expect(fixture.componentInstance.month()).toBe('2026-06');
      expect(title()).toBe('Junio 2026');
    });

    it('comes back with Tab to the day used last', async () => {
      await render();

      day(20).focus();
      await fixture.whenStable();

      expect(tabStops()).toEqual(['20']);
    });

    it('moves by days and weeks with the arrow keys', async () => {
      await render();
      day(17).focus();

      expect(await key('ArrowRight')).toBe(false);
      expect(focusedDay()).toBe('jueves, 18 de junio');
      await key('ArrowDown');
      expect(focusedDay()).toBe('jueves, 25 de junio');
      await key('ArrowLeft');
      expect(focusedDay()).toBe('miércoles, 24 de junio');
      await key('ArrowUp');
      expect(focusedDay()).toBe('miércoles, 17 de junio');
      expect(tabStops()).toEqual(['17']);
    });

    it('counts every press of a key held down, also before the focus has moved', async () => {
      await render();
      day(17).focus();
      const press = (): boolean =>
        day(17).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      // The repeats of a held key arrive faster than the calendar is drawn again.
      press();
      press();
      press();
      await fixture.whenStable();

      expect(focusedDay()).toBe('sábado, 20 de junio');
      expect(tabStops()).toEqual(['20']);
    });

    it('counts them across months too', async () => {
      await render();
      day(29).focus();
      const press = (): boolean =>
        day(29).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      press();
      press();
      await fixture.whenStable();

      expect(title()).toBe('Julio 2026');
      expect(focusedDay()).toBe('lunes, 13 de julio');
    });

    it('goes on into the next month and comes back', async () => {
      await render();
      day(29).focus();

      await key('ArrowDown');

      expect(title()).toBe('Julio 2026');
      expect(fixture.componentInstance.month()).toBe('2026-07');
      expect(focusedDay()).toBe('lunes, 6 de julio');

      await key('ArrowUp');

      expect(title()).toBe('Junio 2026');
      expect(focusedDay()).toBe('lunes, 29 de junio');
    });

    it('changes the month with PageDown and PageUp, on the same day', async () => {
      await render();
      day(20).focus();

      expect(await key('PageDown')).toBe(false);
      expect(title()).toBe('Julio 2026');
      expect(focusedDay()).toBe('lunes, 20 de julio');

      await key('PageUp');
      expect(focusedDay()).toBe('sábado, 20 de junio');
    });

    it('stays on today when a key would go before it', async () => {
      await render();
      day(15).focus();

      expect(await key('ArrowLeft')).toBe(false);
      await key('ArrowUp');
      await key('PageUp');

      expect(title()).toBe('Junio 2026');
      expect(focusedDay()).toBe('lunes, 15 de junio');
    });

    it('leaves every other key to the page', async () => {
      await render();
      day(20).focus();

      expect(await key('Tab')).toBe(true);
      expect(await key('a')).toBe(true);
      expect(focusedDay()).toBe('sábado, 20 de junio');
    });

    it('marks the day it moved to when it is pressed', async () => {
      await render();
      day(29).focus();
      await key('ArrowDown');

      // Enter and Space press a button: the browser sends its click.
      await click(document.activeElement as HTMLElement);

      expect(selection()).toEqual({
        singles: ['2026-07-06'],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
    });
  });

  describe('the arrows of the step', () => {
    it('go back to step 1 at any time', async () => {
      await render();

      await click(button('Volver al paso 1'));

      expect(went).toEqual(['back']);
    });

    it('do not go on without a date, and tell screen readers why', async () => {
      await render();
      const next = button('Siguiente');

      expect(next.getAttribute('aria-disabled')).toBe('true');
      const described = next.getAttribute('aria-describedby') ?? 'none';
      expect(element().querySelector(`#${described}`)?.textContent.trim()).toBe(
        'Selecciona al menos una fecha.',
      );

      await click(next);

      expect(went).toEqual([]);
    });

    it('go on to the next step once a date is marked', async () => {
      await render();

      await click(day(20));
      const next = button('Siguiente');

      expect(next.getAttribute('aria-disabled')).toBe('false');
      expect(next.hasAttribute('aria-describedby')).toBe(false);
      expect(element().querySelector('#dates-missing')).toBeNull();

      await click(next);

      expect(went).toEqual(['next']);
    });
  });

  describe('today', () => {
    /** Midnight has passed: it is Tuesday 16 June 2026. */
    function passMidnight(): void {
      vi.setSystemTime(new Date(2026, 5, 16, 0, 5));
    }

    it('is read again on a press: yesterday is not marked, the new today is', async () => {
      await render();
      passMidnight();

      await click(day(15));

      expect(selection()).toEqual(NO_DATES);
      expect(day(15).disabled).toBe(true);
      expect(day(16).disabled).toBe(false);

      await click(day(16));

      expect(selection()).toEqual({
        singles: ['2026-06-16'],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
    });

    it('takes yesterday’s date away before going on with the later ones', async () => {
      await render('2026-06', ['2026-06-15', '2026-06-20'].reduce(pressDay, NO_DATES));
      passMidnight();

      await click(button('Siguiente'));

      expect(selection()).toEqual({
        singles: ['2026-06-20'],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
      expect(marked()).toEqual(['20']);
      expect(went).toEqual(['next']);
    });

    it('does not go on when yesterday’s was the only date', async () => {
      await render('2026-06', pressDay(NO_DATES, '2026-06-15'));
      passMidnight();

      await click(button('Siguiente'));

      expect(went).toEqual([]);
      expect(selection()).toEqual(NO_DATES);
      expect(button('Siguiente').getAttribute('aria-disabled')).toBe('true');
    });

    it('takes the dates before it away when the step is entered', async () => {
      passMidnight();

      await render('2026-06', pressDay(NO_DATES, '2026-06-15'));

      expect(selection()).toEqual(NO_DATES);
      expect(marked()).toEqual([]);
      expect(button('Siguiente').getAttribute('aria-disabled')).toBe('true');
    });

    it('brings the calendar to its month when the month has changed', async () => {
      vi.setSystemTime(new Date(2026, 5, 30, 12));
      await render();
      vi.setSystemTime(new Date(2026, 6, 1, 0, 5));

      await click(button('Mes anterior'));

      expect(fixture.componentInstance.month()).toBe('2026-07');
      expect(title()).toBe('Julio 2026');
      expect(button('Mes anterior').getAttribute('aria-disabled')).toBe('true');
      expect(day(1).disabled).toBe(false);
    });

    it('goes on to the month after the one on screen, not one further, when the month has changed', async () => {
      vi.setSystemTime(new Date(2026, 5, 30, 12));
      await render();
      vi.setSystemTime(new Date(2026, 6, 1, 0, 5));

      await click(button('Mes siguiente'));

      expect(fixture.componentInstance.month()).toBe('2026-07');
      expect(title()).toBe('Julio 2026');
    });

    it('lets go of a day held that is yesterday now', async () => {
      await render();
      await hold(day(15));
      passMidnight();

      await click(day(17));

      expect(selection()).toEqual({
        singles: [june(17)],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
      expect(hint()).toBe('');
    });

    it('keeps holding a day that is still to come', async () => {
      await render();
      await hold(day(16));
      passMidnight();

      await click(day(18));

      expect(selection()).toEqual(ranges([16, 18]));
    });

    it('holds today, and a drag begins and ends on it', async () => {
      await render();

      await hold(day(15));

      expect(hint()).toBe('Elige el último día del rango.');

      await drag(day(15), day(17));
      await drop();

      expect(selection()).toEqual(ranges([15, 17]));

      await drag(day(17), day(15));
      await drop();

      expect(selection()).toEqual({
        singles: [june(15)],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
    });

    it('drops nothing from a drag of the first day of a range that began yesterday', async () => {
      await render('2026-06', ranges([15, 20]));
      await drag(day(15), day(18));
      passMidnight();

      await drop();

      expect(selection()).toEqual(NO_DATES);
    });

    it('drops nothing from a drag of the end of a range that began yesterday', async () => {
      await render('2026-06', ranges([15, 18]));
      await drag(day(18), day(20));
      passMidnight();

      await drop();

      expect(selection()).toEqual(NO_DATES);
    });

    it('drops the range of a drag made of days still to come, without yesterday’s date', async () => {
      await render('2026-06', pressDay(NO_DATES, june(15)));
      await drag(day(17), day(19));
      passMidnight();

      await drop();

      expect(selection()).toEqual(ranges([17, 19]));
    });

    it('drops nothing either when the month changed under such a drag', async () => {
      await render('2026-06', ranges([15, 29]));
      fakeWaits();
      grid().getBoundingClientRect = () => new DOMRect(100, 0, 300, 200);
      fire(day(29), 'pointerdown', { x: 200 });
      fire(grid(), 'pointermove', { x: 395 });
      passMidnight();

      vi.advanceTimersByTime(SIDE_HOLD_MS);
      fixture.detectChanges();

      expect(title()).toBe('Julio 2026');
      // The drag is still drawn from the range's first day, in June.
      expect(all('.day.drag-anchor')).toEqual([]);

      fire(day(2), 'pointermove', { x: 200 });
      fixture.detectChanges();

      expect(look(1)).toBe('drag-way');
      expect(look(2)).toBe('drag-reached');

      fire(document.body, 'pointerup', { buttons: 0 });
      fixture.detectChanges();

      expect(selection()).toEqual(NO_DATES);
      expect(look(2)).toBe('');
    });

    it('lets go of the end held of a range that began yesterday', async () => {
      await render('2026-06', ranges([15, 18]));
      await hold(day(18));
      passMidnight();

      await click(day(20));

      expect(selection()).toEqual({
        singles: [june(20)],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      });
      expect(hint()).toBe('');
    });

    it('does not hold a day that is yesterday now', async () => {
      await render();
      day(15).focus();
      passMidnight();

      await key('Enter', true);

      expect(hint()).toBe('');
      expect(selection()).toEqual(NO_DATES);
    });

    it('drops nothing from a drag that began yesterday', async () => {
      await render();
      await drag(day(15), day(17));
      passMidnight();

      await drop();

      expect(selection()).toEqual(NO_DATES);
      expect(look(17)).toBe('');
    });

    it('drops nothing from a drag that ends on yesterday', async () => {
      await render();
      await drag(day(17), day(15));
      passMidnight();

      await drop();

      expect(selection()).toEqual(NO_DATES);
    });

    it('stops the keyboard at the new today', async () => {
      await render();
      passMidnight();
      day(16).focus();

      await key('ArrowLeft');

      expect(focusedDay()).toBe('martes, 16 de junio');
      expect(day(15).disabled).toBe(true);
    });
  });

  /** The "+" on a day's corner, if it has one. */
  function plusOn(number: number): HTMLButtonElement | null {
    return day(number).parentElement?.querySelector<HTMLButtonElement>('button.save') ?? null;
  }

  /** The numbers of the days whose "+" the mouse shows. */
  function offered(): string[] {
    return all('.cell')
      .filter((each) => each.querySelector('.save.offered'))
      .map((each) => each.querySelector('.day')?.textContent.trim() ?? '');
  }

  /** Every "+" on the calendar, with the number of its day: "19 +". */
  function pluses(): string[] {
    return all('.save').map(
      (each) => each.parentElement?.textContent.replace(/\s+/g, ' ').trim() ?? '',
    );
  }

  /** The mouse comes over an element, no button pressed. */
  async function enter(target: Element, pointerType = 'mouse'): Promise<void> {
    fire(target, 'pointerenter', { buttons: 0, pointerType });
    await fixture.whenStable();
  }

  async function leave(target: Element): Promise<void> {
    fire(target, 'pointerleave', { buttons: 0 });
    await fixture.whenStable();
  }

  const saved = (...spans: [number, number][]): DateSelection => ({
    ...NO_DATES,
    saved: ranges(...spans).ranges,
  });

  /** The pills under the calendar, as they read. */
  function pills(): string[] {
    return all('.pill-view').map((each) => {
      const seen = each.cloneNode(true) as HTMLElement;
      seen.querySelector('.visually-hidden')?.remove();
      return seen.textContent.replace(/\s+/g, ' ').trim();
    });
  }

  /** A pill, by its place: the pill itself, what shows its range, and its "−" if it has one. */
  function pill(place: number): {
    item: HTMLElement;
    view: HTMLElement;
    remove: HTMLElement | null;
  } {
    const item = all('.pill')[place];
    const view = item?.querySelector<HTMLElement>('.pill-view');
    if (!item || !view) throw new Error(`No pill ${String(place)}`);
    return { item, view, remove: item.querySelector<HTMLElement>('.remove') };
  }

  /** The numbers of the days of the saved range looked at, and whether it is pinned. */
  function viewed(): { days: string[]; pinned: boolean } {
    return {
      days: all('button.day.viewed').map((each) => each.textContent.trim()),
      pinned: grid().classList.contains('pinning'),
    };
  }

  describe('the "+" of a range', () => {
    it('is on the last day of each range, named with its range, and not shown at first', async () => {
      await render('2026-06', ranges([17, 19], [22, 23]));

      expect(pluses()).toEqual(['19 +', '23 +']);
      expect(plusOn(19)?.getAttribute('aria-label')).toBe(
        'Guardar el rango del 17 de junio al 19 de junio',
      );
      expect(plusOn(19)?.title).toBe('Guardar este rango de fechas');
      expect(plusOn(19)?.type).toBe('button');
      expect(offered()).toEqual([]);
      expect(all('.save').map((each) => each.tabIndex)).toEqual([-1, -1]);
      expect(all('.save.reachable')).toEqual([]);
    });

    it('is shown while the mouse is over any day of its range, and only then', async () => {
      await render('2026-06', ranges([17, 19], [22, 23]));

      await enter(day(18));
      expect(offered()).toEqual(['19']);

      await leave(day(18));
      expect(offered()).toEqual([]);

      await enter(day(20));
      expect(offered()).toEqual([]);
    });

    it('stays shown while the mouse is over the "+" itself', async () => {
      await render('2026-06', ranges([17, 19]));
      const plus = plusOn(19);
      if (!plus) throw new Error('No "+"');

      await enter(day(19));
      await leave(day(19));
      await enter(plus);
      expect(offered()).toEqual(['19']);

      await leave(plus);
      expect(offered()).toEqual([]);
    });

    it('is not shown by a finger’s touch, which lights no range either', async () => {
      await render('2026-06', ranges([17, 19]));

      await enter(day(18), 'touch');

      expect(offered()).toEqual([]);
      expect(all('.lit')).toEqual([]);
    });

    it('is not shown while the mouse rests where the drag ended, until it moves to another day', async () => {
      await render();
      await drag(day(17), day(19));
      await drop();
      // Released, the mouse is over the day again.
      await enter(day(19));
      expect(marked()).toEqual(['17', '18', '19']);
      expect(offered()).toEqual([]);

      await leave(day(19));
      await enter(day(18));
      expect(offered()).toEqual(['19']);

      await leave(day(18));
      await enter(day(19));
      expect(offered()).toEqual(['19']);
    });

    it('is shown again when the mouse leaves the day the drag ended on and comes back', async () => {
      await render();
      await drag(day(17), day(19));
      await drop();
      await enter(day(19));

      await leave(day(19));
      await enter(day(19));

      expect(offered()).toEqual(['19']);
    });

    it('is shown when the mouse comes back to the drag’s last day after a release off the days', async () => {
      await render();
      await drag(day(17), day(19));
      await leave(day(19));
      await drop(document.body);

      await enter(day(19));

      expect(marked()).toEqual(['17', '18', '19']);
      expect(offered()).toEqual(['19']);
    });

    it('is shown when the mouse comes over another day right after the drag', async () => {
      await render();
      await drag(day(17), day(19));
      await drop();

      await enter(day(18));
      expect(offered()).toEqual(['19']);

      // No day is left behind as the day rested on.
      await enter(day(19));
      expect(offered()).toEqual(['19']);
    });

    it('saves its range: the days are free again, the range waits as a pill and the day takes the focus', async () => {
      await render('2026-06', { ...ranges([17, 19], [22, 23]), singles: [june(25)] });

      await click(plusOn(19) ?? day(1));

      expect(selection()).toEqual({
        ...NO_DATES,
        singles: [june(25)],
        ranges: ranges([22, 23]).ranges,
        saved: ranges([17, 19]).ranges,
      });
      expect(marked()).toEqual(['22', '23', '25']);
      expect(pills()).toEqual(['Mié 17 ➔ Vie 19']);
      expect(focusedDay()).toBe('viernes, 19 de junio');
      expect(tabStops()).toEqual(['19']);
    });

    it('is on the month’s last day when its range goes on, and saves the whole range', async () => {
      const across = { start: '2026-06-29', end: '2026-07-02' };
      await render('2026-06', { ...NO_DATES, ranges: [across] });

      expect(pluses()).toEqual(['30 +']);
      expect(plusOn(30)?.getAttribute('aria-label')).toBe(
        'Guardar el rango del 29 de junio al 2 de julio',
      );

      await click(plusOn(30) ?? day(1));
      expect(selection()).toEqual({ ...NO_DATES, saved: [across], times: {}, timed: false });
      expect(focusedDay()).toBe('martes, 30 de junio');
    });

    it('is on the range’s last day in the month it ends in', async () => {
      await render('2026-07', {
        ...NO_DATES,
        ranges: [{ start: '2026-06-29', end: '2026-07-02' }],
      });

      expect(pluses()).toEqual(['2 +']);
    });

    it('is not there while a range is being made', async () => {
      await render('2026-06', ranges([17, 19]));

      await hold(day(22));
      expect(all('.save')).toEqual([]);

      await key('Escape');
      expect(all('.save')).toHaveLength(1);
    });

    it('is reached with Tab from a day of its range, and only from one', async () => {
      await render('2026-06', ranges([17, 19], [22, 23]));

      day(18).focus();
      await fixture.whenStable();
      expect(all('.save').map((each) => each.tabIndex)).toEqual([0, -1]);
      expect(all('.save').map((each) => each.classList.contains('reachable'))).toEqual([
        true,
        false,
      ]);

      day(20).focus();
      await fixture.whenStable();
      expect(all('.save').map((each) => each.tabIndex)).toEqual([-1, -1]);
      expect(all('.save.reachable')).toEqual([]);
    });

    it('saves nothing after midnight when its range began before the new today', async () => {
      await render('2026-06', ranges([15, 17]));
      const plus = plusOn(17);

      vi.setSystemTime(new Date(2026, 5, 16, 0, 1));
      await click(plus ?? day(1));

      expect(selection()).toEqual(NO_DATES);
      expect(hint()).toBe('');
    });
  });

  describe('a range like a saved one', () => {
    it('is not marked when drawn with the mouse: the pill of the saved one is pinned', async () => {
      const dates = saved([17, 19]);
      await render('2026-06', dates);

      await drag(day(17), day(19));
      expect(viewed().pinned).toBe(false);
      await drop();

      expect(selection()).toBe(dates);
      expect(marked()).toEqual([]);
      expect(viewed()).toEqual({ days: ['17', '18', '19'], pinned: true });
      expect(pill(0).item.classList.contains('pinned')).toBe(true);
      expect(hint()).toBe('');
    });

    it('is not marked when made with the keyboard either', async () => {
      const dates = saved([17, 19]);
      await render('2026-06', dates);

      await hold(day(17));
      await click(day(19));

      expect(selection()).toBe(dates);
      expect(marked()).toEqual([]);
      expect(viewed()).toEqual({ days: ['17', '18', '19'], pinned: true });
      expect(hint()).toBe('');
      expect(tip()).toBeNull();
    });

    it('keeps its pill pinned through the click that made it, and lets it go on the next', async () => {
      await render('2026-06', saved([17, 19]));
      await hold(day(17));
      await click(day(19));
      expect(viewed().pinned).toBe(true);

      // The browser sends the click of a press in the press's own task: this one is another.
      await new Promise((resolve) => setTimeout(resolve));
      await click(element());

      expect(viewed().pinned).toBe(false);
    });

    it('lets its pill go on the next press when no click followed the drag', async () => {
      await render('2026-06', saved([17, 19]));
      await drag(day(17), day(19));
      await drop();

      await new Promise((resolve) => setTimeout(resolve));
      await click(element());

      expect(viewed().pinned).toBe(false);
    });

    it('keeps its pill pinned through the click of a drag released off the days', async () => {
      await render('2026-06', saved([17, 19]));
      await drag(day(17), day(19));
      await drop(element());

      await click(element());

      expect(viewed().pinned).toBe(true);
    });

    it('pins the pill of that range among the saved ones', async () => {
      await render('2026-06', saved([17, 19], [17, 20], [22, 23]));

      await drag(day(20), day(17));
      await drop();

      expect(viewed()).toEqual({ days: ['17', '18', '19', '20'], pinned: true });
      expect(all('.pill').map((each) => each.classList.contains('pinned'))).toEqual([
        false,
        true,
        false,
      ]);
    });

    it('leaves a date of its own on its days as it was', async () => {
      const dates: DateSelection = { ...saved([17, 19]), singles: [june(18)] };
      await render('2026-06', dates);

      await drag(day(17), day(19));
      await drop();

      expect(selection()).toBe(dates);
      expect(marked()).toEqual(['18']);
      expect(viewed().pinned).toBe(true);
    });

    it('leaves a range moved by an end onto its days as it was', async () => {
      const dates: DateSelection = { ...ranges([17, 18]), saved: saved([17, 19]).saved };
      await render('2026-06', dates);

      await drag(day(18), day(19));
      await drop();

      expect(selection()).toBe(dates);
      expect(marked()).toEqual(['17', '18']);
      expect(viewed()).toEqual({ days: ['17', '18', '19'], pinned: true });
    });

    it.each([
      ['a day earlier', 16, 19, 4],
      ['a day later', 17, 20, 4],
      ['on a day of its own', 17, 17, 1],
    ])('is not a range that ends %s, which is marked', async (_, first, last, days) => {
      await render('2026-06', saved([17, 19]));

      await drag(day(first), day(last));
      await drop();

      expect(marked()).toHaveLength(days);
      expect(viewed().pinned).toBe(false);
    });
  });

  describe('the saved ranges', () => {
    const across = { start: '2026-06-29', end: '2026-07-02' };
    const three: DateSelection = {
      ...NO_DATES,
      saved: [...saved([17, 19]).saved, across, { start: '2026-07-06', end: '2026-07-08' }],
    };

    it('are pills under the calendar: those with a day in the month, in order', async () => {
      await render('2026-06', three);

      expect(pills()).toEqual(['Mié 17 ➔ Vie 19', 'Lun 29 ➔ Jue 2']);
      expect(element().querySelector('.saved-title')?.textContent.trim()).toBe(
        'Pasa el ratón para visualizar estas fechas.',
      );
      // Screen readers hear the pill's own words, with "a" in place of the arrow.
      expect(pill(1).view.hasAttribute('aria-label')).toBe(false);
      expect(pill(1).view.textContent.replace(/\s+/g, ' ').trim()).toBe('Lun 29 ➔a Jue 2');
      expect(pill(1).view.querySelector('.visually-hidden')?.textContent).toBe('a');
      expect(pill(1).view.getAttribute('aria-pressed')).toBe('false');
      expect(pill(1).view.querySelector('[aria-hidden="true"]')?.textContent).toBe('➔');
      expect(all('.pills button').every((each) => each.getAttribute('type') === 'button')).toBe(
        true,
      );
    });

    it('follow the month on screen, and are gone with their title where none has a day', async () => {
      await render('2026-07', three);
      expect(pills()).toEqual(['Lun 29 ➔ Jue 2', 'Lun 6 ➔ Mié 8']);

      await click(button('Mes siguiente'));
      expect(pills()).toEqual([]);
      expect(all('.saved-title, .pills')).toEqual([]);
    });

    it('leave a pale band on their days', async () => {
      await render('2026-06', { ...saved([17, 19]), singles: [june(22)] });

      expect(look(17)).toBe('saved saved-after');
      expect(look(18)).toBe('saved saved-after saved-before');
      expect(look(19)).toBe('saved saved-before');
      expect(look(20)).toBe('');
      expect(look(22)).toBe('marked');
      expect(marked()).toEqual(['22']);
    });

    it('are options: with only a saved range the organizer goes on', async () => {
      await render('2026-06', saved([17, 19]));

      await click(button('Siguiente'));

      expect(went).toEqual(['next']);
    });

    it('are outlined on the calendar while the mouse is over their pill', async () => {
      await render('2026-06', three);

      await enter(pill(0).item);
      expect(viewed()).toEqual({ days: ['17', '18', '19'], pinned: false });
      expect(look(17)).toBe('saved saved-after viewed viewed-after');
      expect(look(18)).toBe('saved saved-after saved-before viewed viewed-after viewed-before');
      expect(look(19)).toBe('saved saved-before viewed viewed-before');

      await leave(pill(0).item);
      expect(viewed()).toEqual({ days: [], pinned: false });
    });

    it('are not outlined by a finger’s touch', async () => {
      await render('2026-06', three);

      await enter(pill(0).item, 'touch');

      expect(viewed().days).toEqual([]);
    });

    it('are pinned by a press on their pill, and let go by another', async () => {
      await render('2026-06', three);

      await click(pill(1).view);
      expect(viewed()).toEqual({ days: ['29', '30'], pinned: true });
      expect(all('.pill-view').map((each) => each.getAttribute('aria-pressed'))).toEqual([
        'false',
        'true',
      ]);
      expect(all('.pill').map((each) => each.classList.contains('pinned'))).toEqual([false, true]);

      await click(pill(1).view);
      expect(viewed()).toEqual({ days: [], pinned: false });
      expect(pill(1).view.getAttribute('aria-pressed')).toBe('false');
    });

    it('are outlined again, the mouse still on the pill, once the pinned view is let go', async () => {
      await render('2026-06', three);
      await enter(pill(0).item);
      await click(pill(0).view);
      expect(viewed()).toEqual({ days: ['17', '18', '19'], pinned: true });

      await click(pill(0).view);

      expect(viewed()).toEqual({ days: ['17', '18', '19'], pinned: false });
    });

    it('show only the pinned range while one is pinned, whatever pill the mouse is over', async () => {
      await render('2026-06', three);
      await click(pill(0).view);

      await enter(pill(1).item);

      expect(viewed()).toEqual({ days: ['17', '18', '19'], pinned: true });
    });

    it('change places when another pill is pressed', async () => {
      await render('2026-06', three);
      await click(pill(0).view);

      await click(pill(1).view);

      expect(viewed()).toEqual({ days: ['29', '30'], pinned: true });
    });

    it('are let go with Escape', async () => {
      await render('2026-06', three);
      await click(pill(0).view);

      await key('Escape');

      expect(viewed()).toEqual({ days: [], pinned: false });
    });

    it('are let go, and nothing more, by a press on a day of the pinned view', async () => {
      await render('2026-06', three);
      await click(pill(0).view);

      await click(day(18));
      expect(viewed()).toEqual({ days: [], pinned: false });
      expect(selection()).toBe(three);

      await click(day(18));
      expect(selection().singles).toEqual([june(18)]);
    });

    it.each([17, 19])(
      'take the day %i, an end of the pinned range, as one of the view',
      async (end) => {
        await render('2026-06', three);
        await click(pill(0).view);

        await click(day(end));

        expect(selection()).toBe(three);
      },
    );

    it('are let go by a press on another day, which is marked too', async () => {
      await render('2026-06', three);
      await click(pill(0).view);

      await click(day(20));
      expect(viewed()).toEqual({ days: [], pinned: false });
      expect(selection().singles).toEqual([june(20)]);

      await click(pill(0).view);
      await click(day(16));
      expect(selection().singles).toEqual([june(16), june(20)]);
    });

    it('are let go by a click anywhere else on the page', async () => {
      await render('2026-06', three);
      await click(pill(0).view);

      await click(document.body);

      expect(viewed()).toEqual({ days: [], pinned: false });
    });

    it('stay pinned through the month arrows while the range has days in the month', async () => {
      await render('2026-06', three);
      await click(pill(1).view);

      await click(button('Mes siguiente'));
      expect(viewed()).toEqual({ days: ['1', '2'], pinned: true });

      await click(button('Mes siguiente'));
      expect(viewed()).toEqual({ days: [], pinned: false });

      // Let go for good: back in its month the range is a pill like the others.
      await click(button('Mes anterior'));
      expect(viewed()).toEqual({ days: [], pinned: false });
      expect(all('.pill-view').map((each) => each.getAttribute('aria-pressed'))).toEqual([
        'false',
        'false',
      ]);
      expect(all('.remove')).toHaveLength(2);
    });

    it('are let go when a day is held for a range, and when a drag begins', async () => {
      await render('2026-06', three);
      await click(pill(0).view);

      await hold(day(22));
      expect(viewed()).toEqual({ days: [], pinned: false });

      await key('Escape');
      await click(pill(0).view);
      await drag(day(22), day(23));
      expect(viewed()).toEqual({ days: [], pinned: false });
      await drop();
    });

    it('do not let their pinned days answer the mouse: no range lights and no "+" shows', async () => {
      await render('2026-06', { ...ranges([19, 21]), saved: ranges([17, 19]).ranges });
      await click(pill(0).view);

      await enter(day(19));
      expect(all('.lit')).toEqual([]);
      expect(offered()).toEqual([]);

      await leave(day(19));
      await enter(day(20));
      expect(all('.lit')).toHaveLength(3);
      expect(offered()).toEqual(['21']);
    });

    it('are drawn pinned over what is marked on their days', async () => {
      await render('2026-06', { ...ranges([19, 21]), saved: ranges([17, 19]).ranges });

      await click(pill(0).view);

      expect(look(19)).toBe('joins-next marked viewed viewed-before');
      expect(look(18)).toBe('saved saved-before viewed viewed-after viewed-before');
    });

    it('have a "−" each, named with its range, while none is pinned', async () => {
      await render('2026-06', three);

      expect(all('.remove').map((each) => each.getAttribute('aria-label'))).toEqual([
        'Eliminar el rango del 17 de junio al 19 de junio',
        'Eliminar el rango del 29 de junio al 2 de julio',
      ]);
      expect(pill(0).remove?.title).toBe('Eliminar este rango de fechas');

      await click(pill(0).view);
      expect(all('.remove')).toEqual([]);

      await click(pill(0).view);
      expect(all('.remove')).toHaveLength(2);
    });

    it('are deleted at once with their "−": only that range goes', async () => {
      const selection0: DateSelection = { ...three, ranges: ranges([18, 20]).ranges };
      await render('2026-06', selection0);

      await click(pill(0).remove ?? day(1));

      expect(selection()).toEqual({ ...selection0, saved: three.saved.slice(1) });
      expect(pills()).toEqual(['Lun 29 ➔ Jue 2']);
      expect(marked()).toEqual(['18', '19', '20']);
      expect(look(17)).toBe('');
    });

    it('leave nothing behind when the last one is deleted: no pills, and no going on', async () => {
      await render('2026-06', saved([17, 19]));

      await click(pill(0).remove ?? day(1));

      expect(all('.saved-title, .pills')).toEqual([]);
      expect(button('Siguiente').getAttribute('aria-disabled')).toBe('true');
      // The focus is back on the calendar, on the day in the Tab order.
      expect(focusedDay()).toBe('lunes, 15 de junio');
    });

    it('give the focus of a deleted pill to the one that takes its place, or to the last one', async () => {
      await render('2026-07', three);

      await click(pill(0).remove ?? day(1));
      expect(pills()).toEqual(['Lun 6 ➔ Mié 8']);
      expect(document.activeElement).toBe(pill(0).view);

      await click(button('Mes anterior'));
      await click(pill(0).remove ?? day(1));
      expect(pills()).toEqual([]);
      expect(focusedDay()).toBe('lunes, 15 de junio');
    });

    it('give the focus to the last pill when the deleted one was the last', async () => {
      await render('2026-06', three);

      await click(pill(1).remove ?? day(1));

      expect(pills()).toEqual(['Mié 17 ➔ Vie 19']);
      expect(document.activeElement).toBe(pill(0).view);
    });

    it('are no longer outlined once deleted, the mouse still where the pill was', async () => {
      await render('2026-06', three);
      await enter(pill(0).item);

      await click(pill(0).remove ?? day(1));

      expect(viewed().days).toEqual([]);
    });

    it('are not deleted while a drag goes on', async () => {
      await render('2026-06', three);
      await drag(day(22), day(23));

      await click(pill(0).remove ?? day(1));
      await drop();

      expect(selection()).toEqual({ ...three, ranges: ranges([22, 23]).ranges });
    });

    it('are gone after midnight when they began before the new today', async () => {
      await render('2026-06', saved([15, 17], [20, 22]));

      vi.setSystemTime(new Date(2026, 5, 16, 0, 1));
      await click(pill(1).remove ?? day(1));

      expect(selection()).toEqual(NO_DATES);
    });

    it('let the pinned view go when its range is gone after midnight', async () => {
      await render('2026-06', saved([15, 17], [20, 22]));
      await click(pill(0).view);

      vi.setSystemTime(new Date(2026, 5, 16, 0, 1));
      await click(button('Mes siguiente'));
      await click(button('Mes anterior'));

      expect(pills()).toEqual(['Sáb 20 ➔ Lun 22']);
      expect(viewed()).toEqual({ days: [], pinned: false });
      expect(all('.remove')).toHaveLength(1);
    });
  });

  describe('without a mouse', () => {
    const TOUCH = '(hover: none), (pointer: coarse)';
    const across = { start: '2026-06-29', end: '2026-07-02' };

    function adder(): HTMLButtonElement | null {
      return element().querySelector<HTMLButtonElement>('button[aria-label="Guardar un rango"]');
    }

    beforeEach(() => {
      installTestScreen({ [TOUCH]: true });
    });

    it('is told apart by the screen, and only then', async () => {
      await render('2026-06', ranges([17, 19]));
      expect(element().classList.contains('touch')).toBe(true);

      installTestScreen({ '(pointer: coarse)': true, '(hover: none)': true });
      await render('2026-06', ranges([17, 19]));
      expect(element().classList.contains('touch')).toBe(false);
      expect(adder()).toBeNull();
    });

    it('has a button under the calendar that gives way to the "+" of the ranges', async () => {
      await render('2026-06', ranges([17, 19], [22, 23]));
      expect(adder()?.type).toBe('button');
      expect(adder()?.hasAttribute('aria-pressed')).toBe(false);
      expect(grid().classList.contains('adding')).toBe(false);

      await click(adder() ?? day(1));

      // The button is gone while the "+" show; its row stays, so nothing under it moves.
      expect(adder()).toBeNull();
      expect(all('.tools')).toHaveLength(1);
      expect(grid().classList.contains('adding')).toBe(true);
      // The focus the button had goes to the first "+".
      expect(document.activeElement).toBe(plusOn(19));
    });

    it('has the button only while a range has a day on screen', async () => {
      await render('2026-06', { ...NO_DATES, singles: [june(20)], saved: ranges([17, 19]).ranges });
      expect(adder()).toBeNull();

      await drag(day(22), day(23));
      expect(adder()).toBeNull();
      await drop();
      expect(adder()).not.toBeNull();

      await click(button('Mes siguiente'));
      expect(adder()).toBeNull();
    });

    it('has the button for a range that only passes through the month', async () => {
      await render('2026-07', {
        ...NO_DATES,
        ranges: [{ start: '2026-06-29', end: '2026-08-02' }],
      });

      expect(adder()).not.toBeNull();
    });

    it('hides the "+" again once a range is saved, and the button is back', async () => {
      await render('2026-06', ranges([17, 19], [22, 23]));
      await click(adder() ?? day(1));

      await click(plusOn(19) ?? day(1));

      expect(selection().saved).toEqual(ranges([17, 19]).ranges);
      expect(adder()).not.toBeNull();
      expect(grid().classList.contains('adding')).toBe(false);
    });

    it('hides the "+" on a press on a day, which is marked as usual', async () => {
      await render('2026-06', ranges([17, 19]));
      await click(adder() ?? day(1));

      await click(day(25));

      expect(grid().classList.contains('adding')).toBe(false);
      expect(adder()).not.toBeNull();
      expect(selection().singles).toEqual([june(25)]);
    });

    it('hides the "+" on a press anywhere else on the page', async () => {
      await render('2026-06', ranges([17, 19]));
      await click(adder() ?? day(1));

      await click(document.body);

      expect(grid().classList.contains('adding')).toBe(false);
      expect(adder()).not.toBeNull();
    });

    it('hides the "+" with Escape, the focus going back to the button', async () => {
      await render('2026-06', ranges([17, 19]));
      await click(adder() ?? day(1));

      await key('Escape');

      expect(grid().classList.contains('adding')).toBe(false);
      expect(document.activeElement).toBe(adder());
      expect(adder()).not.toBeNull();
    });

    it('hides the "+" when a drag begins', async () => {
      await render('2026-06', ranges([17, 19]));
      await click(adder() ?? day(1));

      await drag(day(24), day(25));

      expect(grid().classList.contains('adding')).toBe(false);
    });

    it('hides the "+" when a day is held: Escape then only lets the day go', async () => {
      await render('2026-06', ranges([17, 19]));
      await click(adder() ?? day(1));

      await hold(day(25));
      await key('Escape');

      expect(grid().classList.contains('adding')).toBe(false);
      expect(document.activeElement).toBe(day(25));
    });

    it('leaves the focus where it is on an Escape that hides no "+"', async () => {
      await render('2026-06', ranges([17, 19]));
      day(25).focus();

      await key('Escape');

      expect(document.activeElement).toBe(day(25));
    });

    it('lets a pinned view go when the button is pressed', async () => {
      await render('2026-06', { ...ranges([22, 23]), saved: ranges([17, 19]).ranges });
      await click(pill(0).view);

      await click(adder() ?? day(1));

      expect(viewed()).toEqual({ days: [], pinned: false });
    });

    it('asks for a tap on a pill to see its range', async () => {
      await render('2026-06', saved([17, 19]));

      expect(element().querySelector('.saved-title')?.textContent.trim()).toBe(
        'Toca un rango para verlo en el calendario.',
      );
    });

    it('has a pill’s "−" only while that pill is pinned, and deletes at once', async () => {
      await render('2026-06', { ...NO_DATES, saved: [...saved([17, 19]).saved, across] });
      expect(all('.remove')).toEqual([]);

      await click(pill(1).view);
      expect(pill(0).remove).toBeNull();
      expect(pill(1).remove?.getAttribute('aria-label')).toBe(
        'Eliminar el rango del 29 de junio al 2 de julio',
      );

      await click(pill(1).remove ?? day(1));
      expect(selection().saved).toEqual(saved([17, 19]).saved);
      expect(viewed()).toEqual({ days: [], pinned: false });
      expect(all('.remove')).toEqual([]);
    });
  });

  it('lets a pinned view go on a press on the well beside the pills', async () => {
    await render('2026-06', saved([17, 19]));
    await click(pill(0).view);
    expect(viewed().pinned).toBe(true);

    await click(all('.pills')[0] ?? day(1));

    expect(viewed()).toEqual({ days: [], pinned: false });
  });

  /** The trash under the calendar, if it is there. */
  function trash(): HTMLButtonElement | null {
    return element().querySelector<HTMLButtonElement>('button[aria-label="Limpiar selección"]');
  }

  /** The options counter under the calendar, as screen readers hear it. */
  function counter(): string {
    return element().querySelector('.tools [role="status"]')?.textContent.trim() ?? 'no counter';
  }

  /** The counter is drawn as full: every option is taken. */
  function full(): boolean {
    return element().querySelector('.tools .counter')?.classList.contains('full') ?? false;
  }

  /** As many options: a range and a saved range in June 2026, the rest dates from 1 July on. */
  function options(count: number): DateSelection {
    return {
      ...NO_DATES,
      singles: Array.from({ length: count - 2 }, (_, place) => daysFrom('2026-07-01', place)),
      ranges: ranges([17, 19]).ranges,
      saved: ranges([22, 24]).ranges,
    };
  }

  /** An answer of the question the trash gives way to, if it is asked. */
  function answer(name: string): HTMLElement | undefined {
    return all('.tools button').find((each) => each.textContent.trim() === name);
  }

  /** The trash is pressed and its question answered "Sí". */
  async function clearAll(): Promise<void> {
    await click(trash() ?? day(1));
    await click(answer('Sí') ?? day(1));
  }

  describe('the trash', () => {
    it('is there only while there is something to clear, in a row that is always there', async () => {
      await render();
      expect(trash()).toBeNull();
      expect(all('.tools')).toHaveLength(1);

      await click(day(20));
      expect(trash()?.closest('.tools')).toBe(all('.tools')[0]);

      await click(day(20));
      expect(trash()).toBeNull();
      expect(all('.tools')).toHaveLength(1);
    });

    it('is there for a saved range alone, and gone once its pill is deleted', async () => {
      await render('2026-06', saved([17, 19]));
      expect(trash()).not.toBeNull();

      await click(pill(0).remove ?? day(1));

      expect(pills()).toEqual([]);
      expect(trash()).toBeNull();
    });

    it('clears every date, range and saved range with its "Sí", the month staying', async () => {
      await render('2026-07', {
        singles: ['2026-07-06'],
        ranges: [{ start: '2026-07-08', end: '2026-07-10' }],
        saved: [{ start: '2026-07-13', end: '2026-07-15' }],
        times: {},
        timed: false,
      });

      await clearAll();

      expect(selection()).toEqual(NO_DATES);
      expect(title()).toBe('Julio 2026');
      expect(marked()).toEqual([]);
      expect(pills()).toEqual([]);
      expect(went).toEqual([]);
      // With nothing left to clear the trash is gone: the focus its "Sí" had goes to the calendar.
      expect(trash()).toBeNull();
      expect(focusedDay()).toBe('miércoles, 1 de julio');
    });

    it('lets go of the day held', async () => {
      await render('2026-06', ranges([22, 23]));
      await hold(day(17));
      expect(hint()).toBe('Elige el último día del rango.');

      await clearAll();
      expect(hint()).toBe('');

      // The next press is a date of its own, not the last day of a range.
      await click(day(19));
      expect(selection()).toEqual({ ...NO_DATES, singles: [june(19)] });
    });

    it('clears nothing while a drag goes on', async () => {
      await render('2026-06', ranges([22, 23]));
      await drag(day(17), day(19));

      await clearAll();
      expect(selection()).toEqual(ranges([22, 23]));

      await drop();
      expect(selection()).toEqual(ranges([17, 19], [22, 23]));
    });

    it('reads today again: after midnight the calendar is not left on last month', async () => {
      vi.setSystemTime(new Date(2026, 5, 30, 12));
      await render('2026-06', { ...NO_DATES, singles: ['2026-07-10'] });
      vi.setSystemTime(new Date(2026, 6, 1, 0, 5));

      await clearAll();

      expect(title()).toBe('Julio 2026');
      expect(selection()).toEqual(NO_DATES);
    });

    it('asks before it clears, with a mouse too: "No" keeps every date and only "Sí" clears', async () => {
      await render('2026-06', ranges([17, 19]));

      await click(trash() ?? day(1));
      expect(selection()).toEqual(ranges([17, 19]));
      expect(trash()).toBeNull();

      await click(answer('No') ?? day(1));
      expect(selection()).toEqual(ranges([17, 19]));
      expect(trash()).not.toBeNull();

      await click(trash() ?? day(1));
      await click(answer('Sí') ?? day(1));
      expect(selection()).toEqual(NO_DATES);
    });
  });

  describe('the options counter', () => {
    it('is not there under 50 options, though screen readers wait for it', async () => {
      await render('2026-06', options(49));

      expect(counter()).toBe('');
      expect(element().querySelector('.tools .counter')).toBeNull();
    });

    it('counts each date, each range and each saved range from 50 options on', async () => {
      await render('2026-06', options(49));

      await click(day(29));
      expect(counter()).toBe('50 de 60 opciones');
      expect(element().querySelector('.tools .counter')?.textContent.trim()).toBe(
        '50 de 60 opciones',
      );

      // A range saved is the option it was.
      await click(plusOn(19) ?? day(1));
      expect(pills()).toHaveLength(2);
      expect(counter()).toBe('50 de 60 opciones');

      await click(day(30));
      expect(counter()).toBe('51 de 60 opciones');

      await click(day(29));
      await click(day(30));
      expect(counter()).toBe('');
    });

    it('turns red at 60, when a press on a free day marks nothing, and says no more', async () => {
      await render('2026-06', options(59));
      expect(counter()).toBe('59 de 60 opciones');
      expect(full()).toBe(false);

      await click(day(29));
      expect(counter()).toBe('60 de 60 opciones');
      expect(full()).toBe(true);
      expect(hint()).toBe('');

      await click(day(30));
      expect(marked()).toEqual(['17', '18', '19', '29']);
      expect(counter()).toBe('60 de 60 opciones');
      expect(hint()).toBe('');

      // A date removed makes room for another.
      await click(day(29));
      expect(counter()).toBe('59 de 60 opciones');
      expect(full()).toBe(false);
      await click(day(30));
      expect(marked()).toEqual(['17', '18', '19', '30']);
    });

    it('lets no drag nor day held leave a 61st option', async () => {
      await render('2026-06', options(60));

      await drag(day(29), day(30));
      expect([look(29), look(30)]).toEqual(['', '']);
      await drop();
      expect(selection()).toEqual(options(60));

      // A free day is held all the same; a range that would be the 61st option is not made.
      await hold(day(29));
      expect(hint()).toBe('Elige el último día del rango.');
      expect(look(29)).toBe('drag-anchor');
      await click(day(30));
      expect(selection()).toEqual(options(60));
      expect(hint()).toBe('');
      expect(look(29)).toBe('');

      // Pressed again, the day held stays free.
      await hold(day(29));
      await click(day(29));
      expect(selection()).toEqual(options(60));
      expect(hint()).toBe('');
    });

    it('goes on with a free day still held at 60, which stays free', async () => {
      await render('2026-06', options(60));

      await hold(day(29));
      await click(button('Siguiente'));

      expect(went).toEqual(['next']);
      expect(selection()).toEqual(options(60));
    });

    it('still lets a free day be held at 60 for a range that takes dates of their own in', async () => {
      const others = options(58);
      const dates = { ...others, singles: [june(26), june(27), ...others.singles] };
      await render('2026-06', dates);
      expect(counter()).toBe('60 de 60 opciones');

      await hold(day(25));
      expect(hint()).toBe('Elige el último día del rango.');

      await click(day(27));
      expect(selection()).toEqual({
        ...others,
        ranges: ranges([17, 19], [25, 27]).ranges,
      });
      expect(counter()).toBe('59 de 60 opciones');
    });

    it('still lets the end of a range be held and moved at 60', async () => {
      await render('2026-06', options(60));

      await hold(day(19));
      expect(hint()).toBe('Elige el último día del rango.');

      await click(day(20));
      expect(marked()).toEqual(['17', '18', '19', '20']);
      expect(counter()).toBe('60 de 60 opciones');
    });
  });

  describe('the "Horario" switch', () => {
    const TOUCH = '(hover: none), (pointer: coarse)';
    /** The "Horario" switch, apart from the smart calendar's above the calendar. */
    const TIMES_SWITCH = ':is(.tools, .nav) > app-switch';
    const single = (number: number): DateSelection => ({ ...NO_DATES, singles: [june(number)] });

    function timesSwitch(): HTMLInputElement | null {
      return element().querySelector<HTMLInputElement>(`${TIMES_SWITCH} input[role="switch"]`);
    }

    /** The row the switch is in, by the class of the row. */
    function row(): string | undefined {
      return element().querySelector(TIMES_SWITCH)?.parentElement?.className;
    }

    it('is there only while a date of its own is marked', async () => {
      await render();
      expect(timesSwitch()).toBeNull();

      await render('2026-06', ranges([17, 19]));
      expect(timesSwitch()).toBeNull();

      await render('2026-06', saved([17, 19]));
      expect(timesSwitch()).toBeNull();

      await render('2026-06', { ...ranges([17, 19]), singles: [june(22)] });
      expect(timesSwitch()).not.toBeNull();
    });

    it('is named "Horario" and is off until the organizer turns it on', async () => {
      await render('2026-06', single(20));

      expect(timesSwitch()?.labels?.[0]?.textContent.trim()).toBe('Horario');
      expect(timesSwitch()?.checked).toBe(false);
      expect(selection().timed).toBe(false);
    });

    it('tells the page when it is turned on and off', async () => {
      await render('2026-06', single(20));

      await click(timesSwitch() as HTMLElement);
      expect(selection().timed).toBe(true);

      await click(timesSwitch() as HTMLElement);
      expect(selection().timed).toBe(false);
    });

    it('forgets the times marked when it is turned off', async () => {
      await render('2026-06', {
        ...single(20),
        timed: true,
        times: { [june(20)]: { marked: [{ kind: 'single', at: '18:00' }], saved: [] } },
      });

      await click(timesSwitch() as HTMLElement);
      expect(selection()).toEqual({ ...single(20), timed: false, times: {} });

      await click(timesSwitch() as HTMLElement);
      expect(selection()).toEqual({ ...single(20), timed: true, times: {} });
    });

    it('shows what the page holds', async () => {
      await render('2026-06', { ...single(20), timed: true });

      expect(timesSwitch()?.checked).toBe(true);
    });

    it('comes back on when it was on and a date of its own is marked again', async () => {
      await render('2026-06', { ...single(20), timed: true });

      await click(day(20));
      expect(timesSwitch()).toBeNull();
      expect(selection().timed).toBe(true);

      await click(day(18));
      expect(timesSwitch()?.checked).toBe(true);
    });

    it('stays as it was when the trash clears every date', async () => {
      await render('2026-06', { ...single(20), timed: true });

      await click(trash() as HTMLElement);
      await click(answer('Sí')!);

      expect(selection()).toEqual({ ...NO_DATES, timed: true });
    });

    it('counts the times of the dates as options while it is on', async () => {
      const hours = Array.from({ length: 24 }, (_, hour) => ({
        kind: 'single' as const,
        at: `${String(hour).padStart(2, '0')}:00`,
      }));
      const timed: DateSelection = {
        ...NO_DATES,
        singles: [june(20), june(21), june(22)],
        times: {
          [june(20)]: { marked: hours, saved: [] },
          [june(21)]: { marked: hours, saved: [] },
          [june(22)]: { marked: hours.slice(0, 11), saved: [] },
        },
        timed: true,
      };
      await render('2026-06', timed);
      expect(counter()).toBe('59 de 60 opciones');

      await click(day(23));
      expect(counter()).toBe('60 de 60 opciones');
      await click(day(24));
      expect(marked()).toEqual(['20', '21', '22', '23']);

      await click(timesSwitch() as HTMLElement);
      expect(counter()).toBe('');
      await click(day(24));
      expect(marked()).toEqual(['20', '21', '22', '23', '24']);
    });

    it('is in the row under the calendar with a mouse, after the counter', async () => {
      await render('2026-06', single(20));

      expect(row()).toBe('tools');
      expect(element().querySelector('.tools')?.lastElementChild?.tagName).toBe('APP-SWITCH');
    });

    it('is between the two arrows without a mouse, just before "Siguiente"', async () => {
      installTestScreen({ [TOUCH]: true });
      await render('2026-06', single(20));

      expect(all(TIMES_SWITCH)).toHaveLength(1);
      expect(row()).toBe('nav');
      expect(element().querySelector(TIMES_SWITCH)?.previousElementSibling).toBe(
        button('Volver al paso 1'),
      );
      expect(element().querySelector(TIMES_SWITCH)?.nextElementSibling).toBe(button('Siguiente'));
    });
  });

  describe('the smart calendar', () => {
    const TOUCH = '(hover: none), (pointer: coarse)';
    const UNCLEAR = 'No hemos entendido bien tu petición. Prueba a ser más específico.';
    const READINGS = '/api/date-interpretations';
    let httpTesting: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      httpTesting = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      httpTesting.verify();
    });

    /** The reading of a phrase that gives these days, each a date of its own, and tells nothing. */
    function days(...dates: string[]): DateInterpretation {
      return {
        options: dates.map((date) => ({ dates: { kind: 'single', date }, time: null })),
        questions: [],
        notices: [],
        timesLeftOut: [],
        questionsNotAsked: [],
      };
    }

    /** The same reading, which tells that the phrase was not understood well. */
    function unclear(reading: DateInterpretation): DateInterpretation {
      return { ...reading, notices: [{ kind: 'unclear' }] };
    }

    /** The smart calendar's button, the sparkles, by its name. */
    function asker(): HTMLButtonElement {
      const found = element().querySelector<HTMLButtonElement>(
        'button[aria-label="Generar fechas con IA"]',
      );
      if (!found) throw new Error('No button of the smart calendar');
      return found;
    }

    /** Whether the sparkles say that the box is open. */
    function pressed(): boolean {
      return asker().getAttribute('aria-pressed') === 'true';
    }

    /** The "X" of the open box; `null` while the box is closed. */
    function closer(): HTMLButtonElement | null {
      return element().querySelector<HTMLButtonElement>(
        'button[aria-label="Cerrar el calendario inteligente"]',
      );
    }

    /** What is said over the sparkles; `null` while nothing is. */
    function tip(): string | null {
      return element().querySelector('.top app-tooltip')?.textContent.trim() ?? null;
    }

    /** The box's text box; `null` while the box is closed. */
    function field(): HTMLTextAreaElement | null {
      return element().querySelector<HTMLTextAreaElement>('app-phrase-box textarea');
    }

    function calendar(): HTMLElement {
      const found = element().querySelector<HTMLElement>('.calendar');
      if (!found) throw new Error('No calendar');
      return found;
    }

    /** This phrase is written in the open box, in place of what it had. */
    async function write(phrase: string): Promise<void> {
      const box = field();
      if (!box) throw new Error('No text box');
      box.value = phrase;
      box.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    }

    /** The sparkles are pressed: the box opens, and this phrase is written in it. */
    async function open(phrase?: string): Promise<void> {
      await click(asker());
      if (phrase !== undefined) await write(phrase);
    }

    /** The phrases the API has been asked to read and has not answered. */
    function asked(): string[] {
      return httpTesting
        .match(READINGS)
        .map((each) => (each.request.body as { text: string }).text);
    }

    /** The box has taken the answer of the API, which no step of Angular's waits for. */
    async function taken(): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    }

    /** The phrase written is sent with the step's button, and the API answers with this reading. */
    async function generate(reading: DateInterpretation): Promise<void> {
      await click(button('Generar fechas'));
      httpTesting.expectOne(READINGS).flush(reading);
      await taken();
    }

    /** The box is opened, this phrase written and sent, and the API answers with this reading. */
    async function ask(phrase: string, reading: DateInterpretation): Promise<void> {
      await open(phrase);
      await generate(reading);
    }

    /** What the reading tells above the calendar, each of its lines; `[]` while it tells nothing. */
    function told(): string[] {
      const region = element().querySelector('.told[role="status"]');
      if (!region) throw new Error('No place for what a reading tells');
      return [...region.querySelectorAll('app-notice-box p')].map((each) =>
        each.textContent.replace(/\s+/g, ' ').trim(),
      );
    }

    function labels(): (string | null)[] {
      return all('.nav button').map((each) => each.getAttribute('aria-label'));
    }

    describe('its button', () => {
      it("is the sparkles, named in words, beside the step's question and not pressed when the step is entered", async () => {
        await render('2026-06', NO_DATES, 'todos los lunes de julio');

        expect(element().querySelector('.top .question')?.textContent.trim()).toBe('¿Cuándo?');
        expect(asker().closest('.top')).not.toBeNull();
        expect(asker().getAttribute('type')).toBe('button');
        expect(pressed()).toBe(false);
        expect(field()).toBeNull();
        expect(closer()).toBeNull();
        expect(calendar().classList.contains('covered')).toBe(false);
        expect(calendar().hasAttribute('inert')).toBe(false);
      });

      it('says "Generar fechas con IA" over the sparkles while the mouse is on them, until pressed', async () => {
        await render();

        fire(asker(), 'pointerenter');
        await fixture.whenStable();
        expect(tip()).toBe('Generar fechas con IA');

        fire(asker(), 'pointerout');
        await new Promise((resolve) => setTimeout(resolve, TIP_LINGER_MS));
        await fixture.whenStable();
        expect(tip()).toBeNull();

        fire(asker(), 'pointerenter');
        await click(asker());
        expect(tip()).toBeNull();
      });

      it('keeps "Generar fechas con IA" while the mouse moves onto it to read it, until Escape', async () => {
        await render();
        fire(asker(), 'pointerenter');
        await fixture.whenStable();
        const shown = element().querySelector('.top app-tooltip');
        if (!shown) throw new Error('No tip over the sparkles');

        asker().dispatchEvent(
          new MouseEvent('pointerout', { bubbles: true, relatedTarget: shown }),
        );
        await fixture.whenStable();
        expect(tip()).toBe('Generar fechas con IA');

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await fixture.whenStable();
        expect(tip()).toBeNull();
      });

      it('says nothing over the sparkles when a finger touches them', async () => {
        await render();

        fire(asker(), 'pointerenter', { pointerType: 'touch' });
        await fixture.whenStable();

        expect(tip()).toBeNull();
      });

      it('closes the box with its "X": the calendar is back and the focus on the sparkles', async () => {
        await render('2026-06', ranges([17, 19]));
        await open('todos los lunes');
        const x = closer();
        if (!x) throw new Error('No "X" in the open box');

        await click(x);

        expect(closer()).toBeNull();
        expect(field()).toBeNull();
        expect(pressed()).toBe(false);
        expect(calendar().classList.contains('covered')).toBe(false);
        expect(calendar().hasAttribute('inert')).toBe(false);
        expect(selection()).toEqual(ranges([17, 19]));
        expect(document.activeElement).toBe(asker());
      });

      it('opens the box over the calendar, which keeps its place unseen and out of reach', async () => {
        await render();

        await open();

        expect(pressed()).toBe(true);
        expect(closer()).not.toBeNull();
        expect(calendar().classList.contains('covered')).toBe(true);
        expect(calendar().getAttribute('inert')).toBe('');
        // Both in the one place: the box is as large as the calendar under it.
        expect(field()?.closest('.place')).toBe(calendar().parentElement);
        expect(document.activeElement).toBe(field());
      });

      it('brings the calendar back when the sparkles are pressed again', async () => {
        await render('2026-06', ranges([17, 19]));
        await open();

        await click(asker());

        expect(pressed()).toBe(false);
        expect(field()).toBeNull();
        expect(calendar().classList.contains('covered')).toBe(false);
        expect(calendar().hasAttribute('inert')).toBe(false);
        expect(selection()).toEqual(ranges([17, 19]));
      });

      it('lets go of the day held', async () => {
        await render();
        await hold(day(17));
        expect(hint()).toBe('Elige el último día del rango.');

        await open();
        expect(hint()).toBe('');

        // Back on the calendar, the next press is a date of its own, not the last day of a range.
        await click(asker());
        await click(day(19));
        expect(selection()).toEqual({ ...NO_DATES, singles: [june(19)] });
      });

      it('shows the phrase the page holds, and gives the page what is written', async () => {
        await render('2026-06', NO_DATES, 'todos los lunes de julio');

        await open();
        expect(field()?.value).toBe('todos los lunes de julio');

        await write('el 6 de julio');
        expect(fixture.componentInstance.phrase()).toBe('el 6 de julio');
      });
    });

    describe('the arrow that goes on', () => {
      it('is the button that has the phrase read while the box is open, and "Siguiente" otherwise', async () => {
        await render('2026-06', ranges([17, 19]));
        expect(labels()).toEqual(['Volver al paso 1', 'Siguiente']);

        await open();
        expect(labels()).toEqual(['Volver al paso 1', 'Generar fechas']);

        await click(asker());
        expect(labels()).toEqual(['Volver al paso 1', 'Siguiente']);
      });

      it('sends nothing while there is nothing to read, and says so to screen readers', async () => {
        await render('2026-06', ranges([17, 19]));
        await open();

        expect(button('Generar fechas').getAttribute('aria-disabled')).toBe('true');

        await click(button('Generar fechas'));

        expect(asked()).toEqual([]);
        // Nor does it go on to the next step, though dates are marked.
        expect(went).toEqual([]);
      });

      it('has the phrase read with a press, once, while its answer is waited for', async () => {
        await render();
        await open('todos los lunes de julio');
        expect(button('Generar fechas').getAttribute('aria-disabled')).toBe('false');

        await click(button('Generar fechas'));
        expect(button('Generar fechas').getAttribute('aria-disabled')).toBe('true');

        await click(button('Generar fechas'));
        expect(asked()).toEqual(['todos los lunes de julio']);
        expect(went).toEqual([]);
      });

      it('goes back to step 1 with the box open too', async () => {
        await render();
        await open('todos los lunes de julio');

        await click(button('Volver al paso 1'));

        expect(went).toEqual(['back']);
        expect(asked()).toEqual([]);
      });
    });

    describe('a phrase that gives dates', () => {
      it('leaves them in place of those chosen before, saved ranges too', async () => {
        await render('2026-06', {
          singles: [june(20)],
          ranges: ranges([22, 23]).ranges,
          saved: ranges([24, 26]).ranges,
          times: {},
          timed: false,
        });

        await ask('el 29 y el 30', days(june(29), june(30)));

        expect(selection()).toEqual({ ...NO_DATES, singles: [june(29), june(30)] });
        expect(marked()).toEqual(['29', '30']);
        expect(pills()).toEqual([]);
      });

      it('closes the box: the calendar is back, with the focus, and the arrow goes on', async () => {
        await render();

        await ask('el 29', days(june(29)));

        expect(pressed()).toBe(false);
        expect(field()).toBeNull();
        expect(calendar().classList.contains('covered')).toBe(false);
        expect(calendar().hasAttribute('inert')).toBe(false);
        expect(focusedDay()).toBe('lunes, 15 de junio');

        await click(button('Siguiente'));
        expect(went).toEqual(['next']);
      });

      it('takes the calendar to the month of the first day marked, whichever was said first', async () => {
        await render();

        await ask('el 3 de agosto y el 6 de julio', days('2026-08-03', '2026-07-06'));

        expect(title()).toBe('Julio 2026');
        expect(fixture.componentInstance.month()).toBe('2026-07');
        expect(marked()).toEqual(['6']);
        expect(focusedDay()).toBe('miércoles, 1 de julio');
      });

      it('keeps its text for the next time the box opens', async () => {
        await render();
        await ask('el 29', days(june(29)));

        expect(fixture.componentInstance.phrase()).toBe('el 29');

        await open();
        expect(field()?.value).toBe('el 29');
      });

      it('keeps the times asked for before it', async () => {
        await render('2026-06', { ...NO_DATES, singles: [june(20)], timed: true });

        await ask('el 29', days(june(29)));

        expect(selection()).toEqual({ ...NO_DATES, singles: [june(29)], timed: true });
      });
    });

    describe('a phrase that gives no dates', () => {
      it('leaves the box open and the dates as they were, with why in the box', async () => {
        await render('2026-06', ranges([17, 19]));

        await ask('cuando sea', unclear(days()));

        expect(pressed()).toBe(true);
        expect(selection()).toEqual(ranges([17, 19]));
        expect(element().querySelector('app-phrase-box app-notice-box p')?.textContent.trim()).toBe(
          UNCLEAR,
        );
        expect(told()).toEqual([]);
      });
    });

    describe('what a reading tells about its dates', () => {
      it('shows above the calendar, where screen readers hear it, and nothing for a plain reading', async () => {
        await render();
        expect(told()).toEqual([]);

        await ask('el 29 o así', unclear(days(june(29))));
        expect(told()).toEqual([UNCLEAR]);

        await ask('el 30', days(june(30)));
        expect(told()).toEqual([]);
      });

      it('goes with its cross, the dates staying', async () => {
        await render();
        await ask('el 29 o así', unclear(days(june(29))));

        await click(button('Cerrar aviso'));

        expect(told()).toEqual([]);
        expect(selection()).toEqual({ ...NO_DATES, singles: [june(29)] });
      });

      it('goes with the trash, and does not come back with the next dates', async () => {
        await render();
        await ask('el 29 o así', unclear(days(june(29))));

        await clearAll();
        expect(told()).toEqual([]);

        await click(day(20));
        expect(told()).toEqual([]);
      });

      it('is not shown while the box is open, and is back when it is closed with no new dates', async () => {
        await render();
        await ask('el 29 o así', unclear(days(june(29))));

        await open();
        expect(told()).toEqual([]);

        // A phrase that gives no dates tells why in the box, and changes nothing above the calendar.
        await generate({
          options: [],
          questions: [],
          notices: [{ kind: 'unclear' }],
          timesLeftOut: [],
          questionsNotAsked: [],
        });
        expect(told()).toEqual([]);

        await click(asker());
        expect(told()).toEqual([UNCLEAR]);
      });
    });

    describe('the trash', () => {
      it('is there for a text alone only while the box is open', async () => {
        await render('2026-06', NO_DATES, 'todos los lunes de julio');
        expect(trash()).toBeNull();

        await open();
        expect(trash()).not.toBeNull();

        await click(asker());
        expect(trash()).toBeNull();
      });

      it('is not there for an open box with nothing written', async () => {
        await render();

        await open();
        expect(trash()).toBeNull();

        await write('t');
        expect(trash()).not.toBeNull();
      });

      it('clears the text, the box staying open with the focus on its text box', async () => {
        await render('2026-06', NO_DATES, 'todos los lunes de julio');
        await open();

        await clearAll();

        expect(fixture.componentInstance.phrase()).toBe('');
        expect(field()?.value).toBe('');
        expect(pressed()).toBe(true);
        expect(trash()).toBeNull();
        expect(document.activeElement).toBe(field());
      });

      it('clears the dates with the text while the box is open', async () => {
        await render('2026-06', ranges([17, 19]), 'todos los lunes de julio');
        await open();

        await clearAll();

        expect(selection()).toEqual(NO_DATES);
        expect(fixture.componentInstance.phrase()).toBe('');
        expect(document.activeElement).toBe(field());
      });

      it('clears what the open box tells about a phrase that gave no dates', async () => {
        await render();
        await ask('cuando sea', unclear(days()));
        expect(all('app-phrase-box app-notice-box')).toHaveLength(1);

        await clearAll();

        expect(all('app-phrase-box app-notice-box')).toHaveLength(0);
        expect(field()?.value).toBe('');
      });

      it('drops the answer waited for: nothing is marked when it comes, and the box stays open', async () => {
        await render('2026-06', ranges([17, 19]));
        await open('el 29');
        await click(button('Generar fechas'));

        await clearAll();
        httpTesting.expectOne(READINGS).flush(days(june(29)));
        await taken();

        expect(selection()).toEqual(NO_DATES);
        expect(pressed()).toBe(true);
        expect(field()?.value).toBe('');
        expect(told()).toEqual([]);
      });

      it('clears a text kept in the closed box with the dates', async () => {
        await render('2026-06', ranges([17, 19]), 'todos los lunes de julio');

        await clearAll();

        expect(selection()).toEqual(NO_DATES);
        expect(fixture.componentInstance.phrase()).toBe('');
        expect(focusedDay()).toBe('lunes, 15 de junio');
      });
    });

    describe('under the calendar', () => {
      it('keeps the pills, the counter and the "Horario" switch while the box is open', async () => {
        await render('2026-06', { ...saved([24, 26]), singles: [june(20)] });
        const below = (): string[] =>
          all('app-saved-pills, .tools > *').map((each) => each.tagName.toLowerCase());
        const before = below();
        expect(before).toEqual([
          'app-saved-pills',
          'app-ask-first-button',
          'app-option-counter',
          'app-switch',
        ]);

        await open();

        expect(below()).toEqual(before);
      });

      it('has no button for the "+" of the ranges without a mouse while the box is open', async () => {
        installTestScreen({ [TOUCH]: true });
        await render('2026-06', ranges([17, 19]));
        const adder = (): HTMLButtonElement | null =>
          element().querySelector<HTMLButtonElement>('button[aria-label="Guardar un rango"]');
        expect(adder()).not.toBeNull();

        await open();
        expect(adder()).toBeNull();

        await click(asker());
        expect(adder()).not.toBeNull();
      });
    });
  });

  it('is styled only with tokens', () => {
    expect(literalValues(datesStyles)).toEqual([]);
  });
});

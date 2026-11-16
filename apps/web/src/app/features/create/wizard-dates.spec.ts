import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { REPEAT_DELAY_MS, REPEAT_EVERY_MS } from '../../shared/ui/hold-repeat';
import { HOLD_MS } from '../../shared/ui/long-press';
import { type DateSelection, NO_DATES, pressDay } from './date-selection';
import { SIDE_HOLD_MS } from './day-drag';
import { WizardDates } from './wizard-dates';
import datesStyles from './wizard-dates.scss' with { loader: 'text' };

describe('WizardDates', () => {
  let fixture: ComponentFixture<WizardDates>;
  let went: string[];

  beforeEach(() => {
    // Monday 15 June 2026: the calendar goes up to 15 June 2027.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    TestBed.configureTestingModule({ imports: [WizardDates], providers: [provideI18n()] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function render(month = '2026-06', selection = NO_DATES): Promise<void> {
    fixture = TestBed.createComponent(WizardDates);
    fixture.componentRef.setInput('month', month);
    fixture.componentRef.setInput('selection', selection);
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

  /** The weekdays and the days: what a drag is made over. */
  function grid(): HTMLElement {
    const found = element().querySelector<HTMLElement>('.grid');
    if (!found) throw new Error('No grid');
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

  /** A pointer event as jsdom has them: a mouse event that says which pointer made it. */
  function fire(
    target: Element,
    type: string,
    init: { x?: number; buttons?: number; pointerType?: string; detail?: number } = {},
  ): void {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: init.x ?? 0,
      buttons: init.buttons ?? 1,
      detail: init.detail ?? 1,
    });
    Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
    target.dispatchEvent(event);
  }

  /** The mouse is pressed on a day and moved onto another: a drag, not released yet. */
  async function drag(from: HTMLElement, to: HTMLElement): Promise<void> {
    fire(from, 'pointerdown', { x: 100 });
    fire(to, 'pointerenter', { x: 200 });
    fire(to, 'pointermove', { x: 200 });
    await fixture.whenStable();
  }

  async function drop(): Promise<void> {
    fire(document.body, 'pointerup', { buttons: 0 });
    await fixture.whenStable();
  }

  /** What a browser sends for a double-click: two clicks, the second counted, then the event. */
  async function doubleClick(target: HTMLElement, pointerType = 'mouse'): Promise<void> {
    fire(target, 'pointerdown', { pointerType });
    fire(target, 'click', { detail: 1 });
    fire(target, 'click', { detail: 2 });
    fire(target, 'dblclick', { detail: 2 });
    await fixture.whenStable();
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

  /** A finger rests on a day until the long-press fires, and lifts. */
  function longPress(target: HTMLElement): void {
    fakeWaits();
    fire(target, 'pointerdown', { pointerType: 'touch' });
    vi.advanceTimersByTime(HOLD_MS);
    fire(target, 'pointerup', { pointerType: 'touch', buttons: 0 });
    fixture.detectChanges();
  }

  const june = (number: number): string => `2026-06-${String(number).padStart(2, '0')}`;

  /** A selection of ranges in June 2026, each by its first and last day. */
  function ranges(...spans: [number, number][]): DateSelection {
    return {
      singles: [],
      ranges: spans.map(([start, end]) => ({ start: june(start), end: june(end) })),
    };
  }

  /** How a day is drawn: its classes, in order, without the one every day has. */
  function look(number: number): string {
    return [...day(number).classList]
      .filter((name) => name !== 'day')
      .sort()
      .join(' ');
  }

  /** The text between the two arrows under the calendar, as screen readers hear it. */
  function hint(): string {
    return element().querySelector('.nav > [role="status"]')?.textContent.trim() ?? 'no hint';
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
    it('is drawn under the step’s label, with its name and year as the title', async () => {
      await render();

      expect(element().querySelector('.instructions')?.textContent.trim()).toBe(
        'Selecciona las fechas o utiliza el calendario inteligente.',
      );
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
      expect(all('.grid > *').map((each) => each.className)[7 + 2]).toContain('day');
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
      expect(selection()).toEqual({ singles: ['2026-06-20'], ranges: [] });
    });

    it('marks the day next to a marked one as another date', async () => {
      await render('2026-06', pressDay(NO_DATES, '2026-06-20'));

      await click(day(21));

      expect(marked()).toEqual(['20', '21']);
      expect(selection()).toEqual({ singles: ['2026-06-20', '2026-06-21'], ranges: [] });
    });

    it('removes the date of a marked day', async () => {
      await render('2026-06', ['2026-06-20', '2026-06-21'].reduce(pressDay, NO_DATES));

      await click(day(20));

      expect(marked()).toEqual(['21']);
      expect(day(20).classList.contains('marked')).toBe(false);
      expect(selection()).toEqual({ singles: ['2026-06-21'], ranges: [] });
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

    it('is not taken back by a double-click on a day pressed before it', async () => {
      await render();
      await click(day(18));
      await drag(day(20), day(18));
      await drop();

      fire(day(18), 'dblclick', { detail: 2 });
      await fixture.whenStable();

      expect(selection()).toEqual(ranges([18, 20]));
      expect(hint()).toBe('');
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
      });
    });
  });

  describe('holding a day', () => {
    it('makes it the first day of a range, and says what to do under the calendar', async () => {
      await render();

      expect(hint()).toBe('');

      await doubleClick(day(18));

      expect(look(18)).toBe('drag-anchor');
      expect(grid().classList.contains('making')).toBe(true);
      expect(hint()).toBe('Elige el último día del rango.');
      expect(selection()).toEqual(NO_DATES);
    });

    it('makes the range with a press on its last day', async () => {
      await render();
      await doubleClick(day(18));

      await click(day(20));

      expect(selection()).toEqual(ranges([18, 20]));
      expect(look(18)).toBe('joins-next marked');
      expect(hint()).toBe('');
    });

    it('makes the range backwards too', async () => {
      await render();
      await doubleClick(day(20));

      await click(day(18));

      expect(selection()).toEqual(ranges([18, 20]));
    });

    it('leaves a date of its own when the day held is pressed again', async () => {
      await render();
      await doubleClick(day(18));

      await click(day(18));

      expect(selection()).toEqual({ singles: [june(18)], ranges: [] });
      expect(hint()).toBe('');
    });

    it('leaves a date of its own when the day held is double-clicked', async () => {
      await render();
      await doubleClick(day(18));

      await doubleClick(day(18));

      expect(selection()).toEqual({ singles: [june(18)], ranges: [] });
      expect(hint()).toBe('');
    });

    it('lets go without a range when the day held is no longer an end to begin from', async () => {
      await render();
      await doubleClick(day(18));
      // The page gives other dates: the day held is between the ends of a range now.
      fixture.componentRef.setInput('selection', ranges([17, 19]));

      await click(day(21));

      expect(selection()).toEqual(ranges([17, 19]));
      expect(hint()).toBe('');
    });

    it('holds a date of its own without removing it', async () => {
      await render('2026-06', pressDay(NO_DATES, june(18)));

      await doubleClick(day(18));

      expect(selection()).toEqual({ singles: [june(18)], ranges: [] });
      expect(look(18)).toBe('drag-anchor marked');

      await click(day(19));

      expect(selection()).toEqual(ranges([18, 19]));
    });

    it('holds the end of a range to move it, the range drawn meanwhile from its other end', async () => {
      await render('2026-06', ranges([17, 19]));

      await doubleClick(day(19));

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
      await doubleClick(day(17));

      await click(day(16));

      expect(selection()).toEqual(ranges([16, 19]));
    });

    it('does not hold a day between the ends of a range: the double-click removes it, as a click', async () => {
      await render('2026-06', ranges([17, 19]));

      await doubleClick(day(18));

      expect(selection()).toEqual(NO_DATES);
      expect(hint()).toBe('');
    });

    it('takes a double-click on the last day as one press', async () => {
      await render();
      await doubleClick(day(18));

      await doubleClick(day(20));

      expect(selection()).toEqual(ranges([18, 20]));
      expect(hint()).toBe('');
    });

    it('holds only the day both clicks of the double-click were on', async () => {
      await render();
      await click(day(17));

      fire(day(18), 'pointerdown');
      fire(day(18), 'dblclick', { detail: 2 });
      await fixture.whenStable();

      expect(selection()).toEqual({ singles: [june(17)], ranges: [] });
      expect(hint()).toBe('');
    });

    it('takes a double tap as two taps: a finger holds by resting', async () => {
      await render();

      await doubleClick(day(18), 'touch');

      expect(selection()).toEqual(NO_DATES);
      expect(hint()).toBe('');
    });

    it('holds the day a finger rests on, and the tap on another day makes the range', async () => {
      await render();

      longPress(day(18));

      expect(look(18)).toBe('drag-anchor');
      expect(hint()).toBe('Elige el último día del rango.');
      expect(selection()).toEqual(NO_DATES);

      fire(day(20), 'pointerdown', { pointerType: 'touch' });
      fire(day(20), 'click');
      fixture.detectChanges();

      expect(selection()).toEqual(ranges([18, 20]));
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
      await doubleClick(day(18));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await fixture.whenStable();

      expect(look(18)).toBe('');
      expect(hint()).toBe('');
      expect(selection()).toEqual(NO_DATES);

      await click(day(20));

      expect(selection()).toEqual({ singles: [june(20)], ranges: [] });
    });

    it('lets go when a mouse drag begins', async () => {
      await render();
      await doubleClick(day(17));

      await drag(day(19), day(20));

      expect(look(17)).toBe('');
      expect(hint()).toBe('');

      await drop();

      expect(selection()).toEqual(ranges([19, 20]));
    });

    it('goes on through the months: the last day can be in another one', async () => {
      await render();
      await doubleClick(day(29));

      await click(button('Mes siguiente'));

      expect(hint()).toBe('Elige el último día del rango.');

      await click(day(2));

      expect(selection()).toEqual({
        singles: [],
        ranges: [{ start: '2026-06-29', end: '2026-07-02' }],
      });
    });

    it('lets "Siguiente" go on: the day held stays as a date of its own', async () => {
      await render();
      await doubleClick(day(18));

      expect(button('Siguiente').getAttribute('aria-disabled')).toBe('false');

      await click(button('Siguiente'));

      expect(went).toEqual(['next']);
      expect(selection()).toEqual({ singles: [june(18)], ranges: [] });
      expect(hint()).toBe('');
    });

    it('goes on with a range held by an end as it was', async () => {
      await render('2026-06', ranges([17, 19]));
      await doubleClick(day(19));

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
      expect(selection()).toEqual({ singles: ['2026-06-20', '2026-07-06'], ranges: [] });
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

      expect(selection()).toEqual({ singles: ['2026-07-06'], ranges: [] });
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

      expect(selection()).toEqual({ singles: ['2026-06-16'], ranges: [] });
    });

    it('takes yesterday’s date away before going on with the later ones', async () => {
      await render('2026-06', ['2026-06-15', '2026-06-20'].reduce(pressDay, NO_DATES));
      passMidnight();

      await click(button('Siguiente'));

      expect(selection()).toEqual({ singles: ['2026-06-20'], ranges: [] });
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
      await doubleClick(day(15));
      passMidnight();

      await click(day(17));

      expect(selection()).toEqual({ singles: [june(17)], ranges: [] });
      expect(hint()).toBe('');
    });

    it('keeps holding a day that is still to come', async () => {
      await render();
      await doubleClick(day(16));
      passMidnight();

      await click(day(18));

      expect(selection()).toEqual(ranges([16, 18]));
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

  it('is styled only with tokens', () => {
    expect(literalValues(datesStyles)).toEqual([]);
  });
});

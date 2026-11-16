import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { type DateSelection, NO_DATES, pressDay } from './date-selection';
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
  async function key(name: string): Promise<boolean> {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(event);
    await fixture.whenStable();
    return !event.defaultPrevented;
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
      expect(selection()).toEqual({ singles: ['2026-06-20'] });
    });

    it('marks the day next to a marked one as another date', async () => {
      await render('2026-06', pressDay(NO_DATES, '2026-06-20'));

      await click(day(21));

      expect(marked()).toEqual(['20', '21']);
      expect(selection()).toEqual({ singles: ['2026-06-20', '2026-06-21'] });
    });

    it('removes the date of a marked day', async () => {
      await render('2026-06', ['2026-06-20', '2026-06-21'].reduce(pressDay, NO_DATES));

      await click(day(20));

      expect(marked()).toEqual(['21']);
      expect(day(20).classList.contains('marked')).toBe(false);
      expect(selection()).toEqual({ singles: ['2026-06-21'] });
    });

    it('does nothing on a day before today', async () => {
      await render();

      await click(day(14));

      expect(selection()).toEqual(NO_DATES);
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

    it('keep the dates marked in other months', async () => {
      await render('2026-06', pressDay(NO_DATES, '2026-06-20'));

      await click(button('Mes siguiente'));
      expect(marked()).toEqual([]);
      await click(day(6));
      await click(button('Mes anterior'));

      expect(marked()).toEqual(['20']);
      expect(selection()).toEqual({ singles: ['2026-06-20', '2026-07-06'] });
    });
  });

  describe('the keyboard', () => {
    it('reaches one day with Tab: the first that can be pressed', async () => {
      await render();
      expect(tabStops()).toEqual(['15']);

      await click(button('Mes siguiente'));

      expect(tabStops()).toEqual(['1']);
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

      expect(selection()).toEqual({ singles: ['2026-07-06'] });
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

  it('is styled only with tokens', () => {
    expect(literalValues(datesStyles)).toEqual([]);
  });
});

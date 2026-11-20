import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { type DateSelection, NO_DATES } from './date-selection';
import { DeadlineField } from './deadline-field';
import fieldStyles from './deadline-field.scss' with { loader: 'text' };

@Component({
  imports: [DeadlineField],
  template: `
    <app-deadline-field [(value)]="value" [proposed]="proposed()">
      ¿Hasta cuándo quieres que voten los participantes?
    </app-deadline-field>
  `,
})
class Host {
  readonly value = signal('2026-11-27');
  readonly proposed = signal<DateSelection>(NO_DATES);
}

describe('DeadlineField', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    // Friday 20 November 2026: the deadline can be from today to 20 November 2027.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12));
    TestBed.configureTestingModule({ imports: [Host], providers: [provideI18n()] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function render(
    value = '2026-11-27',
    proposed: DateSelection = NO_DATES,
  ): Promise<ComponentFixture<Host>> {
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.value.set(value);
    fixture.componentInstance.proposed.set(proposed);
    await fixture.whenStable();
    return fixture;
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function field(): HTMLButtonElement {
    const button = element().querySelector<HTMLButtonElement>('button[aria-expanded]');
    if (!button) throw new Error('No field');
    return button;
  }

  /** What screen readers hear for an element named by others (`aria-labelledby`). */
  function nameOf(of: Element): string {
    const ids = of.getAttribute('aria-labelledby')?.split(' ') ?? [];
    return ids
      .map((id) => element().querySelector(`#${id}`)?.textContent.trim() ?? `no #${id}`)
      .join(' ');
  }

  /** What an element's description says, as screen readers hear it with it. */
  function descriptionOf(of: Element): string {
    const ids = of.getAttribute('aria-describedby')?.split(' ') ?? [];
    return ids
      .map((id) => element().querySelector(`#${id}`)?.textContent.trim() ?? `no #${id}`)
      .join(' · ');
  }

  function calendar(): HTMLElement | null {
    return element().querySelector<HTMLElement>('.unfolded');
  }

  function title(): string {
    return element().querySelector('.month')?.textContent.trim() ?? 'no title';
  }

  /** The button of a day of the month on screen, by its number. */
  function day(number: number): HTMLButtonElement {
    const button = Array.from(element().querySelectorAll<HTMLButtonElement>('button.day')).find(
      (each) => each.textContent.trim() === String(number),
    );
    if (!button) throw new Error(`No day ${String(number)}`);
    return button;
  }

  function arrow(name: 'Mes anterior' | 'Mes siguiente'): HTMLButtonElement {
    const button = element().querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
    if (!button) throw new Error(`No ${name}`);
    return button;
  }

  async function click(button: HTMLButtonElement): Promise<void> {
    button.click();
    await fixture.whenStable();
  }

  /** A key pressed on what has the focus; answers whether the page kept its own reaction. */
  async function key(name: string): Promise<boolean> {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(event);
    await fixture.whenStable();
    return !event.defaultPrevented;
  }

  /** The numbers of the days Tab reaches, whether they can be chosen or not. */
  function tabStops(): string[] {
    return Array.from(element().querySelectorAll<HTMLButtonElement>('button.day'))
      .filter((each) => each.tabIndex === 0)
      .map((each) => each.textContent.trim());
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(fieldStyles)).toEqual([]);
  });

  describe('folded', () => {
    it('shows the deadline short, and is named by its label and the deadline', async () => {
      await render();

      expect(field().textContent.trim()).toBe('vie 27 nov 2026');
      expect(nameOf(field())).toBe(
        '¿Hasta cuándo quieres que voten los participantes? vie 27 nov 2026',
      );
    });

    it('shows no calendar, and says so', async () => {
      await render();

      expect(calendar()).toBeNull();
      expect(field().getAttribute('aria-expanded')).toBe('false');
    });

    it('follows the deadline it is given', async () => {
      await render();

      fixture.componentInstance.value.set('2027-01-08');
      await fixture.whenStable();

      expect(field().textContent.trim()).toBe('vie 8 ene 2027');
    });
  });

  describe('unfolded', () => {
    it('shows the calendar under the field, on the month of the deadline', async () => {
      await render('2027-01-08');

      await click(field());

      expect(field().getAttribute('aria-expanded')).toBe('true');
      expect(calendar()?.id).toBe(field().getAttribute('aria-controls'));
      expect(title()).toBe('Enero 2027');
    });

    it('names the weekdays from Monday on, and each day by its full name', async () => {
      await render();

      await click(field());

      expect(
        Array.from(element().querySelectorAll('.weekday')).map((each) => each.textContent.trim()),
      ).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
      expect(day(28).getAttribute('aria-label')).toBe('sábado, 28 de noviembre');
    });

    it('lets no day before today be chosen', async () => {
      await render();

      await click(field());

      expect(day(19).disabled).toBe(true);
      expect(day(20).disabled).toBe(false);
    });

    it('lets no day after the twelve months be chosen', async () => {
      await render('2027-11-15');

      await click(field());

      expect(title()).toBe('Noviembre 2027');
      expect(day(20).disabled).toBe(false);
      expect(day(21).disabled).toBe(true);
    });

    it('starts each month on its weekday, the days before it left blank', async () => {
      await render();
      await click(field());

      // 1 November 2026 is a Sunday: six days of the week come before it.
      expect(element().querySelectorAll('.grid > .blank')).toHaveLength(6);
      expect(element().querySelector('.grid > .cell')?.textContent.trim()).toBe('1');

      await click(arrow('Mes siguiente'));

      // 1 December 2026 is a Tuesday.
      expect(element().querySelectorAll('.grid > .blank')).toHaveLength(1);
    });

    it('fills the deadline, pressed, and tells what it is', async () => {
      await render();

      await click(field());

      expect(day(27).classList).toContain('chosen');
      expect(day(27).getAttribute('aria-pressed')).toBe('true');
      expect(descriptionOf(day(27))).toBe('fin de la votación');
      expect(day(26).classList).not.toContain('chosen');
      expect(day(26).getAttribute('aria-pressed')).toBe('false');
    });

    it('rings every day the dates propose, of their own, in ranges and in saved ranges', async () => {
      await render('2026-11-27', {
        ...NO_DATES,
        singles: ['2026-11-21', '2026-11-28'],
        ranges: [{ start: '2026-11-23', end: '2026-11-24' }],
        saved: [{ start: '2026-11-26', end: '2026-11-27' }],
        times: { '2026-11-21': { marked: [{ kind: 'single', at: '18:00' }], saved: [] } },
        timed: true,
      });

      await click(field());

      const ringed = Array.from(element().querySelectorAll('button.day.proposed')).map((each) =>
        Number(each.textContent.trim()),
      );
      expect(ringed).toEqual([21, 23, 24, 26, 27, 28]);
      expect(descriptionOf(day(28))).toBe('tus fechas');
      expect(descriptionOf(day(27))).toBe('tus fechas · fin de la votación');
      expect(descriptionOf(day(25))).toBe('');
    });

    it('shows the legend of the ring and of the fill', async () => {
      await render();

      await click(field());

      expect(
        Array.from(element().querySelectorAll('.legend > span')).map((each) =>
          each.textContent.trim(),
        ),
      ).toEqual(['tus fechas', 'fin de la votación']);
    });

    it('takes a day pressed as the deadline, folds, and gives the focus back to the field', async () => {
      await render();
      await click(field());

      await click(day(25));

      expect(fixture.componentInstance.value()).toBe('2026-11-25');
      expect(calendar()).toBeNull();
      expect(field().textContent.trim()).toBe('mié 25 nov 2026');
      expect(document.activeElement).toBe(field());
    });

    it('takes today itself as the deadline', async () => {
      await render();
      await click(field());

      await click(day(20));

      expect(fixture.componentInstance.value()).toBe('2026-11-20');
      expect(calendar()).toBeNull();
    });

    it('folds unchanged when the field is pressed again', async () => {
      await render();
      await click(field());

      await click(field());

      expect(calendar()).toBeNull();
      expect(field().getAttribute('aria-expanded')).toBe('false');
      expect(fixture.componentInstance.value()).toBe('2026-11-27');
    });

    it('folds unchanged on Escape, the focus back on the field', async () => {
      await render();
      await click(field());
      day(25).focus();

      await key('Escape');

      expect(calendar()).toBeNull();
      expect(fixture.componentInstance.value()).toBe('2026-11-27');
      expect(document.activeElement).toBe(field());
    });

    it('takes no focus on Escape while it is folded', async () => {
      await render();
      field().blur();

      element()
        .querySelector('app-deadline-field')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await fixture.whenStable();

      expect(document.activeElement).not.toBe(field());
    });

    it('opens again on the month of the deadline, whatever month it was left on', async () => {
      await render();
      await click(field());
      await click(arrow('Mes siguiente'));
      await click(field());

      await click(field());

      expect(title()).toBe('Noviembre 2026');
    });
  });

  describe('after midnight', () => {
    /** Five past midnight of Saturday 21 November 2026: Friday 20 is yesterday. */
    function passMidnight(): void {
      vi.setSystemTime(new Date(2026, 10, 21, 0, 5));
    }

    it('unfolds with yesterday off, though it was rendered the day before', async () => {
      await render();

      passMidnight();
      await click(field());

      expect(day(20).disabled).toBe(true);
      expect(day(21).disabled).toBe(false);
    });

    it('does not take a day that became yesterday while it was unfolded', async () => {
      await render();
      await click(field());

      passMidnight();
      await click(day(20));

      expect(fixture.componentInstance.value()).toBe('2026-11-27');
      expect(calendar()).not.toBeNull();
      expect(day(20).disabled).toBe(true);
    });

    it('still takes the new today', async () => {
      await render();
      await click(field());

      passMidnight();
      await click(day(21));

      expect(fixture.componentInstance.value()).toBe('2026-11-21');
    });

    it('draws yesterday off once a month arrow is pressed', async () => {
      await render();
      await click(field());

      passMidnight();
      await click(arrow('Mes siguiente'));
      await click(arrow('Mes anterior'));

      expect(title()).toBe('Noviembre 2026');
      expect(day(20).disabled).toBe(true);
    });

    it('draws yesterday off once an arrow key is pressed', async () => {
      await render();
      await click(field());
      day(27).focus();

      passMidnight();
      await key('ArrowRight');

      expect(day(20).disabled).toBe(true);
    });

    it('leaves no day to reach with Tab in a month that is all past', async () => {
      // Monday 30 November 2026, the last day of the month on screen.
      vi.setSystemTime(new Date(2026, 10, 30, 12));
      await render('2026-11-30');
      await click(field());

      vi.setSystemTime(new Date(2026, 11, 1, 0, 5));
      await click(day(30));

      expect(fixture.componentInstance.value()).toBe('2026-11-30');
      expect(tabStops()).toEqual([]);
    });
  });

  describe('its months', () => {
    it('go forward and back with the arrows', async () => {
      await render();
      await click(field());

      await click(arrow('Mes siguiente'));
      expect(title()).toBe('Diciembre 2026');

      await click(arrow('Mes anterior'));
      expect(title()).toBe('Noviembre 2026');
    });

    it('have the arrow forward on before the last month', async () => {
      await render();
      await click(field());

      expect(arrow('Mes siguiente').getAttribute('aria-disabled')).toBe('false');
    });

    it('stop at the month of today and at the last month, the arrows off there', async () => {
      await render();
      await click(field());

      expect(arrow('Mes anterior').getAttribute('aria-disabled')).toBe('true');
      await click(arrow('Mes anterior'));
      expect(title()).toBe('Noviembre 2026');

      for (let month = 0; month < 13; month++) await click(arrow('Mes siguiente'));

      expect(title()).toBe('Noviembre 2027');
      expect(arrow('Mes siguiente').getAttribute('aria-disabled')).toBe('true');
      expect(arrow('Mes anterior').getAttribute('aria-disabled')).toBe('false');
    });
  });

  describe('with the keyboard', () => {
    it('reaches the deadline with Tab, and no other day', async () => {
      await render();
      await click(field());

      const reached = Array.from(
        element().querySelectorAll<HTMLButtonElement>('button.day:not(:disabled)'),
      ).filter((each) => each.tabIndex === 0);

      expect(reached).toEqual([day(27)]);
    });

    it('reaches the first day that can be chosen in a month without the deadline', async () => {
      await render();
      await click(field());

      await click(arrow('Mes siguiente'));

      const reached = Array.from(
        element().querySelectorAll<HTMLButtonElement>('button.day:not(:disabled)'),
      ).filter((each) => each.tabIndex === 0);
      expect(reached.map((each) => each.textContent.trim())).toEqual(['1']);
    });

    it('never reaches a day that cannot be chosen', async () => {
      await render('2026-12-05');
      await click(field());

      await click(arrow('Mes anterior'));

      // November has days before today: Tab reaches today, the first that can be chosen.
      expect(title()).toBe('Noviembre 2026');
      expect(tabStops()).toEqual(['20']);
    });

    it('reaches the deadline again when it unfolds again, not the day used last time', async () => {
      await render();
      await click(field());
      day(25).focus();
      await fixture.whenStable();
      expect(tabStops()).toEqual(['25']);
      await click(field());

      await click(field());

      expect(tabStops()).toEqual(['27']);
    });

    it('goes on from the day reached when a key repeats before the focus has moved', async () => {
      await render();
      await click(field());
      const from = day(27);
      from.focus();

      // A held key: the second press is still on the day the first one left.
      for (let press = 0; press < 2; press++) {
        from.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
        );
      }
      await fixture.whenStable();

      expect(document.activeElement).toBe(day(29));
      expect(tabStops()).toEqual(['29']);
    });

    it('moves by day and by week with the arrow keys, the page not scrolling', async () => {
      await render();
      await click(field());
      day(27).focus();

      expect(await key('ArrowRight')).toBe(false);
      expect(document.activeElement).toBe(day(28));

      await key('ArrowDown');
      expect(title()).toBe('Diciembre 2026');
      expect(document.activeElement).toBe(day(5));

      await key('ArrowUp');
      await key('ArrowLeft');
      expect(title()).toBe('Noviembre 2026');
      expect(document.activeElement).toBe(day(27));
    });

    it('changes the month with PageUp and PageDown, to the same day', async () => {
      await render();
      await click(field());
      day(27).focus();

      await key('PageDown');

      expect(title()).toBe('Diciembre 2026');
      expect(document.activeElement).toBe(day(27));

      await key('PageUp');

      expect(title()).toBe('Noviembre 2026');
      expect(document.activeElement).toBe(day(27));
    });

    it('never goes before today', async () => {
      await render();
      await click(field());
      day(20).focus();

      await key('ArrowLeft');
      await key('ArrowUp');

      expect(document.activeElement).toBe(day(20));
    });

    it('leaves the other keys alone', async () => {
      await render();
      await click(field());
      day(27).focus();

      expect(await key('a')).toBe(true);
      expect(document.activeElement).toBe(day(27));
    });
  });
});

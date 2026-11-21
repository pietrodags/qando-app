import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { DeadlineField } from './deadline-field';
import fieldStyles from './deadline-field.scss' with { loader: 'text' };

@Component({
  imports: [DeadlineField],
  template: `
    <app-deadline-field [(value)]="value">
      ¿Hasta cuándo quieres que voten los participantes?
    </app-deadline-field>
  `,
})
class Host {
  readonly value = signal('2026-11-27');
}

type Part = 'Día' | 'Mes' | 'Año';

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

  async function render(value = '2026-11-27'): Promise<ComponentFixture<Host>> {
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.value.set(value);
    await fixture.whenStable();
    return fixture;
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function select(part: Part): HTMLSelectElement {
    const found = element().querySelector<HTMLSelectElement>(`select[aria-label="${part}"]`);
    if (!found) throw new Error(`No select "${part}"`);
    return found;
  }

  /** What a select offers, as it shows it. */
  function offered(part: Part): string[] {
    return Array.from(select(part).options).map((option) => option.textContent.trim());
  }

  /** What a select shows chosen. */
  function shown(part: Part): string {
    const chosen = Array.from(select(part).options).filter((option) => option.selected);
    return chosen.map((option) => option.textContent.trim()).join(' + ');
  }

  /** The three selects as they read: "27 noviembre 2026". */
  function reading(): string {
    return [shown('Día'), shown('Mes'), shown('Año')].join(' ');
  }

  /** An option chosen in a select, by its value, as the browser does it. */
  async function choose(part: Part, value: string): Promise<void> {
    const chosen = select(part);
    chosen.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    chosen.value = value;
    chosen.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  function days(from: number, to: number): string[] {
    return Array.from({ length: to - from + 1 }, (_, index) => String(from + index));
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(fieldStyles)).toEqual([]);
  });

  it('is a group of a day, a month and a year, named by its label', async () => {
    await render();
    const group = element().querySelector('[role="group"]');
    const label = element().querySelector(`#${group?.getAttribute('aria-labelledby') ?? ''}`);
    expect(label?.textContent.trim()).toBe('¿Hasta cuándo quieres que voten los participantes?');
    expect(
      Array.from(group?.querySelectorAll('select') ?? []).map((each) =>
        each.getAttribute('aria-label'),
      ),
    ).toEqual(['Día', 'Mes', 'Año']);
  });

  it('shows the deadline, its month in words', async () => {
    await render('2026-12-05');
    expect(reading()).toBe('5 diciembre 2026');
  });

  it('offers from today on, in this month and year', async () => {
    await render('2026-11-27');
    expect(offered('Día')).toEqual(days(20, 30));
    expect(offered('Mes')).toEqual(['noviembre', 'diciembre']);
    expect(offered('Año')).toEqual(['2026', '2027']);
  });

  it('offers every day of a month after this one', async () => {
    await render('2026-12-05');
    expect(offered('Día')).toEqual(days(1, 31));
  });

  it('offers only the days a month has', async () => {
    await render('2027-02-10');
    expect(offered('Día')).toEqual(days(1, 28));
  });

  it('offers the months of next year up to the last one a deadline can be', async () => {
    await render('2027-02-10');
    expect(offered('Mes')).toEqual([
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
    ]);
  });

  it('offers the days of the last month up to the last one a deadline can be', async () => {
    await render('2027-11-05');
    expect(offered('Día')).toEqual(days(1, 20));
  });

  it('takes the day chosen', async () => {
    await render('2026-11-27');
    await choose('Día', '29');
    expect(fixture.componentInstance.value()).toBe('2026-11-29');
    expect(reading()).toBe('29 noviembre 2026');
  });

  it('takes the month chosen, keeping the day', async () => {
    await render('2026-11-27');
    await choose('Mes', '12');
    expect(fixture.componentInstance.value()).toBe('2026-12-27');
    expect(reading()).toBe('27 diciembre 2026');
    expect(offered('Día')).toEqual(days(1, 31));
  });

  it('takes the year chosen, keeping the month and the day', async () => {
    await render('2026-11-20');
    await choose('Año', '2027');
    expect(fixture.componentInstance.value()).toBe('2027-11-20');
    expect(reading()).toBe('20 noviembre 2027');
    await choose('Año', '2026');
    expect(fixture.componentInstance.value()).toBe('2026-11-20');
  });

  it('moves a day the new month lacks to its last day', async () => {
    await render('2027-01-31');
    await choose('Mes', '2');
    expect(fixture.componentInstance.value()).toBe('2027-02-28');
    expect(reading()).toBe('28 febrero 2027');
  });

  it('moves a date after the last one a deadline can be to that last day', async () => {
    await render('2026-12-27');
    await choose('Año', '2027');
    expect(fixture.componentInstance.value()).toBe('2027-11-20');
    expect(reading()).toBe('20 noviembre 2027');
  });

  it('moves a date already past to today', async () => {
    await render('2027-01-05');
    await choose('Año', '2026');
    expect(fixture.componentInstance.value()).toBe('2026-11-20');
    expect(reading()).toBe('20 noviembre 2026');
  });

  describe('after midnight', () => {
    it('no longer offers yesterday', async () => {
      await render('2026-11-27');
      vi.setSystemTime(new Date(2026, 10, 21, 0, 5));
      select('Día').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await fixture.whenStable();
      expect(offered('Día')).toEqual(days(21, 30));
    });

    it('still shows a deadline of yesterday, until another day is chosen', async () => {
      await render('2026-11-20');
      vi.setSystemTime(new Date(2026, 10, 21, 0, 5));
      select('Día').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await fixture.whenStable();
      expect(offered('Día')).toEqual(days(20, 30));
      expect(reading()).toBe('20 noviembre 2026');
      await choose('Día', '25');
      expect(offered('Día')).toEqual(days(21, 30));
    });

    it('reads today again on each choice', async () => {
      await render('2026-12-05');
      vi.setSystemTime(new Date(2026, 10, 21, 0, 5));
      const chosen = select('Mes');
      chosen.value = '11';
      chosen.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      expect(fixture.componentInstance.value()).toBe('2026-11-21');
    });
  });
});

import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { type DateSelection, NO_DATES } from './date-selection';
import { OptionCounter } from './option-counter';
import counterStyles from './option-counter.scss' with { loader: 'text' };

/** `count` days in a row from 1 July 2026, each a date of its own. */
function days(count: number): DateSelection {
  const singles = Array.from({ length: count }, (_, place) =>
    new Date(Date.UTC(2026, 6, 1 + place)).toISOString().slice(0, 10),
  );
  return { ...NO_DATES, singles };
}

describe('OptionCounter', () => {
  let fixture: ComponentFixture<OptionCounter>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [OptionCounter], providers: [provideI18n()] });
  });

  async function render(selection: DateSelection): Promise<HTMLElement> {
    fixture = TestBed.createComponent(OptionCounter);
    fixture.componentRef.setInput('selection', selection);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(counterStyles)).toEqual([]);
  });

  it('is a status that says nothing while the options are far from the most', async () => {
    const host = await render(days(49));

    expect(host.getAttribute('role')).toBe('status');
    expect(host.textContent.trim()).toBe('');
    expect(host.querySelector('.counter')).toBeNull();
  });

  it('says how many options are taken from 50 on', async () => {
    const host = await render(days(50));

    expect(host.textContent.trim()).toBe('50 de 60 opciones');
    expect(host.querySelector('.counter')?.classList).not.toContain('full');
  });

  it('counts the times of the dates while times are asked for', async () => {
    const two = [
      { kind: 'single', at: '09:00' },
      { kind: 'single', at: '10:00' },
    ] as const;
    const host = await render({ ...days(49), times: { '2026-07-01': two }, timed: true });

    expect(host.textContent.trim()).toBe('50 de 60 opciones');
  });

  it('is one short of full at 59', async () => {
    const host = await render(days(59));

    expect(host.textContent.trim()).toBe('59 de 60 opciones');
    expect(host.querySelector('.counter')?.classList).not.toContain('full');
  });

  it('turns red once every option is taken', async () => {
    const host = await render(days(60));

    expect(host.textContent.trim()).toBe('60 de 60 opciones');
    expect(host.querySelector('.counter')?.classList).toContain('full');
  });

  it('follows the selection', async () => {
    const host = await render(days(57));

    fixture.componentRef.setInput('selection', days(3));
    await fixture.whenStable();

    expect(host.textContent.trim()).toBe('');
  });
});

import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { chipLabel, DateChip } from './date-chip';
import chipStyles from './date-chip.scss' with { loader: 'text' };

@Component({
  imports: [DateChip],
  template: `<app-date-chip [start]="start()" [end]="end()" />`,
})
class Host {
  readonly start = signal('2026-07-07');
  readonly end = signal('2026-07-10');
}

describe('DateChip', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideI18n()] });
  });

  async function chipText(start: string, end: string): Promise<string> {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.start.set(start);
    fixture.componentInstance.end.set(end);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent.replace(/\s+/g, ' ').trim();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(chipStyles)).toEqual([]);
  });

  it('names a range by the short weekday and day of its ends, joined by an arrow', async () => {
    expect(await chipText('2026-07-07', '2026-07-10')).toBe('Mar 7➔Vie 10');
  });

  it('names a single date by its short weekday and day', async () => {
    expect(await chipText('2026-07-08', '2026-07-08')).toBe('Mié 8');
    expect(await chipText('2026-07-11', '2026-07-11')).toBe('Sáb 11');
  });

  it('keeps the arrow out of what is read aloud', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const arrow = (fixture.nativeElement as HTMLElement).querySelector('.arrow');

    expect(arrow?.getAttribute('aria-hidden')).toBe('true');
  });

  it('says in words what it shows, for the name of the button that holds it', () => {
    expect(chipLabel('2026-07-07', '2026-07-10', 'es')).toBe('Mar 7 – Vie 10');
    expect(chipLabel('2026-07-08', '2026-07-08', 'es')).toBe('Mié 8');
  });
});

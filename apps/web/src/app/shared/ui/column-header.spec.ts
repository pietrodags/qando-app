import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { ColumnHeader } from './column-header';
import headerStyles from './column-header.scss' with { loader: 'text' };

@Component({
  imports: [ColumnHeader],
  template: `<app-column-header [start]="start()" [end]="end()" />`,
})
class Host {
  readonly start = signal('2026-07-06');
  readonly end = signal<string | null>(null);
}

describe('ColumnHeader', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideI18n()] });
  });

  async function render(start: string, end: string | null = null): Promise<ComponentFixture<Host>> {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.start.set(start);
    fixture.componentInstance.end.set(end);
    await fixture.whenStable();
    return fixture;
  }

  function header(fixture: ComponentFixture<Host>): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector('app-column-header')!;
  }

  /** The header's lines, read as flat text: "Jul 6 Lun", "Jul 11 Sáb ➔ Jul 12 Dom". */
  function lines(fixture: ComponentFixture<Host>): string {
    return Array.from(header(fixture).querySelectorAll('*'))
      .filter((part) => part.children.length === 0)
      .map((part) => part.textContent.trim())
      .join(' ');
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(headerStyles)).toEqual([]);
  });

  it('shows a single day as its month, its day and its weekday, one over the other', async () => {
    const fixture = await render('2026-07-06');
    const stacks = Array.from(header(fixture).querySelectorAll('.stack'), (stack) =>
      Array.from(stack.children, (line) => line.textContent.trim()),
    );

    expect(stacks).toEqual([['Jul', '6', 'Lun']]);
    expect(header(fixture).querySelector('.arrow')).toBeNull();
  });

  it('shows a range of days as both ends, joined by an arrow', async () => {
    const fixture = await render('2026-07-11', '2026-07-12');

    expect(lines(fixture)).toBe('Jul 11 Sáb ➔ Jul 12 Dom');
  });

  it('shortens every month and weekday to three letters, September too', async () => {
    const fixture = await render('2026-09-01');

    expect(lines(fixture)).toBe('Sep 1 Mar');
  });

  it('follows its days when they change', async () => {
    const fixture = await render('2026-07-06');

    fixture.componentInstance.start.set('2026-07-07');
    fixture.componentInstance.end.set('2026-07-10');
    await fixture.whenStable();
    expect(lines(fixture)).toBe('Jul 7 Mar ➔ Jul 10 Vie');

    fixture.componentInstance.end.set(null);
    await fixture.whenStable();
    expect(lines(fixture)).toBe('Jul 7 Mar');
  });
});

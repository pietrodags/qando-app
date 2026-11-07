import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { NameList } from './name-list';
import listStyles from './name-list.scss' with { loader: 'text' };

const names = {
  preferred: ['Luis'],
  available: ['Álvaro', 'Marta'],
  unavailable: ['Ana (2)'],
};

describe('NameList', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NameList], providers: [provideI18n()] });
  });

  async function render(): Promise<ComponentFixture<NameList>> {
    const fixture = TestBed.createComponent(NameList);
    fixture.componentRef.setInput('names', names);
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<NameList>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function toggle(fixture: ComponentFixture<NameList>): HTMLButtonElement {
    const found = element(fixture).querySelector('button');
    if (found === null) throw new Error('No toggle');
    return found;
  }

  function chips(fixture: ComponentFixture<NameList>): string[] {
    return Array.from(element(fixture).querySelectorAll('li'), (chip) =>
      [chip.className, chip.textContent.replace(/\s+/g, ' ').trim()].join(': '),
    );
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(listStyles)).toEqual([]);
  });

  it('looks like the list of an option of the chart unless told otherwise', async () => {
    const fixture = await render();

    expect(element(fixture).classList).toContain('option');
  });

  it('starts closed, with only its toggle', async () => {
    const fixture = await render();

    expect(toggle(fixture).textContent.trim()).toBe('Lista de asistentes');
    expect(toggle(fixture).getAttribute('aria-expanded')).toBe('false');
    expect(chips(fixture)).toEqual([]);
  });

  it('opens on a press: the preferred first, then the available, then who cannot come', async () => {
    const fixture = await render();

    toggle(fixture).click();
    await fixture.whenStable();

    expect(toggle(fixture).getAttribute('aria-expanded')).toBe('true');
    expect(chips(fixture)).toEqual([
      'preferred: Luis, Preferida',
      'available: Álvaro',
      'available: Marta',
      'unavailable: Ana (2), No puede',
    ]);
  });

  it('names the list it opens, with an ID of its own', async () => {
    const fixture = await render();
    const other = await render();
    toggle(fixture).click();
    toggle(other).click();
    await fixture.whenStable();
    await other.whenStable();

    const id = toggle(fixture).getAttribute('aria-controls');
    expect(element(fixture).querySelector('ul')?.id).toBe(id);
    expect(toggle(other).getAttribute('aria-controls')).not.toBe(id);
  });

  it('closes on a second press', async () => {
    const fixture = await render();

    toggle(fixture).click();
    await fixture.whenStable();
    toggle(fixture).click();
    await fixture.whenStable();

    expect(toggle(fixture).getAttribute('aria-expanded')).toBe('false');
    expect(chips(fixture)).toEqual([]);
  });
});

import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { Option, ResultsOption } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { ResultsChart } from './results-chart';
import chartStyles from './results-chart.scss' with { loader: 'text' };

function day(date: string): Option {
  return {
    id: '6f1c2a0e-0000-4000-8000-000000000001',
    dates: { kind: 'single', date },
    time: null,
  };
}

const names = { preferred: ['Luis'], available: ['Marta'], unavailable: ['Ana'] };
const july10: ResultsOption = {
  option: day('2026-07-10'),
  preferred: 1,
  available: 1,
  unavailable: 2,
  names,
};
const july6: ResultsOption = {
  option: day('2026-07-06'),
  preferred: 0,
  available: 2,
  unavailable: 0,
};

describe('ResultsChart', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ResultsChart], providers: [provideI18n()] });
  });

  async function render(
    winners: ResultsOption[],
    alternatives: ResultsOption[] = [],
  ): Promise<ComponentFixture<ResultsChart>> {
    const fixture = TestBed.createComponent(ResultsChart);
    fixture.componentRef.setInput('winners', winners);
    fixture.componentRef.setInput('alternatives', alternatives);
    fixture.componentRef.setInput('voters', 4);
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<ResultsChart>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function textsOf(fixture: ComponentFixture<ResultsChart>, selector: string): string[] {
    return Array.from(element(fixture).querySelectorAll(selector), (found) =>
      found.textContent.replace(/\s+/g, ' ').trim(),
    );
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(chartStyles)).toEqual([]);
  });

  it('shows the legend of the three answers', async () => {
    const fixture = await render([july10]);

    expect(textsOf(fixture, '.legend li')).toEqual(['Preferida', 'Disponible', 'No puede']);
  });

  it('draws one bar per winner, its answers counted and as wide as their share of voters', async () => {
    const fixture = await render([july10]);
    const segments = Array.from(element(fixture).querySelectorAll<HTMLElement>('.segment'));

    expect(textsOf(fixture, '.option-title')).toEqual(['Vie 10 Jul']);
    expect(segments.map((segment) => segment.className)).toEqual([
      'segment preferred',
      'segment available',
      'segment unavailable',
    ]);
    expect(segments.map((segment) => segment.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      '1 Preferida',
      '1 Disponible',
      '2 No puede',
    ]);
    expect(segments.map((segment) => segment.style.getPropertyValue('--share'))).toEqual([
      '0.25',
      '0.25',
      '0.5',
    ]);
  });

  it('leaves out an answer nobody gave', async () => {
    const fixture = await render([july6]);

    expect(textsOf(fixture, '.segment')).toEqual(['2 Disponible']);
  });

  it('offers the names of an option when the event is named', async () => {
    const fixture = await render([july10], [july6]);

    expect(element(fixture).querySelectorAll('app-name-list')).toHaveLength(1);
  });

  it('heads the alternatives apart, after the winners', async () => {
    const fixture = await render([july10], [july6]);

    expect(textsOf(fixture, '.option-title')).toEqual(['Vie 10 Jul', 'Lun 6 Jul']);
    expect(textsOf(fixture, '.alternatives-title')).toEqual(['Fecha alternativa:']);
  });

  it('says alternatives in the plural when there are several', async () => {
    const fixture = await render([july10], [july6, july6]);

    expect(textsOf(fixture, '.alternatives-title')).toEqual(['Fechas alternativas:']);
  });

  it('has no alternatives heading without alternatives', async () => {
    const fixture = await render([july10]);

    expect(element(fixture).querySelector('.alternatives-title')).toBeNull();
  });
});

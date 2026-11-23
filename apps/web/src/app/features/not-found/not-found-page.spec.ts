import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { NotFoundPage } from './not-found-page';
import pageStyles from './not-found-page.scss' with { loader: 'text' };

describe('NotFoundPage', () => {
  async function render(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [NotFoundPage],
      providers: [provideI18n(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(NotFoundPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(pageStyles)).toEqual([]);
  });

  it('says the page was not found and why that may be', async () => {
    const element = await render();

    expect(element.querySelector('h1')?.textContent.trim()).toBe('Página no encontrada');
    expect(element.querySelector('p')?.textContent.trim()).toBe(
      'Esta página no existe o el enlace está incompleto. Revisa que lo hayas copiado entero. Los eventos se borran 6 meses después de su fecha.',
    );
  });

  it('offers a way back to the home page, a house named for screen readers', async () => {
    const element = await render();

    const home = element.querySelector('a');
    expect(home?.getAttribute('aria-label')).toBe('Ir al inicio');
    expect(home?.textContent.trim()).toBe('');
    expect(home?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(home?.getAttribute('href')).toBe('/');
  });
});

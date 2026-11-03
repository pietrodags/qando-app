import { TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { LoadingState } from './loading-state';
import loadingStyles from './loading-state.scss' with { loader: 'text' };

describe('LoadingState', () => {
  async function render(message?: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({ imports: [LoadingState], providers: [provideI18n()] });
    const fixture = TestBed.createComponent(LoadingState);
    if (message !== undefined) {
      fixture.componentRef.setInput('message', message);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(loadingStyles)).toEqual([]);
  });

  it('announces that the page is loading', async () => {
    const element = await render();

    expect(element.querySelector('[role="status"]')?.textContent.trim()).toBe('Cargando…');
  });

  it('says what is loading when the page tells it', async () => {
    const element = await render('Cargando información del evento…');

    expect(element.querySelector('[role="status"]')?.textContent.trim()).toBe(
      'Cargando información del evento…',
    );
  });

  it('hides the spinner from screen readers', async () => {
    const element = await render();

    expect(element.querySelector('.spinner')?.getAttribute('aria-hidden')).toBe('true');
  });
});

import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { ErrorState } from './error-state';
import errorStyles from './error-state.scss' with { loader: 'text' };

describe('ErrorState', () => {
  async function render(
    inputs: Record<string, unknown> = {},
  ): Promise<ComponentFixture<ErrorState>> {
    TestBed.configureTestingModule({ imports: [ErrorState], providers: [provideI18n()] });
    const fixture = TestBed.createComponent(ErrorState);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    return fixture;
  }

  function element(fixture: ComponentFixture<ErrorState>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function retryButton(fixture: ComponentFixture<ErrorState>): HTMLButtonElement | null {
    return element(fixture).querySelector('button');
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(errorStyles)).toEqual([]);
  });

  it('alerts that the content could not be loaded', async () => {
    const fixture = await render();

    expect(element(fixture).querySelector('[role="alert"]')?.textContent.trim()).toBe(
      'No se ha podido cargar',
    );
  });

  it('says what went wrong when the page tells it', async () => {
    const fixture = await render({ message: 'Este evento no existe' });

    expect(element(fixture).querySelector('[role="alert"]')?.textContent.trim()).toBe(
      'Este evento no existe',
    );
  });

  it('offers to try again and reports the click', async () => {
    const fixture = await render();
    let retries = 0;
    fixture.componentInstance.retry.subscribe(() => (retries += 1));

    const button = retryButton(fixture);
    expect(button?.textContent.trim()).toBe('Reintentar');
    expect(button?.type).toBe('button');
    button?.click();

    expect(retries).toBe(1);
  });

  it('offers no retry when trying again cannot help', async () => {
    const fixture = await render({ retryable: false });

    expect(retryButton(fixture)).toBeNull();
  });
});

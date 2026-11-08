import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
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

  describe('when the API limits the requests', () => {
    const limited = new HttpErrorResponse({
      status: 429,
      error: { error: { code: 'RATE_LIMITED', message: 'Too many requests', details: [] } },
      headers: new HttpHeaders({ 'Retry-After': '2' }),
    });

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function wait(fixture: ComponentFixture<ErrorState>, ms: number): void {
      vi.advanceTimersByTime(ms);
      fixture.detectChanges();
    }

    it('says so and counts down the seconds before trying again', () => {
      TestBed.configureTestingModule({ imports: [ErrorState], providers: [provideI18n()] });
      const fixture = TestBed.createComponent(ErrorState);
      fixture.componentRef.setInput('error', limited);
      fixture.detectChanges();

      expect(element(fixture).querySelector('[role="alert"]')?.textContent.trim()).toBe(
        'Hay demasiadas visitas desde tu red en este momento.',
      );
      expect(retryButton(fixture)?.textContent.trim()).toBe('Reintentar en 2 s');
      expect(retryButton(fixture)?.disabled).toBe(true);

      wait(fixture, 1000);
      expect(retryButton(fixture)?.textContent.trim()).toBe('Reintentar en 1 s');

      wait(fixture, 1000);
      expect(retryButton(fixture)?.textContent.trim()).toBe('Reintentar');
      expect(retryButton(fixture)?.disabled).toBe(false);
      expect(element(fixture).querySelector('[role="alert"]')?.textContent.trim()).toBe(
        'Hay demasiadas visitas desde tu red en este momento.',
      );
    });
  });

  it('tells any other error as a load error', async () => {
    const fixture = await render({ error: new HttpErrorResponse({ status: 503 }) });

    expect(element(fixture).querySelector('[role="alert"]')?.textContent.trim()).toBe(
      'No se ha podido cargar',
    );
    expect(retryButton(fixture)?.disabled).toBe(false);
  });
});

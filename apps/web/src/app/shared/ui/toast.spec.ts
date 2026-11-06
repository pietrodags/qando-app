import { TestBed } from '@angular/core/testing';
import { literalValues } from '../../../styles/token-usage';
import { Toast, Toaster } from './toast';
import toastStyles from './toast.scss' with { loader: 'text' };

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [Toast] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(Toast);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function shown(element: HTMLElement): string | undefined {
    TestBed.tick();
    return element.querySelector('.toast')?.textContent.trim();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(toastStyles)).toEqual([]);
  });

  it('shows nothing until a page says something', () => {
    const element = render();

    expect(shown(element)).toBeUndefined();
    expect(element.querySelector('[role="status"]')).not.toBeNull();
  });

  it('announces the message for two seconds', () => {
    const element = render();

    TestBed.inject(Toaster).show('Enlace copiado');
    expect(shown(element)).toBe('Enlace copiado');

    vi.advanceTimersByTime(1999);
    expect(shown(element)).toBe('Enlace copiado');
    vi.advanceTimersByTime(1);
    expect(shown(element)).toBeUndefined();
  });

  it('shows a new message for two seconds of its own', () => {
    const element = render();
    const toaster = TestBed.inject(Toaster);

    toaster.show('Enlace copiado');
    vi.advanceTimersByTime(1500);
    toaster.show('Usa los botones de abajo para compartir');
    vi.advanceTimersByTime(1500);

    expect(shown(element)).toBe('Usa los botones de abajo para compartir');
    vi.advanceTimersByTime(500);
    expect(shown(element)).toBeUndefined();
  });
});

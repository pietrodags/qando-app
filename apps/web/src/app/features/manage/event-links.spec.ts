import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { Toaster } from '../../shared/ui/toast';
import { literalValues } from '../../../styles/token-usage';
import { EventLinks } from './event-links';
import linkStyles from './event-links.scss' with { loader: 'text' };

describe('EventLinks', () => {
  let fixture: ComponentFixture<EventLinks>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [EventLinks],
      providers: [provideI18n(), provideRouter([])],
    });
    fixture = TestBed.createComponent(EventLinks);
    fixture.componentRef.setInput('participationId', 'k3Jd9aB2cD4eF6gH8iJ0kL');
    fixture.componentRef.setInput('resultsId', 'Qw7p2aB2cD4eF6gH8iJ0kL');
    await fixture.whenStable();
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(node: Element | null | undefined): string | undefined {
    return node?.textContent.replace(/\s+/g, ' ').trim();
  }

  function row(index: number): HTMLElement {
    return element().querySelectorAll<HTMLElement>('.link')[index]!;
  }

  function control(link: HTMLElement, name: string): HTMLElement {
    return [...link.querySelectorAll<HTMLElement>('a, button')].find(
      (candidate) => text(candidate) === name,
    )!;
  }

  function copying(result: Promise<void>): ReturnType<typeof vi.fn> {
    const writeText = vi.fn(() => result);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    return writeText;
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(linkStyles)).toEqual([]);
  });

  it('shows the participation and results links without their protocol', () => {
    expect(text(element().querySelector('h2'))).toBe('Enlaces del evento');
    expect(text(row(0).querySelector('.name'))).toBe('Para votar');
    expect(text(row(0).querySelector('.url'))).toBe(`${location.host}/vote/k3Jd9aB2cD4eF6gH8iJ0kL`);
    expect(text(row(1).querySelector('.name'))).toBe('Resultados');
    expect(text(row(1).querySelector('.url'))).toBe(
      `${location.host}/results/Qw7p2aB2cD4eF6gH8iJ0kL`,
    );
  });

  it.each([
    [0, `/vote/k3Jd9aB2cD4eF6gH8iJ0kL`],
    [1, `/results/Qw7p2aB2cD4eF6gH8iJ0kL`],
  ])('copies link %i in full and says so', async (index, path) => {
    const writeText = copying(Promise.resolve());

    control(row(index), 'Copiar').click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(`${location.origin}${path}`);
    expect(TestBed.inject(Toaster).message()).toBe('Enlace copiado');
  });

  it('says nothing when the browser refuses to copy', async () => {
    copying(Promise.reject(new Error('denied')));

    control(row(0), 'Copiar').click();
    await fixture.whenStable();

    expect(TestBed.inject(Toaster).message()).toBeNull();
  });

  it('opens the results from their row', () => {
    expect(control(row(1), 'Ver').getAttribute('href')).toBe('/results/Qw7p2aB2cD4eF6gH8iJ0kL');
    expect([...row(0).querySelectorAll('a')]).toEqual([]);
  });
});

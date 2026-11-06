import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PublicEvent } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { VotePage } from './vote-page';
import pageStyles from './vote-page.scss' with { loader: 'text' };

const cenaDeVerano: PublicEvent = {
  title: 'Cena de verano',
  organizerName: 'Pietro',
  note: null,
  deadline: '2026-07-01',
  timeZone: 'Europe/Madrid',
  anonymous: false,
  state: 'open',
  options: [
    {
      id: '6f1c2a0e-0000-4000-8000-000000000001',
      dates: { kind: 'single', date: '2026-07-06' },
      time: null,
    },
  ],
  confirmedOption: null,
};

describe('VotePage', () => {
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    window.matchMedia = (query: string) => ({ matches: false, media: query }) as MediaQueryList;
    TestBed.configureTestingModule({
      imports: [VotePage],
      providers: [provideI18n(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function render(eventId = 'k3Jd9'): ComponentFixture<VotePage> {
    const fixture = TestBed.createComponent(VotePage);
    fixture.componentRef.setInput('eventId', eventId);
    TestBed.tick();
    return fixture;
  }

  function text(fixture: ComponentFixture<VotePage>): string {
    return (fixture.nativeElement as HTMLElement).textContent.trim();
  }

  it('styles itself only with design tokens', () => {
    expect(literalValues(pageStyles)).toEqual([]);
  });

  it('reads the event of the participation link and shows its first step', async () => {
    const fixture = render('k3Jd9');

    httpTesting.expectOne('/api/public/events/k3Jd9').flush(cenaDeVerano);
    await fixture.whenStable();

    expect(text(fixture)).toContain('Cena de verano');
    expect(text(fixture)).toContain('Escribe tu nombre para votar');
    expect((fixture.nativeElement as HTMLElement).querySelector('input')?.value).toBe('');
  });

  it('says it is loading while the event is on its way', () => {
    const fixture = render();

    expect(text(fixture)).toBe('Cargando…');

    httpTesting.expectOne('/api/public/events/k3Jd9').flush(cenaDeVerano);
  });

  it('offers to try again when the event could not be read, and reads it again', async () => {
    const fixture = render();
    httpTesting
      .expectOne('/api/public/events/k3Jd9')
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    await fixture.whenStable();

    expect(text(fixture)).toContain('No se ha podido cargar');
    const retry = (fixture.nativeElement as HTMLElement).querySelector('button');
    retry?.click();
    TestBed.tick();

    httpTesting.expectOne('/api/public/events/k3Jd9').flush(cenaDeVerano);
    await fixture.whenStable();
    expect(text(fixture)).toContain('Cena de verano');
  });
});

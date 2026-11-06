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

  describe('once the event is read', () => {
    async function opened(event: PublicEvent = cenaDeVerano): Promise<ComponentFixture<VotePage>> {
      const fixture = render();
      httpTesting.expectOne('/api/public/events/k3Jd9').flush(event);
      await fixture.whenStable();
      return fixture;
    }

    function element(fixture: ComponentFixture<VotePage>): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function button(fixture: ComponentFixture<VotePage>, name: RegExp): HTMLButtonElement {
      const found = Array.from(element(fixture).querySelectorAll('button')).find((candidate) =>
        name.test(candidate.getAttribute('aria-label') ?? candidate.textContent),
      );
      if (found === undefined) throw new Error(`No button named ${String(name)}`);
      return found;
    }

    async function chooseDays(fixture: ComponentFixture<VotePage>): Promise<void> {
      const field = element(fixture).querySelector('input');
      if (field !== null) {
        field.value = 'Luis';
        field.dispatchEvent(new Event('input'));
        await fixture.whenStable();
      }
      button(fixture, /Quiero elegir/).click();
      await fixture.whenStable();
    }

    it('shows step 1 in a card labelled "paso 1"', async () => {
      const fixture = await opened();

      expect(element(fixture).querySelector('.card')?.textContent).toContain('paso 1');
    });

    it('goes to the days, every one available, when the voter wants to choose', async () => {
      const fixture = await opened();

      await chooseDays(fixture);

      expect(element(fixture).querySelector('.card')?.textContent).toContain('paso 2');
      expect(button(fixture, /6 de julio/).getAttribute('aria-label')).toBe(
        'lunes, 6 de julio: Disponible',
      );
      expect(element(fixture).querySelector('button.tab')?.textContent.trim()).toBe('paso 1');
    });

    it('keeps the name and the answers when going back to step 1 and forward again', async () => {
      const fixture = await opened();
      await chooseDays(fixture);
      button(fixture, /6 de julio/).click();
      await fixture.whenStable();

      button(fixture, /Volver al paso 1/).click();
      await fixture.whenStable();
      expect(element(fixture).querySelector('input')?.value).toBe('Luis');

      button(fixture, /Quiero elegir/).click();
      await fixture.whenStable();
      expect(button(fixture, /6 de julio/).getAttribute('aria-label')).toBe(
        'lunes, 6 de julio: No puedo',
      );
    });

    it('goes back to step 1 from its tab', async () => {
      const fixture = await opened();
      await chooseDays(fixture);

      button(fixture, /^\s*paso 1\s*$/).click();
      await fixture.whenStable();

      expect(element(fixture).querySelector('.card')?.textContent).toContain('paso 1');
    });

    it("gives the days step the colour of the vote's last step", async () => {
      const fixture = await opened();
      await chooseDays(fixture);

      expect(
        element(fixture)
          .querySelector<HTMLElement>('.step-label')
          ?.style.getPropertyValue('--step-accent'),
      ).toBe('var(--q-accent-amber)');
    });

    it('stays on step 1 for an event with times, whose steps come later', async () => {
      const fixture = await opened({
        ...cenaDeVerano,
        options: [
          ...cenaDeVerano.options,
          {
            id: '6f1c2a0e-0000-4000-8000-000000000002',
            dates: { kind: 'single', date: '2026-07-10' },
            time: { kind: 'single', at: '21:00' },
          },
        ],
      });

      await chooseDays(fixture);

      expect(element(fixture).querySelector('.card')?.textContent).toContain('paso 1');
    });
  });
});

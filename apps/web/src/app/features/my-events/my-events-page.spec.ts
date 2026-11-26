import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { MyEvent } from '@qando/contracts';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { literalValues } from '../../../styles/token-usage';
import { MyEventsPage } from './my-events-page';
import pageStyles from './my-events-page.scss' with { loader: 'text' };

@Component({ template: '' })
class Elsewhere {}

function event(id: string, title: string, state: MyEvent['state'], deadline: string): MyEvent {
  return { id, title, state, deadline, voters: 0, createdAt: '2026-06-01T10:00:00.000Z' };
}

const excursion = event('ExcUrs10n', 'Excursión a la sierra', 'open', '2026-07-01');
const dinner = event('C3naVeran0', 'Cena de verano', 'closed', '2026-06-15');
const padel = event('PadelPart1', 'Partido de pádel', 'confirmed', '2026-06-10');

describe('MyEventsPage', () => {
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MyEventsPage],
      providers: [
        provideI18n(),
        provideRouter([
          { path: 'sign-in', component: Elsewhere },
          { path: 'manage/:eventId', component: Elsewhere },
          { path: '', component: Elsewhere },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // The session the app asks for when it starts, as every page's header does.
    for (const request of httpTesting.match('/api/auth/session')) request.flush(null);
    httpTesting.verify();
  });

  function render(): ComponentFixture<MyEventsPage> {
    const fixture = TestBed.createComponent(MyEventsPage);
    TestBed.tick();
    return fixture;
  }

  async function listed(events: MyEvent[]): Promise<ComponentFixture<MyEventsPage>> {
    const fixture = render();
    httpTesting.expectOne('/api/me/events').flush(events);
    await fixture.whenStable();
    return fixture;
  }

  function rows(fixture: ComponentFixture<MyEventsPage>): HTMLAnchorElement[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('li a')];
  }

  function text(element: Element | null | undefined): string {
    return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  it('takes every value of its styles from the design tokens', () => {
    expect(literalValues(pageStyles)).toEqual([]);
  });

  it('says it is loading while the list is on its way', () => {
    const fixture = render();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('app-loading-state')).not.toBeNull();
    expect(page.querySelector('li')).toBeNull();
    httpTesting.expectOne('/api/me/events').flush([]);
  });

  it('heads the card with "Mis eventos"', async () => {
    const fixture = await listed([excursion]);
    const heading = (fixture.nativeElement as HTMLElement).querySelector('h1');
    expect(text(heading)).toBe('Mis eventos');
  });

  it('lists the events in the order the API gives them, each opening its management page', async () => {
    const fixture = await listed([excursion, dinner, padel]);
    expect(rows(fixture).map((row) => row.getAttribute('href'))).toEqual([
      '/manage/ExcUrs10n',
      '/manage/C3naVeran0',
      '/manage/PadelPart1',
    ]);
    expect(rows(fixture).map((row) => text(row.querySelector('.title')))).toEqual([
      'Excursión a la sierra',
      'Cena de verano',
      'Partido de pádel',
    ]);
  });

  it('opens the management page of the row pressed', async () => {
    const fixture = await listed([excursion, dinner]);
    rows(fixture)[1]?.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/manage/C3naVeran0');
  });

  it('marks the line whose bold date reads in the text colour', async () => {
    const fixture = await listed([excursion]);
    const date = rows(fixture)[0]?.querySelector('.state strong');
    expect(date?.closest('[data-strong-text]')).not.toBeNull();
  });

  it('gives an open event its deadline, in bold, and no lock', async () => {
    const fixture = await listed([excursion]);
    const line = rows(fixture)[0]?.querySelector('.state');
    expect(text(line)).toBe('Votación abierta hasta el 1 de julio de 2026');
    expect(text(line?.querySelector('strong'))).toBe('1 de julio de 2026');
    expect(line?.querySelector('svg')).toBeNull();
  });

  it('gives a closed event the lock and the day voting closed, in bold', async () => {
    const fixture = await listed([dinner]);
    const line = rows(fixture)[0]?.querySelector('.state');
    expect(text(line)).toBe('Votación cerrada el 15 de junio de 2026');
    expect(text(line?.querySelector('strong'))).toBe('15 de junio de 2026');
    expect(line?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives a confirmed event the lock and "Fecha confirmada", without a date', async () => {
    const fixture = await listed([padel]);
    const line = rows(fixture)[0]?.querySelector('.state');
    expect(text(line)).toBe('Fecha confirmada');
    expect(line?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps a title as typed, never as markup', async () => {
    const fixture = await listed([event('X1', '<b>Cena</b>', 'open', '2026-07-01')]);
    const title = rows(fixture)[0]?.querySelector('.title');
    expect(title?.textContent).toBe('<b>Cena</b>');
    expect(title?.querySelector('b')).toBeNull();
  });

  /** The round "+" at the card's foot: a link with an icon alone, named for screen readers. */
  function createLink(fixture: ComponentFixture<MyEventsPage>): HTMLAnchorElement | null {
    const card = (fixture.nativeElement as HTMLElement).querySelector('section');
    const last = card?.lastElementChild;
    return last instanceof HTMLAnchorElement ? last : null;
  }

  it('ends the card, under the list, with a round "+" leading to the start page', async () => {
    const fixture = await listed([excursion, dinner]);
    const create = createLink(fixture);
    expect(create?.previousElementSibling?.tagName).toBe('UL');
    expect(create?.getAttribute('href')).toBe('/');
    expect(create?.getAttribute('aria-label')).toBe('Crear un evento');
    expect(text(create)).toBe('');
    expect(create?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('opens the start page from the "+"', async () => {
    const fixture = await listed([excursion]);
    // Somewhere else first, so the press is what brings the start page.
    await TestBed.inject(Router).navigateByUrl('/manage/ExcUrs10n');
    createLink(fixture)?.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('says there are no events yet, the same "+" under it', async () => {
    const fixture = await listed([]);
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('ul')).toBeNull();
    const create = createLink(fixture);
    expect(text(create?.previousElementSibling)).toBe('Aún no has creado ningún evento.');
    expect(create?.getAttribute('href')).toBe('/');
    expect(create?.getAttribute('aria-label')).toBe('Crear un evento');
    expect(text(create)).toBe('');
    expect(page.querySelectorAll('a')).toHaveLength(1);
  });

  it('offers to try again when the list could not be loaded, and asks again', async () => {
    const fixture = render();
    httpTesting
      .expectOne('/api/me/events')
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(text(page.querySelector('[role="alert"]'))).toBe('No se ha podido cargar');
    page.querySelector<HTMLButtonElement>('app-error-state button')?.click();
    TestBed.tick();
    httpTesting.expectOne('/api/me/events').flush([excursion]);
    await fixture.whenStable();
    expect(rows(fixture)).toHaveLength(1);
  });

  it('sends to the sign-in page, back to "Mis eventos" afterwards, when the session has ended', async () => {
    const fixture = render();
    httpTesting
      .expectOne('/api/me/events')
      .flush(
        { error: { code: 'UNAUTHENTICATED', message: 'No session', details: [] } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    // Asked again, the API says nobody is signed in; only then does the page leave.
    expect(router.url).toBe('/');
    await vi.waitFor(() => {
      for (const request of httpTesting.match('/api/auth/session')) request.flush(null);
      expect(router.url).toBe('/sign-in?returnTo=%2Fmy-events');
    });
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
  });

  it('stays where the user went if they left before the session answered', async () => {
    const fixture = render();
    httpTesting
      .expectOne('/api/me/events')
      .flush(
        { error: { code: 'UNAUTHENTICATED', message: 'No session', details: [] } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    fixture.destroy();
    for (const request of httpTesting.match('/api/auth/session')) request.flush(null);
    await new Promise((resolve) => setTimeout(resolve));
    expect(router.url).toBe('/');
  });

  describe('with more events than the card shows at once', () => {
    /** Lays the list out as a browser would: `shown` px of `total` px, scrolled to `top`. */
    function layOut(list: HTMLElement, total: number, shown: number, top: number): void {
      Object.defineProperty(list, 'scrollHeight', { configurable: true, value: total });
      Object.defineProperty(list, 'clientHeight', { configurable: true, value: shown });
      list.scrollTop = top;
      list.dispatchEvent(new Event('scroll'));
    }

    async function list(): Promise<[ComponentFixture<MyEventsPage>, HTMLElement]> {
      const fixture = await listed([excursion, dinner, padel]);
      const ul = (fixture.nativeElement as HTMLElement).querySelector('ul');
      if (!ul) throw new Error('No list');
      return [fixture, ul];
    }

    it('fades the list out at its foot while rows wait below', async () => {
      const [fixture, ul] = await list();
      layOut(ul, 900, 600, 0);
      fixture.detectChanges();
      expect(ul.classList).toContain('more-below');
    });

    it('lets the fade go once scrolled to the end', async () => {
      const [fixture, ul] = await list();
      layOut(ul, 900, 600, 0);
      fixture.detectChanges();
      layOut(ul, 900, 600, 300);
      fixture.detectChanges();
      expect(ul.classList).not.toContain('more-below');
    });

    it('still fades one pixel short of the end, and not at a fraction of a pixel', async () => {
      const [fixture, ul] = await list();
      layOut(ul, 900, 600, 299);
      fixture.detectChanges();
      expect(ul.classList).toContain('more-below');
      layOut(ul, 900, 600, 299.5);
      fixture.detectChanges();
      expect(ul.classList).not.toContain('more-below');
    });

    it('measures the list again when the window is resized', async () => {
      const [fixture, ul] = await list();
      layOut(ul, 900, 600, 0);
      fixture.detectChanges();
      // A wider window: the whole list fits, with nothing left to scroll.
      Object.defineProperty(ul, 'clientHeight', { configurable: true, value: 900 });
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      expect(ul.classList).not.toContain('more-below');
    });

    it('never fades a list that fits', async () => {
      const [fixture, ul] = await list();
      layOut(ul, 600, 600, 0);
      fixture.detectChanges();
      expect(ul.classList).not.toContain('more-below');
    });
  });
});

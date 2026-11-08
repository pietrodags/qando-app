import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { provideI18n } from './core/i18n/provide-i18n';
import { StepStackPlayground } from './dev/step-stack-playground';
import { CreatePage } from './features/create/create-page';
import { ManagePage } from './features/manage/manage-page';
import { NotFoundPage } from './features/not-found/not-found-page';
import { MyVotes } from './features/vote/my-votes';
import { ResultsPage } from './features/results/results-page';
import { VotePage } from './features/vote/vote-page';

describe('routes', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideI18n(),
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  function heading(): string | undefined {
    return harness.routeNativeElement?.querySelector('h1')?.textContent.trim();
  }

  it('opens the event wizard at the home page', async () => {
    await harness.navigateByUrl('/', CreatePage);

    expect(TestBed.inject(Title).getTitle()).toBe('qando');
  });

  it('opens the step motion playground in development', async () => {
    await harness.navigateByUrl('/dev/step-stack', StepStackPlayground);

    expect(harness.routeNativeElement?.querySelector('app-step-stack')).not.toBeNull();
  });

  it('opens the voting page on the event of the participation link', async () => {
    await harness.navigateByUrl('/vote/k3Jd9', VotePage);

    TestBed.inject(HttpTestingController).expectOne('/api/public/events/k3Jd9');
    expect(TestBed.inject(Title).getTitle()).toBe('Votar | qando');
  });

  it("takes the private link's token and opens the voting page without it in the address", async () => {
    localStorage.clear();

    await harness.navigateByUrl('/vote/k3Jd9/my-vote#t=gnBC8IUdhskzM84pbChyLw', VotePage);

    expect(TestBed.inject(Router).url).toBe('/vote/k3Jd9');
    // The page reads the vote of the link's token.
    const read = TestBed.inject(HttpTestingController).expectOne(
      '/api/public/events/k3Jd9/participations/mine',
    );
    expect(read.request.headers.get('x-vote-token')).toBe('gnBC8IUdhskzM84pbChyLw');
    expect(TestBed.inject(Title).getTitle()).toBe('Votar | qando');
    localStorage.clear();
  });

  it('opens the results page on the results of the results link', async () => {
    await harness.navigateByUrl('/results/Qw7p2', ResultsPage);

    TestBed.inject(HttpTestingController).expectOne('/api/results/Qw7p2');
    expect(TestBed.inject(Title).getTitle()).toBe('Resultados | qando');
  });

  it('opens the management page on the event of the management link', async () => {
    localStorage.clear();

    await harness.navigateByUrl('/manage/k3Jd9', ManagePage);

    const read = TestBed.inject(HttpTestingController).expectOne('/api/events/k3Jd9');
    expect(read.request.headers.has('x-management-token')).toBe(false);
    expect(TestBed.inject(Title).getTitle()).toBe('Gestionar | qando');
  });

  it("takes the management link's token and opens the page without it in the address", async () => {
    localStorage.clear();

    await harness.navigateByUrl('/manage/k3Jd9#t=Zx81aB2cD4eF6gH8iJ0kLm', ManagePage);

    expect(TestBed.inject(Router).url).toBe('/manage/k3Jd9');
    const read = TestBed.inject(HttpTestingController).expectOne('/api/events/k3Jd9');
    expect(read.request.headers.get('x-management-token')).toBe('Zx81aB2cD4eF6gH8iJ0kLm');
    expect(TestBed.inject(Title).getTitle()).toBe('Gestionar | qando');
    localStorage.clear();
  });

  it('opens the voting page from a private link that lost its token', async () => {
    await harness.navigateByUrl('/vote/k3Jd9/my-vote', VotePage);

    expect(TestBed.inject(Router).url).toBe('/vote/k3Jd9');
    // A private link that lost its token was copied in part: the page warns about it.
    await expect(TestBed.inject(MyVotes).stored('k3Jd9')).resolves.toEqual({
      kind: 'unknownLink',
    });
  });

  // Every view of the sitemap; each one is a placeholder until its story is built.
  it.each([
    ['/sign-in', 'Entrar'],
    ['/my-events', 'Mis eventos'],
    ['/profile', 'Perfil'],
    ['/manage/k3Jd9/options', 'Editar opciones'],
  ])('resolves %s to its own page', async (url, title) => {
    await harness.navigateByUrl(url);

    expect(heading()).toBe(title);
    expect(TestBed.inject(Title).getTitle()).toBe(`${title} | qando`);
  });

  it.each(['/nope', '/vote', '/vote/k3Jd9/extra', '/participante/k3Jd9'])(
    'shows the not-found page for %s',
    async (url) => {
      await harness.navigateByUrl(url, NotFoundPage);

      expect(heading()).toBe('Página no encontrada');
      expect(TestBed.inject(Title).getTitle()).toBe('Página no encontrada | qando');
    },
  );
});

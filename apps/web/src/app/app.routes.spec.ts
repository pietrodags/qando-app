import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appRoutes } from './app.routes';
import { provideI18n } from './core/i18n/provide-i18n';
import { StepStackPlayground } from './dev/step-stack-playground';
import { ConnectPage } from './features/connect/connect-page';
import { CreatePage } from './features/create/create-page';
import { ManagePage } from './features/manage/manage-page';
import { OptionsEditor } from './features/manage/options-editor';
import { NotFoundPage } from './features/not-found/not-found-page';
import { MyVotes } from './features/vote/my-votes';
import { ResultsPage } from './features/results/results-page';
import { VotePage } from './features/vote/vote-page';

describe('appRoutes', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideI18n(),
        provideRouter(appRoutes(), withComponentInputBinding()),
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

  it('takes a management link opened over the same event’s page, as when pasted in its tab', async () => {
    localStorage.clear();
    await harness.navigateByUrl('/manage/k3Jd9', ManagePage);
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/events/k3Jd9')
      .flush(
        { error: { code: 'UNAUTHENTICATED', message: 'x', details: [] } },
        { status: 401, statusText: 'x' },
      );

    await harness.navigateByUrl('/manage/k3Jd9#t=Zx81aB2cD4eF6gH8iJ0kLm', ManagePage);
    TestBed.tick();

    expect(TestBed.inject(Router).url).toBe('/manage/k3Jd9');
    const read = http.expectOne('/api/events/k3Jd9');
    expect(read.request.headers.get('x-management-token')).toBe('Zx81aB2cD4eF6gH8iJ0kLm');
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
    ['/privacy', 'Privacidad y condiciones'],
  ])('resolves %s to its own page', async (url, title) => {
    await harness.navigateByUrl(url);

    expect(heading()).toBe(title);
    expect(TestBed.inject(Title).getTitle()).toBe(`${title} | qando`);
  });

  it('opens the consent page at /connect, which says a request is missing without one', async () => {
    await harness.navigateByUrl('/connect', ConnectPage);

    expect(heading()).toBe('Esta solicitud ha caducado');
    expect(TestBed.inject(Title).getTitle()).toBe('Conectar una aplicación | qando');
  });

  it("opens the editor of an event's options, which reads the event", async () => {
    await harness.navigateByUrl('/manage/k3Jd9/options', OptionsEditor);

    expect(TestBed.inject(Title).getTitle()).toBe('Editar opciones | qando');
    TestBed.inject(HttpTestingController).expectOne('/api/events/k3Jd9');
  });

  describe('the private pages', () => {
    /** Opens the address in a browser whose session the API answers with `account`. */
    async function open(url: string, account: { name: string; email: string } | null) {
      const opened = harness.navigateByUrl(url);
      // The guard asks once the navigation has started.
      await new Promise((resolve) => setTimeout(resolve));
      TestBed.inject(HttpTestingController).expectOne('/api/auth/session').flush(account);
      await opened;
    }

    it("opens /my-events for an account signed in, with the account's events", async () => {
      await open('/my-events', { name: 'Ana', email: 'ana@example.com' });
      TestBed.inject(HttpTestingController).expectOne('/api/me/events').flush([]);
      await harness.fixture.whenStable();

      expect(heading()).toBe('Mis eventos');
      expect(TestBed.inject(Title).getTitle()).toBe('Mis eventos | qando');
    });

    it("opens /connected-apps for an account signed in, with the account's applications", async () => {
      await open('/connected-apps', { name: 'Ana', email: 'ana@example.com' });
      TestBed.inject(HttpTestingController).expectOne('/api/me/connected-apps').flush([]);
      await harness.fixture.whenStable();

      expect(heading()).toBe('Apps conectadas');
      expect(TestBed.inject(Title).getTitle()).toBe('Apps conectadas | qando');
    });

    it('opens /profile for an account signed in', async () => {
      await open('/profile', { name: 'Ana', email: 'ana@example.com' });

      expect(heading()).toBe('Perfil');
      expect(TestBed.inject(Title).getTitle()).toBe('Perfil | qando');
    });

    it.each([
      ['/my-events', '/sign-in?returnTo=%2Fmy-events'],
      ['/connected-apps', '/sign-in?returnTo=%2Fconnected-apps'],
      ['/profile', '/sign-in?returnTo=%2Fprofile'],
    ])('ask a visitor without a session to sign in before %s', async (url, signIn) => {
      await open(url, null);

      expect(TestBed.inject(Router).url).toBe(signIn);
      expect(heading()).toBe('Entrar');
    });
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

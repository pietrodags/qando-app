import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { provideI18n } from './core/i18n/provide-i18n';
import { CreatePage } from './features/create/create-page';
import { NotFoundPage } from './features/not-found/not-found-page';
import { MyVotes } from './features/vote/my-votes';
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

  it('opens the voting page on the event of the participation link', async () => {
    await harness.navigateByUrl('/vote/k3Jd9', VotePage);

    TestBed.inject(HttpTestingController).expectOne('/api/public/events/k3Jd9');
    expect(TestBed.inject(Title).getTitle()).toBe('Votar | qando');
  });

  it("takes the private link's token and opens the voting page without it in the address", async () => {
    localStorage.clear();

    await harness.navigateByUrl('/vote/k3Jd9/my-vote#t=gnBC8IUdhskzM84pbChyLw', VotePage);

    expect(TestBed.inject(Router).url).toBe('/vote/k3Jd9');
    expect(localStorage.getItem('qando.voteToken.k3Jd9')).toBe('gnBC8IUdhskzM84pbChyLw');
    expect(TestBed.inject(Title).getTitle()).toBe('Votar | qando');
    localStorage.clear();
  });

  it('opens the voting page from a private link that lost its token', async () => {
    await harness.navigateByUrl('/vote/k3Jd9/my-vote', VotePage);

    expect(TestBed.inject(Router).url).toBe('/vote/k3Jd9');
    // Nothing to warn about: the voter opened a link without a token, not a wrong one.
    await expect(TestBed.inject(MyVotes).stored('k3Jd9')).resolves.toEqual({ kind: 'none' });
  });

  // Every view of the sitemap; each one is a placeholder until its story is built.
  it.each([
    ['/sign-in', 'Entrar'],
    ['/my-events', 'Mis eventos'],
    ['/profile', 'Perfil'],
    ['/results/Qw7p2', 'Resultados'],
    ['/manage/k3Jd9', 'Gestionar'],
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

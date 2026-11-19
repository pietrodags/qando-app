import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { signedInOnly } from './signed-in-only';

@Component({ template: '' })
class Page {}

describe('signedInOnly', () => {
  let httpTesting: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', component: Page },
          { path: 'sign-in', component: Page },
          { path: 'my-events', component: Page, canActivate: [signedInOnly] },
        ]),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  /** Opens the address in a browser whose session the API answers with `account`. */
  async function open(url: string, account: { name: string; email: string } | null) {
    const opened = router.navigateByUrl(url);
    // The guard asks once the navigation has started.
    await new Promise((resolve) => setTimeout(resolve));
    httpTesting.expectOne('/api/auth/session').flush(account);
    await opened;
  }

  it('opens a private page for an account signed in', async () => {
    await open('/my-events', { name: 'Ana', email: 'ana@example.com' });

    expect(router.url).toBe('/my-events');
  });

  it('sends a visitor without a session to sign in, to come back to the page asked for', async () => {
    await open('/my-events?from=email', null);

    expect(router.url).toBe(
      router.serializeUrl(
        router.createUrlTree(['/sign-in'], { queryParams: { returnTo: '/my-events?from=email' } }),
      ),
    );
  });
});

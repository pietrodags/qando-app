import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CreatePage } from './create-page';

describe('CreatePage', () => {
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CreatePage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  // whenStable() would wait for the pending health request, so render with tick() instead.
  async function render() {
    const fixture = TestBed.createComponent(CreatePage);
    TestBed.tick();
    return fixture;
  }

  function statusText(element: HTMLElement): string | undefined {
    return element.querySelector('[data-testid="api-status"]')?.textContent?.trim();
  }

  it('shows the product name', async () => {
    const fixture = await render();
    httpTesting.expectOne('/api/health').flush({ status: 'ok', database: 'up' });

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('qando');
  });

  it('says it is checking the API while the request is pending', async () => {
    const fixture = await render();

    expect(statusText(fixture.nativeElement)).toBe('Comprobando el servicio…');

    httpTesting.expectOne('/api/health').flush({ status: 'ok', database: 'up' });
  });

  it('says everything works when the API and the database are up', async () => {
    const fixture = await render();

    httpTesting.expectOne('/api/health').flush({ status: 'ok', database: 'up' });
    await fixture.whenStable();

    expect(statusText(fixture.nativeElement)).toBe('Servicio funcionando');
  });

  it('says the database is down when the API answers 503', async () => {
    const fixture = await render();

    httpTesting
      .expectOne('/api/health')
      .flush(
        { status: 'unavailable', database: 'down' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    await fixture.whenStable();

    expect(statusText(fixture.nativeElement)).toBe('La base de datos no responde');
  });

  it('says the API is down when the request fails', async () => {
    const fixture = await render();

    httpTesting.expectOne('/api/health').error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(statusText(fixture.nativeElement)).toBe('El servicio no responde');
  });
});

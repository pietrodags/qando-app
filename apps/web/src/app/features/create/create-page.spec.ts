import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
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
  function render(): ComponentFixture<CreatePage> {
    const fixture = TestBed.createComponent(CreatePage);
    TestBed.tick();
    return fixture;
  }

  function statusText(fixture: ComponentFixture<CreatePage>): string | undefined {
    const element = fixture.nativeElement as HTMLElement;
    return element.querySelector('[data-testid="api-status"]')?.textContent.trim();
  }

  it('shows the product name', () => {
    const fixture = render();
    httpTesting.expectOne('/api/health').flush({ status: 'ok', database: 'up' });

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent.trim()).toBe('qando');
  });

  it('says it is checking the API while the request is pending', () => {
    const fixture = render();

    expect(statusText(fixture)).toBe('Comprobando el servicio…');

    httpTesting.expectOne('/api/health').flush({ status: 'ok', database: 'up' });
  });

  it('says everything works when the API and the database are up', async () => {
    const fixture = render();

    httpTesting.expectOne('/api/health').flush({ status: 'ok', database: 'up' });
    await fixture.whenStable();

    expect(statusText(fixture)).toBe('Servicio funcionando');
  });

  it('says the database is down when the API answers 503', async () => {
    const fixture = render();

    httpTesting
      .expectOne('/api/health')
      .flush(
        { status: 'unavailable', database: 'down' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    await fixture.whenStable();

    expect(statusText(fixture)).toBe('La base de datos no responde');
  });

  it('says the API is down when the request fails', async () => {
    const fixture = render();

    httpTesting.expectOne('/api/health').error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(statusText(fixture)).toBe('El servicio no responde');
  });
});

import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { healthEndpoint } from '@qando/contracts';
import { apiError, apiResource } from './api-resource';

describe('apiResource', () => {
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function readHealth() {
    const resource = runInInjectionContext(TestBed.inject(Injector), () =>
      apiResource(healthEndpoint),
    );
    TestBed.tick();
    return resource;
  }

  async function settle(): Promise<void> {
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('sends a GET to the path of the endpoint', () => {
    readHealth();

    const request = httpTesting.expectOne('/api/health');
    expect(request.request.method).toBe('GET');
    request.flush({ status: 'ok', database: 'up' });
  });

  it('exposes the success body of the contract', async () => {
    const health = readHealth();

    httpTesting.expectOne('/api/health').flush({ status: 'ok', database: 'up' });
    await settle();

    expect(health.value()).toEqual({ status: 'ok', database: 'up' });
  });

  it('fails when the body breaks the contract', async () => {
    const health = readHealth();

    httpTesting.expectOne('/api/health').flush({ status: 'ok', database: 'maybe' });
    await settle();

    expect(health.hasValue()).toBe(false);
    expect(health.error()?.message).toBe(
      'GET /api/health answered a body that breaks its contract',
    );
  });
});

describe('apiError', () => {
  it('returns the documented error answer', () => {
    const error = new HttpErrorResponse({
      status: 503,
      error: { status: 'unavailable', database: 'down' },
    });

    expect(apiError(healthEndpoint, error)).toEqual({
      status: 503,
      body: { status: 'unavailable', database: 'down' },
    });
  });

  it('is undefined when the request never reached the API', () => {
    const error = new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') });

    expect(apiError(healthEndpoint, error)).toBeUndefined();
  });

  it('is undefined for an error that is not an HTTP answer', () => {
    expect(apiError(healthEndpoint, new Error('parse failed'))).toBeUndefined();
  });
});

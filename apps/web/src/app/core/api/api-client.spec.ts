import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { castVoteEndpoint } from '@qando/contracts';
import { ApiClient } from './api-client';

const token = 'AAAAAAAAAAAAAAAAAAAAAA';
const participationId = '6f1c2a0e-0000-4000-8000-0000000000aa';

describe('ApiClient', () => {
  let httpTesting: HttpTestingController;
  let api: ApiClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ApiClient);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function castVote(within: { within?: number } = {}) {
    return api.send(castVoteEndpoint, {
      params: { id: 'k3/Jd9' },
      headers: { 'x-vote-token': token },
      body: { name: 'Luis', votes: { a: 'available' } },
      ...within,
    });
  }

  it('sends the method, path, headers and body of the endpoint', () => {
    void castVote();

    const request = httpTesting.expectOne('/api/public/events/k3%2FJd9/participations');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('x-vote-token')).toBe(token);
    expect(request.request.body).toEqual({ name: 'Luis', votes: { a: 'available' } });
    request.flush({ participationId });
  });

  it('answers the success body of the contract', async () => {
    const sent = castVote();

    httpTesting
      .expectOne('/api/public/events/k3%2FJd9/participations')
      .flush({ participationId }, { status: 201, statusText: 'Created' });

    await expect(sent).resolves.toEqual({ participationId });
  });

  it('fails when the success body breaks the contract', async () => {
    const sent = castVote();

    httpTesting.expectOne('/api/public/events/k3%2FJd9/participations').flush({ id: 1 });

    await expect(sent).rejects.toThrow(
      'POST /api/public/events/{id}/participations answered a body that breaks its contract',
    );
  });

  it('fails with the HTTP error, which apiError reads', async () => {
    const sent = castVote();

    httpTesting.expectOne('/api/public/events/k3%2FJd9/participations').flush(
      { error: { code: 'VOTING_CLOSED', message: 'closed' } },
      {
        status: 409,
        statusText: 'Conflict',
      },
    );

    await expect(sent).rejects.toBeInstanceOf(HttpErrorResponse);
  });

  describe('with a time to answer within', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('gives the request up once that time has passed, and not before', async () => {
      const sent = castVote({ within: 10_000 });
      const failed = expect(sent).rejects.toThrow('Timeout');
      const request = httpTesting.expectOne('/api/public/events/k3%2FJd9/participations');

      await vi.advanceTimersByTimeAsync(9_999);
      expect(request.cancelled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(request.cancelled).toBe(true);
      await failed;
    });

    it('answers what arrives within that time', async () => {
      const sent = castVote({ within: 10_000 });
      const request = httpTesting.expectOne('/api/public/events/k3%2FJd9/participations');

      await vi.advanceTimersByTimeAsync(9_999);
      request.flush({ participationId });

      await expect(sent).resolves.toEqual({ participationId });
    });

    it('waits for the answer as long as it takes when given none', async () => {
      const sent = castVote();
      const request = httpTesting.expectOne('/api/public/events/k3%2FJd9/participations');

      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(request.cancelled).toBe(false);
      request.flush({ participationId });

      await expect(sent).resolves.toEqual({ participationId });
    });
  });
});

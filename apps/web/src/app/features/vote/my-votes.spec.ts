import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CastVoteBody } from '@qando/contracts';
import { MyVotes } from './my-votes';

const vote: CastVoteBody = { name: 'Luis', votes: { a: 'available', b: 'preferred' } };
const participationId = '6f1c2a0e-0000-4000-8000-0000000000aa';
const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const mine = '/api/public/events/k3Jd9/participations/mine';
const forbidden = { status: 403, statusText: 'Forbidden' };

/** Lets a settled request's promise chain reach the next request. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('MyVotes', () => {
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  /** A new instance, as after reloading the page. */
  function myVotes(): MyVotes {
    return TestBed.runInInjectionContext(() => new MyVotes());
  }

  /** Answers the pending send of the event and returns the token it carried. */
  function answer(eventId: string, status = 201): string {
    const request = httpTesting.expectOne(`/api/public/events/${eventId}/participations`);
    const token = request.request.headers.get('x-vote-token') ?? '';
    if (status === 201) request.flush({ participationId }, { status, statusText: 'Created' });
    else request.flush(null, { status, statusText: 'Error' });
    return token;
  }

  it('sends the vote with a new 128-bit token and answers its private link', async () => {
    const sent = myVotes().cast('k3Jd9', vote);

    const request = httpTesting.expectOne('/api/public/events/k3Jd9/participations');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(vote);
    const token = request.request.headers.get('x-vote-token') ?? '';
    expect(token).toMatch(TOKEN);
    request.flush({ participationId }, { status: 201, statusText: 'Created' });

    await expect(sent).resolves.toBe(`/vote/k3Jd9/my-vote#t=${token}`);
  });

  it('fails when the send fails, and sends the same token when the voter tries again', async () => {
    const votes = myVotes();
    const failed = votes.cast('k3Jd9', vote);
    const first = answer('k3Jd9', 500);
    await expect(failed).rejects.toBeDefined();

    const retried = votes.cast('k3Jd9', vote);
    // A token sent before may hold a stored vote: the retry edits it, or casts when it holds none.
    const edit = httpTesting.expectOne(mine);
    expect(edit.request.method).toBe('PUT');
    expect(edit.request.headers.get('x-vote-token')).toBe(first);
    edit.flush({ error: { code: 'FORBIDDEN', message: 'no vote' } }, forbidden);
    await settle();
    const second = answer('k3Jd9');

    expect(second).toBe(first);
    await expect(retried).resolves.toBe(`/vote/k3Jd9/my-vote#t=${first}`);
  });

  it('keeps the token of the event after a reload, so a lost answer stores no second vote', async () => {
    const lost = myVotes().cast('k3Jd9', vote);
    const first = answer('k3Jd9', 0);
    await expect(lost).rejects.toBeDefined();

    void myVotes().cast('k3Jd9', vote);

    const edit = httpTesting.expectOne(mine);
    expect(edit.request.headers.get('x-vote-token')).toBe(first);
    edit.flush({ error: { code: 'FORBIDDEN', message: 'no vote' } }, forbidden);
    await settle();
    expect(answer('k3Jd9')).toBe(first);
  });

  it('replaces the stored vote with the new answers when an earlier send was stored but its answer lost', async () => {
    const votes = myVotes();
    const lost = votes.cast('k3Jd9', vote);
    const first = answer('k3Jd9', 0);
    await expect(lost).rejects.toBeDefined();

    const changed: CastVoteBody = { name: 'Luis', votes: { a: 'unavailable', b: 'preferred' } };
    const retried = votes.cast('k3Jd9', changed);
    const edit = httpTesting.expectOne(mine);
    expect(edit.request.method).toBe('PUT');
    expect(edit.request.body).toEqual(changed);
    edit.flush(changed);

    await expect(retried).resolves.toBe(`/vote/k3Jd9/my-vote#t=${first}`);
    httpTesting.expectNone(`/api/public/events/k3Jd9/participations`);
  });

  it('fails without casting when the edit fails for another reason', async () => {
    const votes = myVotes();
    const lost = votes.cast('k3Jd9', vote);
    answer('k3Jd9', 0);
    await expect(lost).rejects.toBeDefined();

    const retried = votes.cast('k3Jd9', vote);
    httpTesting.expectOne(mine).flush(
      { error: { code: 'VOTING_CLOSED', message: 'closed' } },
      {
        status: 409,
        statusText: 'Conflict',
      },
    );

    await expect(retried).rejects.toBeDefined();
    httpTesting.expectNone(`/api/public/events/k3Jd9/participations`);
  });

  it('gives each event its own token', () => {
    const votes = myVotes();
    void votes.cast('k3Jd9', vote);
    void votes.cast('x8Pq2', vote);

    const first = answer('k3Jd9');
    const second = answer('x8Pq2');

    expect(first).toMatch(TOKEN);
    expect(second).toMatch(TOKEN);
    expect(second).not.toBe(first);
  });

  it('still sends, and keeps the token while the page is open, when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const votes = myVotes();

    const failed = votes.cast('k3Jd9', vote);
    const first = answer('k3Jd9', 500);
    await expect(failed).rejects.toBeDefined();
    void votes.cast('k3Jd9', vote);
    httpTesting.expectOne(mine).flush(null, forbidden);
    await settle();

    expect(first).toMatch(TOKEN);
    expect(answer('k3Jd9')).toBe(first);
  });
});

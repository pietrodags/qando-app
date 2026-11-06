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
  async function answer(eventId: string, status = 201): Promise<string> {
    await settle();
    const request = httpTesting.expectOne(`/api/public/events/${eventId}/participations`);
    const token = request.request.headers.get('x-vote-token') ?? '';
    if (status === 201) request.flush({ participationId }, { status, statusText: 'Created' });
    else request.flush(null, { status, statusText: 'Error' });
    return token;
  }

  it('sends the vote with a new 128-bit token and answers its private link', async () => {
    const sent = myVotes().cast('k3Jd9', vote);
    await settle();

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
    const first = await answer('k3Jd9', 500);
    await expect(failed).rejects.toBeDefined();

    const changed: CastVoteBody = { name: 'Luis', votes: { a: 'unavailable', b: 'preferred' } };
    const retried = votes.cast('k3Jd9', changed);
    await settle();
    // A token sent before may hold a stored vote: the retry edits it, or casts when it holds none.
    const edit = httpTesting.expectOne(mine);
    expect(edit.request.method).toBe('PUT');
    expect(edit.request.headers.get('x-vote-token')).toBe(first);
    edit.flush({ error: { code: 'FORBIDDEN', message: 'no vote' } }, forbidden);
    await settle();
    const second = await answer('k3Jd9');
    await settle();
    // The first send may have been stored meanwhile, and the cast then keeps its answers: the
    // changed answers replace them once more.
    const replace = httpTesting.expectOne(mine);
    expect(replace.request.method).toBe('PUT');
    expect(replace.request.body).toEqual(changed);
    replace.flush(changed);

    expect(second).toBe(first);
    await expect(retried).resolves.toBe(`/vote/k3Jd9/my-vote#t=${first}`);
  });

  it('keeps the token of the event after a reload, so a lost answer stores no second vote', async () => {
    const lost = myVotes().cast('k3Jd9', vote);
    const first = await answer('k3Jd9', 0);
    await expect(lost).rejects.toBeDefined();

    void myVotes().cast('k3Jd9', vote);
    await settle();

    const edit = httpTesting.expectOne(mine);
    expect(edit.request.headers.get('x-vote-token')).toBe(first);
    edit.flush({ error: { code: 'FORBIDDEN', message: 'no vote' } }, forbidden);
    await settle();
    expect(await answer('k3Jd9')).toBe(first);
    await settle();
    httpTesting.expectOne(mine).flush(vote);
  });

  it('replaces the stored vote with the new answers when an earlier send was stored but its answer lost', async () => {
    const votes = myVotes();
    const lost = votes.cast('k3Jd9', vote);
    const first = await answer('k3Jd9', 0);
    await expect(lost).rejects.toBeDefined();

    const changed: CastVoteBody = { name: 'Luis', votes: { a: 'unavailable', b: 'preferred' } };
    const retried = votes.cast('k3Jd9', changed);
    await settle();
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
    await answer('k3Jd9', 0);
    await expect(lost).rejects.toBeDefined();

    const retried = votes.cast('k3Jd9', vote);
    await settle();
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

  describe('with Web Locks', () => {
    let held: string[];

    beforeEach(() => {
      held = [];
      // The browser's lock manager: records which lock is held while the token is read.
      const locks = {
        request: (name: string, callback: () => unknown) => {
          held.push(name);
          const result = Promise.resolve(callback());
          return result.finally(() => held.splice(held.indexOf(name), 1));
        },
      };
      Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    });

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'locks');
    });

    it("reads or creates the token while holding the event's lock, so tabs never race", async () => {
      const heldWhileReading: string[][] = [];
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        heldWhileReading.push([...held]);
        return null;
      });

      void myVotes().cast('k3Jd9', vote);
      await answer('k3Jd9');

      expect(heldWhileReading).toEqual([['qando.voteToken.k3Jd9']]);
    });

    it('still sends, and retries with the same token, when the browser refuses the lock', async () => {
      Object.defineProperty(navigator, 'locks', {
        value: { request: () => Promise.reject(new DOMException('denied', 'SecurityError')) },
        configurable: true,
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      const votes = myVotes();

      const failed = votes.cast('k3Jd9', vote);
      const first = await answer('k3Jd9', 500);
      await expect(failed).rejects.toBeDefined();
      void votes.cast('k3Jd9', vote);
      await settle();
      httpTesting.expectOne(mine).flush(null, forbidden);

      expect(first).toMatch(TOKEN);
      expect(await answer('k3Jd9')).toBe(first);
      await settle();
      httpTesting.expectOne(mine).flush(vote);
    });

    it('sends the token another tab created, editing the vote it may hold', async () => {
      const first = myVotes().cast('k3Jd9', vote);
      const second = myVotes().cast('k3Jd9', vote);
      await settle();

      const cast = httpTesting.expectOne(`/api/public/events/k3Jd9/participations`);
      const edit = httpTesting.expectOne(mine);
      const token = cast.request.headers.get('x-vote-token') ?? '';
      expect(edit.request.headers.get('x-vote-token')).toBe(token);
      cast.flush({ participationId }, { status: 201, statusText: 'Created' });
      edit.flush(vote);

      await expect(first).resolves.toBe(`/vote/k3Jd9/my-vote#t=${token}`);
      await expect(second).resolves.toBe(`/vote/k3Jd9/my-vote#t=${token}`);
    });
  });

  it('keeps its own token while the page is open, even if another tab stores a new one', async () => {
    const votes = myVotes();
    const sent = votes.cast('k3Jd9', vote);
    const first = await answer('k3Jd9');
    await sent;
    localStorage.setItem('qando.voteToken.k3Jd9', 'BBBBBBBBBBBBBBBBBBBBBB');

    void votes.cast('k3Jd9', vote);
    await settle();

    const edit = httpTesting.expectOne(mine);
    expect(edit.request.headers.get('x-vote-token')).toBe(first);
    edit.flush(vote);
  });

  it('gives each event its own token', async () => {
    const votes = myVotes();
    void votes.cast('k3Jd9', vote);
    void votes.cast('x8Pq2', vote);
    await settle();

    const first = await answer('k3Jd9');
    const second = await answer('x8Pq2');

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
    const first = await answer('k3Jd9', 500);
    await expect(failed).rejects.toBeDefined();
    void votes.cast('k3Jd9', vote);
    await settle();
    httpTesting.expectOne(mine).flush(null, forbidden);
    await settle();

    expect(first).toMatch(TOKEN);
    expect(await answer('k3Jd9')).toBe(first);
    await settle();
    httpTesting.expectOne(mine).flush(vote);
  });
  describe('the stored vote', () => {
    const LINK_TOKEN = 'gnBC8IUdhskzM84pbChyLw';
    const stored = { name: 'Luis', votes: { a: 'available', b: 'preferred' } } as const;

    it('is none, without asking the API, when this browser holds no token for the event', async () => {
      await expect(myVotes().stored('k3Jd9')).resolves.toEqual({ kind: 'none' });
    });

    it('is the vote this browser cast, read with its token', async () => {
      const sent = myVotes().cast('k3Jd9', vote);
      const token = await answer('k3Jd9');
      await sent;

      const read = myVotes().stored('k3Jd9');
      await settle();
      const request = httpTesting.expectOne(mine);
      expect(request.request.method).toBe('GET');
      expect(request.request.headers.get('x-vote-token')).toBe(token);
      request.flush(stored);

      await expect(read).resolves.toEqual({ kind: 'voted', vote: stored });
    });

    it('edits the vote it read, even if another tab opens a private link for another vote', async () => {
      localStorage.setItem('qando.voteToken.k3Jd9', LINK_TOKEN);
      const votes = myVotes();
      const read = votes.stored('k3Jd9');
      await settle();
      httpTesting.expectOne(mine).flush(stored);
      await read;
      localStorage.setItem('qando.voteToken.k3Jd9', 'BBBBBBBBBBBBBBBBBBBBBB');

      void votes.cast('k3Jd9', vote);
      await settle();

      const edit = httpTesting.expectOne(mine);
      expect(edit.request.method).toBe('PUT');
      expect(edit.request.headers.get('x-vote-token')).toBe(LINK_TOKEN);
      edit.flush(vote);
    });

    it('is none when the token of this browser holds no vote (its send failed)', async () => {
      localStorage.setItem('qando.voteToken.k3Jd9', LINK_TOKEN);

      const read = myVotes().stored('k3Jd9');
      await settle();
      httpTesting.expectOne(mine).flush(null, forbidden);

      await expect(read).resolves.toEqual({ kind: 'none' });
    });

    it('is none when the API cannot answer, as voting then edits the vote the token may hold', async () => {
      localStorage.setItem('qando.voteToken.k3Jd9', LINK_TOKEN);

      const read = myVotes().stored('k3Jd9');
      await settle();
      httpTesting.expectOne(mine).flush(null, { status: 500, statusText: 'Error' });

      await expect(read).resolves.toEqual({ kind: 'none' });
    });

    it("is the vote of the private link's token, which replaces the browser's own", async () => {
      localStorage.setItem('qando.voteToken.k3Jd9', 'BBBBBBBBBBBBBBBBBBBBBB');
      const votes = myVotes();
      votes.claim('k3Jd9', LINK_TOKEN);

      const read = votes.stored('k3Jd9');
      await settle();
      const request = httpTesting.expectOne(mine);
      expect(request.request.headers.get('x-vote-token')).toBe(LINK_TOKEN);
      request.flush(stored);

      await expect(read).resolves.toEqual({ kind: 'voted', vote: stored });
      expect(localStorage.getItem('qando.voteToken.k3Jd9')).toBe(LINK_TOKEN);
    });

    it("edits the private link's vote when the voter confirms", async () => {
      const votes = myVotes();
      votes.claim('k3Jd9', LINK_TOKEN);

      const sent = votes.cast('k3Jd9', vote);
      await settle();
      const edit = httpTesting.expectOne(mine);
      expect(edit.request.method).toBe('PUT');
      expect(edit.request.headers.get('x-vote-token')).toBe(LINK_TOKEN);
      edit.flush(vote);

      await expect(sent).resolves.toBe(`/vote/k3Jd9/my-vote#t=${LINK_TOKEN}`);
    });

    it('keeps the private link’s token on the page when storage is blocked', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      const votes = myVotes();
      votes.claim('k3Jd9', LINK_TOKEN);

      const read = votes.stored('k3Jd9');
      await settle();
      const request = httpTesting.expectOne(mine);
      expect(request.request.headers.get('x-vote-token')).toBe(LINK_TOKEN);
      request.flush(stored);

      await expect(read).resolves.toEqual({ kind: 'voted', vote: stored });
    });

    it('is an unknown link when the private link’s token holds no vote of the event', async () => {
      const votes = myVotes();
      votes.claim('k3Jd9', LINK_TOKEN);

      const read = votes.stored('k3Jd9');
      await settle();
      httpTesting.expectOne(mine).flush(null, forbidden);

      await expect(read).resolves.toEqual({ kind: 'unknownLink' });
    });

    it('is none, not an unknown link, when the API cannot read the private link’s vote', async () => {
      localStorage.setItem('qando.voteToken.k3Jd9', 'BBBBBBBBBBBBBBBBBBBBBB');
      const votes = myVotes();
      votes.claim('k3Jd9', LINK_TOKEN);

      const read = votes.stored('k3Jd9');
      await settle();
      httpTesting.expectOne(mine).flush(null, { status: 500, statusText: 'Error' });

      await expect(read).resolves.toEqual({ kind: 'none' });
      // Unread, the link's token does not replace the browser's yet: voting edits its vote first.
      expect(localStorage.getItem('qando.voteToken.k3Jd9')).toBe('BBBBBBBBBBBBBBBBBBBBBB');
      const sent = votes.cast('k3Jd9', vote);
      await settle();
      const edit = httpTesting.expectOne(mine);
      expect(edit.request.method).toBe('PUT');
      expect(edit.request.headers.get('x-vote-token')).toBe(LINK_TOKEN);
      edit.flush(vote);

      await expect(sent).resolves.toBe(`/vote/k3Jd9/my-vote#t=${LINK_TOKEN}`);
      expect(localStorage.getItem('qando.voteToken.k3Jd9')).toBe(LINK_TOKEN);
    });

    it('casts anew when an unread private link turns out to hold no vote of the event', async () => {
      localStorage.setItem('qando.voteToken.k3Jd9', 'BBBBBBBBBBBBBBBBBBBBBB');
      const votes = myVotes();
      votes.claim('k3Jd9', LINK_TOKEN);
      const read = votes.stored('k3Jd9');
      await settle();
      httpTesting.expectOne(mine).flush(null, { status: 0, statusText: 'Unknown Error' });
      await read;

      const sent = votes.cast('k3Jd9', vote);
      await settle();
      // The link's token holds no vote here (of another event, say): the browser's own vote is
      // read, unshown, and edited only under its name.
      httpTesting.expectOne(mine).flush(null, forbidden);
      await settle();
      const own = httpTesting.expectOne(mine);
      expect(own.request.method).toBe('GET');
      expect(own.request.headers.get('x-vote-token')).toBe('BBBBBBBBBBBBBBBBBBBBBB');
      own.flush({ name: 'María', votes: {} });
      const token = await answer('k3Jd9');

      expect([LINK_TOKEN, 'BBBBBBBBBBBBBBBBBBBBBB']).not.toContain(token);
      await expect(sent).resolves.toBe(`/vote/k3Jd9/my-vote#t=${token}`);
      expect(localStorage.getItem('qando.voteToken.k3Jd9')).toBe(token);
    });

    it('keeps an unread private link pending when the edit fails for another reason', async () => {
      const votes = myVotes();
      votes.claim('k3Jd9', LINK_TOKEN);
      const failed = votes.cast('k3Jd9', vote);
      await settle();
      httpTesting.expectOne(mine).flush(null, { status: 500, statusText: 'Error' });
      await expect(failed).rejects.toBeDefined();
      expect(localStorage.getItem('qando.voteToken.k3Jd9')).toBeNull();

      void votes.cast('k3Jd9', vote);
      await settle();
      const edit = httpTesting.expectOne(mine);
      expect(edit.request.headers.get('x-vote-token')).toBe(LINK_TOKEN);
      edit.flush(vote);
    });

    it('retries a new vote behind an unknown link with its own token when storage is blocked', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      const votes = myVotes();
      votes.claim('k3Jd9', 'gnBC8IU');
      await votes.stored('k3Jd9');
      const failed = votes.cast('k3Jd9', vote);
      const first = await answer('k3Jd9', 500);
      await expect(failed).rejects.toBeDefined();

      void votes.cast('k3Jd9', vote);
      await settle();

      const edit = httpTesting.expectOne(mine);
      expect(edit.request.headers.get('x-vote-token')).toBe(first);
      edit.flush(vote);
    });

    describe('from a link copied in part, in a browser that holds a vote', () => {
      const BROWSER_TOKEN = 'BBBBBBBBBBBBBBBBBBBBBB';

      /** Opens the partial link and answers the silent read of the browser's own vote. */
      async function openedPartialLink(own: object | null, status = 200): Promise<MyVotes> {
        localStorage.setItem('qando.voteToken.k3Jd9', BROWSER_TOKEN);
        const votes = myVotes();
        votes.claim('k3Jd9', 'gnBC8IU');
        const read = votes.stored('k3Jd9');
        await settle();
        const request = httpTesting.expectOne(mine);
        expect(request.request.method).toBe('GET');
        expect(request.request.headers.get('x-vote-token')).toBe(BROWSER_TOKEN);
        request.flush(own, { status, statusText: status === 200 ? 'OK' : 'Error' });
        // The browser's vote is never shown: the link still holds none.
        await expect(read).resolves.toEqual({ kind: 'unknownLink' });
        return votes;
      }

      it('edits the browser’s vote when the voter types its name again', async () => {
        const votes = await openedPartialLink({ name: 'Luis', votes: {} });

        const sent = votes.cast('k3Jd9', { ...vote, name: '  luis ' });
        await settle();
        const edit = httpTesting.expectOne(mine);
        expect(edit.request.method).toBe('PUT');
        expect(edit.request.headers.get('x-vote-token')).toBe(BROWSER_TOKEN);
        edit.flush(vote);

        await expect(sent).resolves.toBe(`/vote/k3Jd9/my-vote#t=${BROWSER_TOKEN}`);
      });

      it('reads the browser’s vote before choosing, when the page voted without reading it', async () => {
        localStorage.setItem('qando.voteToken.k3Jd9', BROWSER_TOKEN);
        const votes = myVotes();
        votes.claim('k3Jd9', 'gnBC8IU');

        void votes.cast('k3Jd9', vote);
        await settle();
        httpTesting.expectOne(mine).flush({ name: 'María', votes: {} });

        expect(await answer('k3Jd9')).not.toBe(BROWSER_TOKEN);
      });

      it('casts one new vote when two tabs behind the same link vote at once', async () => {
        const tabs = [
          await openedPartialLink({ name: 'María', votes: {} }),
          await openedPartialLink({ name: 'María', votes: {} }),
        ];

        const sent = tabs.map((tab) => tab.cast('k3Jd9', vote));
        await settle();

        // The second tab finds the new token the first one stored, and edits its vote.
        const cast = httpTesting.expectOne(`/api/public/events/k3Jd9/participations`);
        const edit = httpTesting.expectOne(mine);
        const token = cast.request.headers.get('x-vote-token') ?? '';
        expect(token).not.toBe(BROWSER_TOKEN);
        expect(edit.request.headers.get('x-vote-token')).toBe(token);
        cast.flush({ participationId }, { status: 201, statusText: 'Created' });
        edit.flush(vote);
        await expect(Promise.all(sent)).resolves.toEqual([
          `/vote/k3Jd9/my-vote#t=${token}`,
          `/vote/k3Jd9/my-vote#t=${token}`,
        ]);
      });

      it('casts a new vote with a new token, leaving the browser’s vote alone, for another name', async () => {
        const votes = await openedPartialLink({ name: 'María', votes: {} });

        const sent = votes.cast('k3Jd9', vote);
        const token = await answer('k3Jd9');

        expect(token).toMatch(TOKEN);
        expect(token).not.toBe(BROWSER_TOKEN);
        await expect(sent).resolves.toBe(`/vote/k3Jd9/my-vote#t=${token}`);
        expect(localStorage.getItem('qando.voteToken.k3Jd9')).toBe(token);
      });

      it('casts a new vote on an anonymous event, where no name tells the voter', async () => {
        const votes = await openedPartialLink({ votes: {} });

        void votes.cast('k3Jd9', { votes: vote.votes });

        expect(await answer('k3Jd9')).not.toBe(BROWSER_TOKEN);
      });

      it('casts a new vote when the browser’s vote could not be read', async () => {
        const votes = await openedPartialLink(null, 500);

        void votes.cast('k3Jd9', vote);

        expect(await answer('k3Jd9')).not.toBe(BROWSER_TOKEN);
      });

      it('retries a new vote with its own token', async () => {
        const votes = await openedPartialLink({ name: 'María', votes: {} });
        const failed = votes.cast('k3Jd9', vote);
        const first = await answer('k3Jd9', 500);
        await expect(failed).rejects.toBeDefined();

        void votes.cast('k3Jd9', vote);
        await settle();

        const edit = httpTesting.expectOne(mine);
        expect(edit.request.headers.get('x-vote-token')).toBe(first);
        edit.flush(vote);
      });
    });

    describe('from a link of another event, in a browser that holds a vote', () => {
      const BROWSER_TOKEN = 'BBBBBBBBBBBBBBBBBBBBBB';

      /** Opens the link: its token holds no vote here (403), so the browser's own is read, unshown. */
      async function openedForeignLink(own: object): Promise<MyVotes> {
        localStorage.setItem('qando.voteToken.k3Jd9', BROWSER_TOKEN);
        const votes = myVotes();
        votes.claim('k3Jd9', LINK_TOKEN);
        const read = votes.stored('k3Jd9');
        await settle();
        const linkRead = httpTesting.expectOne(mine);
        expect(linkRead.request.headers.get('x-vote-token')).toBe(LINK_TOKEN);
        linkRead.flush(null, forbidden);
        await settle();
        const ownRead = httpTesting.expectOne(mine);
        expect(ownRead.request.headers.get('x-vote-token')).toBe(BROWSER_TOKEN);
        ownRead.flush(own);
        await expect(read).resolves.toEqual({ kind: 'unknownLink' });
        // The link's token is not kept: the browser's stays until the voter votes.
        expect(localStorage.getItem('qando.voteToken.k3Jd9')).toBe(BROWSER_TOKEN);
        return votes;
      }

      it('casts a new vote with a new token, never the link’s (taken by the other event)', async () => {
        const votes = await openedForeignLink({ name: 'María', votes: {} });

        const sent = votes.cast('k3Jd9', vote);
        const token = await answer('k3Jd9');

        expect([LINK_TOKEN, BROWSER_TOKEN]).not.toContain(token);
        await expect(sent).resolves.toBe(`/vote/k3Jd9/my-vote#t=${token}`);
      });

      it('edits the browser’s vote when the voter types its name again', async () => {
        const votes = await openedForeignLink({ name: 'Luis', votes: {} });

        void votes.cast('k3Jd9', vote);
        await settle();

        const edit = httpTesting.expectOne(mine);
        expect(edit.request.method).toBe('PUT');
        expect(edit.request.headers.get('x-vote-token')).toBe(BROWSER_TOKEN);
        edit.flush(vote);
      });
    });

    it('is an unknown link, casting with a new token, when the browser holds no token', async () => {
      const votes = myVotes();
      votes.claim('k3Jd9', 'gnBC8IU');

      await expect(votes.stored('k3Jd9')).resolves.toEqual({ kind: 'unknownLink' });
      void votes.cast('k3Jd9', vote);
      expect(await answer('k3Jd9')).toMatch(TOKEN);
    });
  });
});

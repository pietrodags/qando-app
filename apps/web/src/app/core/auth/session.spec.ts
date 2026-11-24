import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  type TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ManagementTokens } from './management-tokens';
import { Session } from './session';

const ana = { name: 'Ana', email: 'ana@example.com' };
const sessionUrl = '/api/auth/session';
const signOutUrl = '/api/auth/sign-out';
const deletionUrl = '/api/me/deletion';
const deletionCodeUrl = '/api/me/deletion-code';

/** Lets a settled request's promise chain run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

/** The API's answer to a request without a session. */
function signedOut(request: TestRequest): void {
  request.flush(
    { error: { code: 'UNAUTHENTICATED', message: 'No session', details: [] } },
    { status: 401, statusText: 'Unauthorized' },
  );
}

describe('Session', () => {
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
    localStorage.clear();
  });

  /** The session of a page whose first question the API answered with `answer`. */
  async function sessionAnswered(answer: typeof ana | null): Promise<Session> {
    const session = TestBed.inject(Session);
    httpTesting.expectOne(sessionUrl).flush(answer);
    await settle();
    return session;
  }

  describe('account', () => {
    it('is not known until the API answers, then it is the account signed in', async () => {
      const session = TestBed.inject(Session);
      expect(session.account()).toBeUndefined();

      const request = httpTesting.expectOne(sessionUrl);
      expect(request.request.method).toBe('GET');
      request.flush(ana);
      await settle();

      expect(session.account()).toEqual(ana);
    });

    it('is null in a browser without a session', async () => {
      const session = await sessionAnswered(null);

      expect(session.account()).toBeNull();
    });

    it('is null when the API cannot be asked', async () => {
      const session = TestBed.inject(Session);
      httpTesting.expectOne(sessionUrl).error(new ProgressEvent('error'));
      await settle();

      expect(session.account()).toBeNull();
    });
  });

  describe('signedIn', () => {
    it('waits for the API’s answer', async () => {
      const session = TestBed.inject(Session);
      let answered: boolean | undefined;
      void session.signedIn().then((signedIn) => (answered = signedIn));
      await settle();
      expect(answered).toBeUndefined();

      httpTesting.expectOne(sessionUrl).flush(ana);
      await settle();

      expect(answered).toBe(true);
    });

    it('is false without a session, asking the API once', async () => {
      const session = await sessionAnswered(null);

      await expect(session.signedIn()).resolves.toBe(false);
    });

    it('asks again when the last question got no answer', async () => {
      const session = TestBed.inject(Session);
      httpTesting.expectOne(sessionUrl).flush('down', { status: 500, statusText: 'Server Error' });
      await settle();

      const signedIn = session.signedIn();
      await settle();
      httpTesting.expectOne(sessionUrl).flush(ana);

      await expect(signedIn).resolves.toBe(true);
      expect(session.account()).toEqual(ana);
      // Answered now: nothing more is asked.
      await expect(session.signedIn()).resolves.toBe(true);
    });

    it('is false when the API still cannot be asked', async () => {
      const session = TestBed.inject(Session);
      httpTesting.expectOne(sessionUrl).error(new ProgressEvent('error'));
      await settle();

      const signedIn = session.signedIn();
      await settle();
      httpTesting.expectOne(sessionUrl).error(new ProgressEvent('error'));

      await expect(signedIn).resolves.toBe(false);
    });
  });

  describe('refresh', () => {
    it('asks the API again, as after signing in', async () => {
      const session = await sessionAnswered(null);

      const refreshed = session.refresh();
      httpTesting.expectOne(sessionUrl).flush(ana);
      await refreshed;

      expect(session.account()).toEqual(ana);
      await expect(session.signedIn()).resolves.toBe(true);
    });

    it('keeps the answer to the last question when an earlier one arrives after it', async () => {
      const session = TestBed.inject(Session);
      const first = httpTesting.expectOne(sessionUrl);
      const refreshed = session.refresh();
      const second = httpTesting.match(sessionUrl)[0]!;

      second.flush(ana);
      await refreshed;
      first.flush(null);
      await settle();

      expect(session.account()).toEqual(ana);
    });

    it('makes signedIn wait for the new answer', async () => {
      const session = await sessionAnswered(null);

      void session.refresh();
      const signedIn = session.signedIn();
      httpTesting.expectOne(sessionUrl).flush(ana);

      await expect(signedIn).resolves.toBe(true);
    });
  });

  describe('signOut', () => {
    it('ends the session on the server, then forgets the account and every management link', async () => {
      const session = await sessionAnswered(ana);
      const tokens = TestBed.inject(ManagementTokens);
      tokens.keep('k3Jd9', 'token-of-cena');
      localStorage.setItem('qando.voteToken.k3Jd9', 'vote-token');

      const signedOut = session.signOut();
      const request = httpTesting.expectOne(signOutUrl);
      expect(request.request.method).toBe('POST');
      // Until the server has ended it, nothing is forgotten.
      expect(session.account()).toEqual(ana);
      expect(tokens.of('k3Jd9')).toBe('token-of-cena');
      request.flush({ signedOut: true });
      await signedOut;

      expect(session.account()).toBeNull();
      await expect(session.signedIn()).resolves.toBe(false);
      expect(tokens.of('k3Jd9')).toBeNull();
      expect(localStorage.getItem('qando.voteToken.k3Jd9')).toBe('vote-token');
    });

    it('fails, keeping the account and the links, when the server could not end the session', async () => {
      const session = await sessionAnswered(ana);
      const tokens = TestBed.inject(ManagementTokens);
      tokens.keep('k3Jd9', 'token-of-cena');

      const signedOut = session.signOut();
      httpTesting
        .expectOne(signOutUrl)
        .flush(
          { error: { code: 'INTERNAL_ERROR', message: 'Unexpected', details: [] } },
          { status: 500, statusText: 'Server Error' },
        );

      await expect(signedOut).rejects.toMatchObject({ status: 500 });
      expect(session.account()).toEqual(ana);
      expect(tokens.of('k3Jd9')).toBe('token-of-cena');
    });

    it('stays signed out when an answer from before arrives afterwards', async () => {
      const session = await sessionAnswered(ana);
      void session.refresh();
      const before = httpTesting.expectOne(sessionUrl);

      const signedOut = session.signOut();
      httpTesting.expectOne(signOutUrl).flush({ signedOut: true });
      await signedOut;
      before.flush(ana);
      await settle();

      expect(session.account()).toBeNull();
    });
  });

  describe('deleteAccount', () => {
    it('deletes the account with the code, then forgets it and every management link, telling how many events went with it', async () => {
      const session = await sessionAnswered(ana);
      const tokens = TestBed.inject(ManagementTokens);
      tokens.keep('k3Jd9', 'token-of-cena');
      localStorage.setItem('qando.voteToken.k3Jd9', 'vote-token');

      const deleted = session.deleteAccount('482913');
      const request = httpTesting.expectOne(deletionUrl);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ code: '482913' });
      // Until the server has deleted it, nothing is forgotten.
      expect(session.account()).toEqual(ana);
      expect(tokens.of('k3Jd9')).toBe('token-of-cena');
      request.flush({ deleted: true, events: 2 });

      await expect(deleted).resolves.toBe(2);
      expect(session.account()).toBeNull();
      await expect(session.signedIn()).resolves.toBe(false);
      expect(tokens.of('k3Jd9')).toBeNull();
      expect(localStorage.getItem('qando.voteToken.k3Jd9')).toBe('vote-token');
    });

    it('fails, keeping the account and the links, when the code was refused', async () => {
      const session = await sessionAnswered(ana);
      const tokens = TestBed.inject(ManagementTokens);
      tokens.keep('k3Jd9', 'token-of-cena');

      const deleted = session.deleteAccount('482914');
      httpTesting
        .expectOne(deletionUrl)
        .flush(
          { error: { code: 'WRONG_CODE', message: 'Wrong', details: [], attemptsLeft: 4 } },
          { status: 400, statusText: 'Bad Request' },
        );

      await expect(deleted).rejects.toMatchObject({ status: 400 });
      expect(session.account()).toEqual(ana);
      expect(tokens.of('k3Jd9')).toBe('token-of-cena');
    });

    it('stays signed out when an answer from before arrives afterwards', async () => {
      const session = await sessionAnswered(ana);
      void session.refresh();
      const before = httpTesting.expectOne(sessionUrl);

      const deleted = session.deleteAccount('482913');
      httpTesting.expectOne(deletionUrl).flush({ deleted: true, events: 0 });
      await deleted;
      before.flush(ana);
      await settle();

      expect(session.account()).toBeNull();
    });

    it('answers null, forgetting the account and the links, when the server knew no session any more', async () => {
      const session = await sessionAnswered(ana);
      const tokens = TestBed.inject(ManagementTokens);
      tokens.keep('k3Jd9', 'token-of-cena');

      const deleted = session.deleteAccount('482913');
      signedOut(httpTesting.expectOne(deletionUrl));

      await expect(deleted).resolves.toBeNull();
      expect(session.account()).toBeNull();
      expect(tokens.of('k3Jd9')).toBeNull();
    });

    it('fails, keeping the account and the links, when the answer was lost', async () => {
      const session = await sessionAnswered(ana);
      const tokens = TestBed.inject(ManagementTokens);
      tokens.keep('k3Jd9', 'token-of-cena');

      const deleted = session.deleteAccount('482913');
      httpTesting.expectOne(deletionUrl).error(new ProgressEvent('error'));

      await expect(deleted).rejects.toMatchObject({ status: 0 });
      expect(session.account()).toEqual(ana);
      expect(tokens.of('k3Jd9')).toBe('token-of-cena');
    });
  });

  describe('sendDeletionCode', () => {
    it('sends the code that deletes the account to its email, answering the seconds until another', async () => {
      const session = await sessionAnswered(ana);

      const sent = session.sendDeletionCode();
      const request = httpTesting.expectOne(deletionCodeUrl);
      expect(request.request.method).toBe('POST');
      request.flush({ sent: true, resendAfterSeconds: 30 });

      await expect(sent).resolves.toBe(30);
      expect(session.account()).toEqual(ana);
    });

    it('answers null, forgetting the account and the links, when the server knew no session any more', async () => {
      const session = await sessionAnswered(ana);
      const tokens = TestBed.inject(ManagementTokens);
      tokens.keep('k3Jd9', 'token-of-cena');

      const sent = session.sendDeletionCode();
      signedOut(httpTesting.expectOne(deletionCodeUrl));

      await expect(sent).resolves.toBeNull();
      expect(session.account()).toBeNull();
      expect(tokens.of('k3Jd9')).toBeNull();
    });

    it('forgets nothing when the answer without a session comes after a newer answer about it', async () => {
      const session = await sessionAnswered(ana);
      const tokens = TestBed.inject(ManagementTokens);
      tokens.keep('k3Jd9', 'token-of-cena');
      const bea = { name: 'Bea', email: 'bea@example.com' };

      const sent = session.sendDeletionCode();
      const request = httpTesting.expectOne(deletionCodeUrl);
      // Another tab signed in meanwhile: this one asked again.
      const refreshed = session.refresh();
      httpTesting.expectOne(sessionUrl).flush(bea);
      await refreshed;
      signedOut(request);

      await expect(sent).rejects.toMatchObject({ status: 401 });
      expect(session.account()).toEqual(bea);
      expect(tokens.of('k3Jd9')).toBe('token-of-cena');
    });

    it('fails, keeping the account, when the code was not sent', async () => {
      const session = await sessionAnswered(ana);

      const sent = session.sendDeletionCode();
      httpTesting
        .expectOne(deletionCodeUrl)
        .flush(
          { error: { code: 'CODE_NOT_DELIVERED', message: 'Not delivered', details: [] } },
          { status: 502, statusText: 'Bad Gateway' },
        );

      await expect(sent).rejects.toMatchObject({ status: 502 });
      expect(session.account()).toEqual(ana);
    });
  });

  describe('with other tabs of the browser', () => {
    let otherTab: BroadcastChannel;
    let told: unknown[];

    beforeEach(() => {
      told = [];
      otherTab = new BroadcastChannel('qando.session');
      otherTab.onmessage = ({ data }: MessageEvent<unknown>) => told.push(data);
    });

    afterEach(() => {
      otherTab.close();
    });

    it('tells them once it has signed out, and nothing when the server could not', async () => {
      const session = await sessionAnswered(ana);

      const failed = session.signOut();
      httpTesting.expectOne(signOutUrl).flush('down', { status: 500, statusText: 'Server Error' });
      await expect(failed).rejects.toBeDefined();
      const signedOut = session.signOut();
      httpTesting.expectOne(signOutUrl).flush({ signedOut: true });
      await signedOut;

      await vi.waitFor(() => {
        expect(told).toEqual(['signed-out']);
      });
    });

    it('tells them once its account is deleted, and nothing when it was not', async () => {
      const session = await sessionAnswered(ana);

      const refused = session.deleteAccount('482914');
      httpTesting
        .expectOne(deletionUrl)
        .flush(
          { error: { code: 'CODE_EXPIRED', message: 'Expired', details: [] } },
          { status: 400, statusText: 'Bad Request' },
        );
      await expect(refused).rejects.toBeDefined();
      const deleted = session.deleteAccount('482913');
      httpTesting.expectOne(deletionUrl).flush({ deleted: true, events: 1 });
      await deleted;

      await vi.waitFor(() => {
        expect(told).toEqual(['signed-out']);
      });
    });

    it('tells them when the server knew no session any more', async () => {
      const session = await sessionAnswered(ana);

      const sent = session.sendDeletionCode();
      signedOut(httpTesting.expectOne(deletionCodeUrl));
      await sent;

      await vi.waitFor(() => {
        expect(told).toEqual(['signed-out']);
      });
    });

    it('tells them to ask again once a code signed in', async () => {
      const session = await sessionAnswered(null);

      const refreshed = session.refresh();
      httpTesting.expectOne(sessionUrl).flush(ana);
      await refreshed;

      await vi.waitFor(() => {
        expect(told).toEqual(['signed-in']);
      });
    });

    it('tells them nothing when it only asks again after a question without an answer', async () => {
      const session = TestBed.inject(Session);
      httpTesting.expectOne(sessionUrl).error(new ProgressEvent('error'));
      await settle();
      const signedIn = session.signedIn();
      await settle();
      httpTesting.expectOne(sessionUrl).flush(ana);
      await signedIn;

      // A message would have arrived by the time this one of the test's own does.
      const echo = new BroadcastChannel('qando.session');
      echo.postMessage('echo');
      await vi.waitFor(() => {
        expect(told).toEqual(['echo']);
      });
      echo.close();
    });

    it('forgets the account and the management links when another tab signs out, asking nothing', async () => {
      const session = await sessionAnswered(ana);
      const tokens = TestBed.inject(ManagementTokens);
      tokens.keep('k3Jd9', 'token-of-cena');
      void session.refresh();
      const before = httpTesting.expectOne(sessionUrl);

      otherTab.postMessage('signed-out');

      await vi.waitFor(() => {
        expect(session.account()).toBeNull();
      });
      expect(tokens.of('k3Jd9')).toBeNull();
      // An answer from before the other tab signed out does not sign this one in again.
      before.flush(ana);
      await settle();
      expect(session.account()).toBeNull();
      await expect(session.signedIn()).resolves.toBe(false);
    });

    it('asks the API again when another tab signs in', async () => {
      const session = await sessionAnswered(null);

      otherTab.postMessage('signed-in');

      await vi.waitFor(() => {
        httpTesting.expectOne(sessionUrl).flush(ana);
      });
      await expect(session.signedIn()).resolves.toBe(true);
      expect(session.account()).toEqual(ana);
    });

    it('stops listening to them once the app is gone', async () => {
      const session = await sessionAnswered(ana);

      TestBed.resetTestingModule();
      otherTab.postMessage('signed-out');
      const echo = new BroadcastChannel('qando.session');
      echo.postMessage('echo');
      await vi.waitFor(() => {
        expect(told).toEqual(['echo']);
      });
      echo.close();

      expect(session.account()).toEqual(ana);
      // The next test's module is set up by `beforeEach`; this one has none left to verify.
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      httpTesting = TestBed.inject(HttpTestingController);
    });
  });
});

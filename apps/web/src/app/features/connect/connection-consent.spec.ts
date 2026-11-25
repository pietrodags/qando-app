import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConnectionConsent } from './connection-consent';

const which = { method: 'POST', url: '/api/auth/connecting-application' };
const consent = { method: 'POST', url: '/api/auth/oauth2/consent' };

/** A request to connect, as the consent page's address carries it. */
const asked = 'response_type=code&client_id=https%3A%2F%2Fclaude.ai%2Fmcp.json&sig=a%2Bb%3D';

function errorBody(code: string) {
  return { error: { code, message: 'x', details: [] } };
}

describe('ConnectionConsent', () => {
  let requests: ConnectionConsent;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    requests = TestBed.inject(ConnectionConsent);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  describe('the application a request names', () => {
    it('asks the API with the request, whole, and answers the application it names', async () => {
      const answer = requests.application(asked);
      const sent = httpTesting.expectOne(which);
      expect(sent.request.body).toEqual({ connectionRequest: asked });
      sent.flush({ name: 'Claude', host: 'claude.ai' });
      await expect(answer).resolves.toEqual({ name: 'Claude', host: 'claude.ai' });
    });

    it('says the request expired when the API no longer takes it', async () => {
      const answer = requests.application(asked);
      httpTesting
        .expectOne(which)
        .flush(errorBody('CONNECTION_REQUEST_EXPIRED'), { status: 410, statusText: 'Gone' });
      await expect(answer).resolves.toBe('expired');
    });

    it('says the session ended when the API finds none', async () => {
      const answer = requests.application(asked);
      httpTesting
        .expectOne(which)
        .flush(errorBody('UNAUTHENTICATED'), { status: 401, statusText: 'Unauthorized' });
      await expect(answer).resolves.toBe('signed-out');
    });

    it.each([
      ['a failure of the server', 500, errorBody('INTERNAL_ERROR')],
      ['too many requests from the address', 429, errorBody('RATE_LIMITED')],
      ['a page of another site', 403, errorBody('FOREIGN_PAGE')],
      ['an answer that is not the API’s', 410, '<html>Gone</html>'],
    ])('fails with the error itself on %s', async (_what, status, body) => {
      const answer = requests.application(asked);
      httpTesting.expectOne(which).flush(body, { status, statusText: 'x' });
      await expect(answer).rejects.toMatchObject({ status });
      await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    });

    it('fails when the request never reaches the API', async () => {
      const answer = requests.application(asked);
      httpTesting.expectOne(which).error(new ProgressEvent('error'));
      await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    });

    it('fails on an answer that names no application', async () => {
      const answer = requests.application(asked);
      httpTesting.expectOne(which).flush({ name: '', host: 'claude.ai' });
      await expect(answer).rejects.toThrow();
    });
  });

  describe('the account’s answer', () => {
    it.each([
      ['allowing', true],
      ['refusing', false],
    ])(
      'sends it with the request, whole, and answers where the browser goes back to the application: %s',
      async (_what, allow) => {
        const answer = requests.answer(asked, allow);
        const sent = httpTesting.expectOne(consent);
        expect(sent.request.body).toEqual({ accept: allow, oauth_query: asked });
        sent.flush({ redirect: true, url: 'https://claude.ai/callback?code=c0de&state=s' });
        await expect(answer).resolves.toEqual({
          returnTo: 'https://claude.ai/callback?code=c0de&state=s',
          stays: false,
        });
      },
    );

    it.each([
      ['an application on the same computer', 'http://localhost:33418/callback?code=c0de'],
      ['a page of qando’s own site', '/api/auth/oauth2/authorize?response_type=code'],
    ])('goes back to %s, a page the browser opens in place of this one', async (_what, url) => {
      const answer = requests.answer(asked, true);
      httpTesting.expectOne(consent).flush({ redirect: true, url });
      await expect(answer).resolves.toEqual({ returnTo: url, stays: false });
    });

    it.each([
      ['an application the system opens by a name of its own', 'cursor://mcp/callback?code=c0de'],
      ['one named without a host', 'com.example.app:/callback?code=c0de'],
    ])('goes back to %s, which the browser hands over while it stays here', async (_what, url) => {
      const answer = requests.answer(asked, true);
      httpTesting.expectOne(consent).flush({ redirect: true, url });
      await expect(answer).resolves.toEqual({ returnTo: url, stays: true });
    });

    it('says the request expired when the authorization server no longer takes it', async () => {
      const answer = requests.answer(asked, true);
      httpTesting
        .expectOne(consent)
        .flush(
          { error: 'invalid_signature', message: 'Bad Request' },
          { status: 400, statusText: 'Bad Request' },
        );
      await expect(answer).resolves.toBe('expired');
    });

    it('says the session ended when the authorization server finds none', async () => {
      const answer = requests.answer(asked, false);
      httpTesting
        .expectOne(consent)
        .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
      await expect(answer).resolves.toBe('signed-out');
    });

    it.each([
      ['another refusal of the request', 400, { error: 'invalid_request' }],
      ['a refusal that says nothing', 400, null],
      ['a refusal that is no object', 400, 'invalid_signature'],
      [
        'the reason of an expired request under another status',
        403,
        { error: 'invalid_signature' },
      ],
      ['a failure of the server', 500, errorBody('INTERNAL_ERROR')],
      ['too many requests from the address', 429, errorBody('RATE_LIMITED')],
    ])('fails with the error itself on %s', async (_what, status, body) => {
      const answer = requests.answer(asked, true);
      httpTesting.expectOne(consent).flush(body, { status, statusText: 'x' });
      await expect(answer).rejects.toMatchObject({ status });
      await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    });

    it('fails when the answer never reaches the authorization server', async () => {
      const answer = requests.answer(asked, true);
      httpTesting.expectOne(consent).error(new ProgressEvent('error'));
      await expect(answer).rejects.toBeInstanceOf(HttpErrorResponse);
    });

    it.each([
      ['no address', { redirect: true }],
      ['an address that is no text', { redirect: true, url: 7 }],
      ['an empty address', { redirect: true, url: '' }],
      ['nothing', null],
    ])('fails on an answer with %s to go back to', async (_what, body) => {
      const answer = requests.answer(asked, true);
      httpTesting.expectOne(consent).flush(body);
      await expect(answer).rejects.toThrow('The authorization server gave no address to go on at');
    });

    it.each([
      'javascript:alert(document.cookie)//callback',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'blob:https://qando.app/3f0c',
    ])('fails on an address the browser would run or draw itself, never open: %s', async (url) => {
      const answer = requests.answer(asked, true);
      httpTesting.expectOne(consent).flush({ redirect: true, url });
      await expect(answer).rejects.toThrow('The authorization server gave no address to go on at');
    });
  });
});

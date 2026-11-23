import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ManagedEvent } from '@qando/contracts';
import { EventManagement } from './event-management';

const TOKEN = 'Zx81aB2cD4eF6gH8iJ0kLm';
const OTHER_TOKEN = 'Yw92aB2cD4eF6gH8iJ0kLm';
const july10 = '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11';

const cena: ManagedEvent = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  state: 'open',
  options: [{ id: july10, dates: { kind: 'single', date: '2026-07-10' }, time: null }],
  confirmedOption: null,
  voters: 2,
  recommendedOptionIds: [july10],
  participationId: 'k3Jd9aB2cD4eF6gH8iJ0kL',
  resultsId: 'Qw7p2aB2cD4eF6gH8iJ0kL',
  emails: [],
};
const confirmed: ManagedEvent = {
  ...cena,
  state: 'confirmed',
  confirmedOption: cena.options[0]!,
  recommendedOptionIds: [],
};

const managed = '/api/events/k3Jd9';
const confirmation = '/api/events/k3Jd9/confirmation';
const summaryRetry = '/api/events/k3Jd9/emails/summary/retry';
const withPendingSummary: ManagedEvent = {
  ...cena,
  emails: [{ type: 'summary', status: 'pending' }],
};

function errorBody(code: string, extra: object = {}) {
  return { error: { code, message: code, details: [], ...extra } };
}

/** Lets a settled request's promise chain reach the next request. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('EventManagement', () => {
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

  /** A new instance, as after reloading the page or in another tab. */
  function management(): EventManagement {
    return TestBed.runInInjectionContext(() => new EventManagement());
  }

  describe('read', () => {
    it('reads the event with the token of the management link this browser opened', async () => {
      management().claim('k3Jd9', TOKEN);

      const read = management().read('k3Jd9');
      const request = httpTesting.expectOne(managed);
      expect(request.request.method).toBe('GET');
      expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
      request.flush(cena);

      await expect(read).resolves.toEqual({ kind: 'managed', event: cena });
    });

    it('asks without a token when the browser holds none: the API refuses it', async () => {
      const read = management().read('k3Jd9');
      const request = httpTesting.expectOne(managed);
      expect(request.request.headers.has('x-management-token')).toBe(false);
      request.flush(errorBody('UNAUTHENTICATED'), { status: 401, statusText: 'Unauthorized' });

      await expect(read).resolves.toEqual({ kind: 'refused' });
    });

    it.each([
      [403, 'FORBIDDEN', 'another event’s token, or an event that does not exist'],
      [400, 'VALIDATION_FAILED', 'a malformed event ID'],
    ])('is refused on %i %s (%s)', async (status, code) => {
      management().claim('k3Jd9', TOKEN);
      const read = management().read('k3Jd9');
      httpTesting.expectOne(managed).flush(errorBody(code), { status, statusText: code });

      await expect(read).resolves.toEqual({ kind: 'refused' });
    });

    it('tells a cancelled event by its kept title', async () => {
      management().claim('k3Jd9', TOKEN);
      const read = management().read('k3Jd9');
      httpTesting
        .expectOne(managed)
        .flush(errorBody('EVENT_CANCELLED', { title: 'Cena de verano' }), {
          status: 410,
          statusText: 'Gone',
        });

      await expect(read).resolves.toEqual({ kind: 'cancelled', title: 'Cena de verano' });
    });

    it.each([
      [500, 'Server Error'],
      [429, 'Too Many Requests'],
    ])('fails when the API answers %i, so the page can offer to try again', async (status) => {
      const read = management().read('k3Jd9');
      httpTesting.expectOne(managed).flush(null, { status, statusText: 'Error' });

      await expect(read).rejects.toBeDefined();
    });

    it('fails when the API cannot be reached', async () => {
      const read = management().read('k3Jd9');
      httpTesting.expectOne(managed).error(new ProgressEvent('error'));

      await expect(read).rejects.toBeDefined();
    });
  });

  describe('claim', () => {
    it('keeps one token per event', async () => {
      management().claim('k3Jd9', TOKEN);
      management().claim('Re0YV', OTHER_TOKEN);

      void management().read('k3Jd9');
      void management().read('Re0YV');

      const first = httpTesting.expectOne(managed);
      const second = httpTesting.expectOne('/api/events/Re0YV');
      expect(first.request.headers.get('x-management-token')).toBe(TOKEN);
      expect(second.request.headers.get('x-management-token')).toBe(OTHER_TOKEN);
      first.flush(cena);
      second.flush(cena);
      await settle();
    });

    it('replaces the token held before: the link just opened wins', async () => {
      management().claim('k3Jd9', OTHER_TOKEN);
      management().claim('k3Jd9', TOKEN);

      void management().read('k3Jd9');
      const request = httpTesting.expectOne(managed);
      expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
      request.flush(cena);
      await settle();
    });

    it.each([
      ['cut short', TOKEN.slice(0, 10)],
      ['empty', ''],
      ['with characters no token has', `${TOKEN.slice(0, 21)}=`],
    ])('ignores a token %s, keeping the one held before', async (_name, broken) => {
      management().claim('k3Jd9', TOKEN);
      management().claim('k3Jd9', broken);

      void management().read('k3Jd9');
      const request = httpTesting.expectOne(managed);
      expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
      request.flush(cena);
      await settle();
    });

    it('keeps the token on this page when the browser refuses its storage', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      const page = management();
      page.claim('k3Jd9', TOKEN);

      void page.read('k3Jd9');
      const request = httpTesting.expectOne(managed);
      expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
      request.flush(cena);
      await settle();
    });
  });

  describe('confirm', () => {
    beforeEach(() => {
      management().claim('k3Jd9', TOKEN);
    });

    it('confirms the option with the token and answers the confirmed event', async () => {
      const confirming = management().confirm('k3Jd9', july10);
      const request = httpTesting.expectOne(confirmation);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ optionId: july10 });
      expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
      request.flush(confirmed);

      await expect(confirming).resolves.toEqual({ kind: 'managed', event: confirmed });
    });

    it.each([
      [409, 'ALREADY_CONFIRMED', 'another option was confirmed meanwhile'],
      [400, 'VALIDATION_FAILED', 'the option is no longer the event’s'],
    ])('reads the event again on %i %s (%s)', async (status, code) => {
      const confirming = management().confirm('k3Jd9', july10);
      httpTesting.expectOne(confirmation).flush(errorBody(code), { status, statusText: code });
      await settle();
      const reread = httpTesting.expectOne(managed);
      expect(reread.request.headers.get('x-management-token')).toBe(TOKEN);
      reread.flush(confirmed);

      await expect(confirming).resolves.toEqual({ kind: 'managed', event: confirmed });
    });

    it('answers the event with its new options, saying they changed, on 409 OPTIONS_CHANGED', async () => {
      const replaced: ManagedEvent = {
        ...cena,
        options: [
          {
            id: '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c21',
            dates: { kind: 'single', date: '2026-07-11' },
            time: null,
          },
        ],
        voters: 0,
        recommendedOptionIds: [],
      };
      const confirming = management().confirm('k3Jd9', july10);
      httpTesting
        .expectOne(confirmation)
        .flush(errorBody('OPTIONS_CHANGED'), { status: 409, statusText: 'Conflict' });
      await settle();
      const reread = httpTesting.expectOne(managed);
      expect(reread.request.headers.get('x-management-token')).toBe(TOKEN);
      reread.flush(replaced);

      await expect(confirming).resolves.toEqual({ kind: 'optionsChanged', event: replaced });
    });

    it('tells a cancelled event when the options changed and the event, read again, was cancelled', async () => {
      const confirming = management().confirm('k3Jd9', july10);
      httpTesting
        .expectOne(confirmation)
        .flush(errorBody('OPTIONS_CHANGED'), { status: 409, statusText: 'Conflict' });
      await settle();
      httpTesting
        .expectOne(managed)
        .flush(errorBody('EVENT_CANCELLED', { title: 'Cena de verano' }), {
          status: 410,
          statusText: 'Gone',
        });

      await expect(confirming).resolves.toEqual({ kind: 'cancelled', title: 'Cena de verano' });
    });

    it('is refused when the token no longer manages the event', async () => {
      const confirming = management().confirm('k3Jd9', july10);
      httpTesting
        .expectOne(confirmation)
        .flush(errorBody('FORBIDDEN'), { status: 403, statusText: 'Forbidden' });

      await expect(confirming).resolves.toEqual({ kind: 'refused' });
    });

    it('tells a cancelled event by its kept title', async () => {
      const confirming = management().confirm('k3Jd9', july10);
      httpTesting
        .expectOne(confirmation)
        .flush(errorBody('EVENT_CANCELLED', { title: 'Cena de verano' }), {
          status: 410,
          statusText: 'Gone',
        });

      await expect(confirming).resolves.toEqual({ kind: 'cancelled', title: 'Cena de verano' });
    });

    it('fails with the error when the confirmation does not get through', async () => {
      const confirming = management().confirm('k3Jd9', july10);
      httpTesting.expectOne(confirmation).flush(null, { status: 500, statusText: 'Error' });

      await expect(confirming).rejects.toMatchObject({ status: 500 });
    });

    it('fails with the error when the API cannot be reached', async () => {
      const confirming = management().confirm('k3Jd9', july10);
      httpTesting.expectOne(confirmation).error(new ProgressEvent('error'));

      await expect(confirming).rejects.toMatchObject({ status: 0 });
    });
  });
  describe('retry', () => {
    beforeEach(() => {
      management().claim('k3Jd9', TOKEN);
    });

    it('asks the API to try the email again with the token, and answers the email’s new state', async () => {
      const retrying = management().retry('k3Jd9', 'summary');
      const request = httpTesting.expectOne(summaryRetry);
      expect(request.request.method).toBe('POST');
      expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
      request.flush({ type: 'summary', status: 'pending' });

      await expect(retrying).resolves.toEqual({
        kind: 'retried',
        email: { type: 'summary', status: 'pending' },
      });
    });

    it('retries the "voting closed" email by its own address', async () => {
      const retrying = management().retry('k3Jd9', 'voting-closed');
      httpTesting
        .expectOne('/api/events/k3Jd9/emails/voting-closed/retry')
        .flush({ type: 'voting-closed', status: 'pending' });

      await expect(retrying).resolves.toEqual({
        kind: 'retried',
        email: { type: 'voting-closed', status: 'pending' },
      });
    });

    it.each([
      [409, 'EMAIL_NOT_FAILED', 'it was retried meanwhile, from another tab'],
      [400, 'VALIDATION_FAILED', 'the request broke the contract'],
    ])('reads the event again on %i %s (%s)', async (status, code) => {
      const retrying = management().retry('k3Jd9', 'summary');
      httpTesting.expectOne(summaryRetry).flush(errorBody(code), { status, statusText: code });
      await settle();
      const reread = httpTesting.expectOne(managed);
      expect(reread.request.headers.get('x-management-token')).toBe(TOKEN);
      reread.flush(withPendingSummary);

      await expect(retrying).resolves.toEqual({ kind: 'managed', event: withPendingSummary });
    });

    it.each([
      [401, 'UNAUTHENTICATED'],
      [403, 'FORBIDDEN'],
    ])('is refused on %i %s', async (status, code) => {
      const retrying = management().retry('k3Jd9', 'summary');
      httpTesting.expectOne(summaryRetry).flush(errorBody(code), { status, statusText: code });

      await expect(retrying).resolves.toEqual({ kind: 'refused' });
    });

    it('tells a cancelled event by its kept title', async () => {
      const retrying = management().retry('k3Jd9', 'summary');
      httpTesting
        .expectOne(summaryRetry)
        .flush(errorBody('EVENT_CANCELLED', { title: 'Cena de verano' }), {
          status: 410,
          statusText: 'Gone',
        });

      await expect(retrying).resolves.toEqual({ kind: 'cancelled', title: 'Cena de verano' });
    });

    it('fails when the retry does not get through', async () => {
      const retrying = management().retry('k3Jd9', 'summary');
      httpTesting.expectOne(summaryRetry).flush(null, { status: 500, statusText: 'Error' });

      await expect(retrying).rejects.toBeDefined();
    });
  });

  describe('changeDeadline', () => {
    const deadline = '/api/events/k3Jd9/deadline';
    const extended: ManagedEvent = { ...cena, deadline: '2026-07-03' };

    beforeEach(() => {
      management().claim('k3Jd9', TOKEN);
    });

    it('sends the new deadline with the token and answers the event as the API leaves it', async () => {
      const changing = management().changeDeadline('k3Jd9', '2026-07-03');
      const request = httpTesting.expectOne(deadline);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ deadline: '2026-07-03' });
      expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
      request.flush(extended);

      await expect(changing).resolves.toEqual({ kind: 'managed', event: extended });
    });

    it('reads the event again when a date was confirmed meanwhile', async () => {
      const changing = management().changeDeadline('k3Jd9', '2026-07-03');
      httpTesting
        .expectOne(deadline)
        .flush(errorBody('ALREADY_CONFIRMED'), { status: 409, statusText: 'Conflict' });
      await settle();
      const reread = httpTesting.expectOne(managed);
      expect(reread.request.headers.get('x-management-token')).toBe(TOKEN);
      reread.flush(confirmed);

      await expect(changing).resolves.toEqual({ kind: 'managed', event: confirmed });
    });

    it.each([
      [401, 'UNAUTHENTICATED'],
      [403, 'FORBIDDEN'],
    ])('is refused on %i %s', async (status, code) => {
      const changing = management().changeDeadline('k3Jd9', '2026-07-03');
      httpTesting.expectOne(deadline).flush(errorBody(code), { status, statusText: code });

      await expect(changing).resolves.toEqual({ kind: 'refused' });
    });

    it('tells a cancelled event by its kept title', async () => {
      const changing = management().changeDeadline('k3Jd9', '2026-07-03');
      httpTesting
        .expectOne(deadline)
        .flush(errorBody('EVENT_CANCELLED', { title: 'Cena de verano' }), {
          status: 410,
          statusText: 'Gone',
        });

      await expect(changing).resolves.toEqual({ kind: 'cancelled', title: 'Cena de verano' });
    });

    it.each([
      [400, 'VALIDATION_FAILED', 'a day no longer allowed, as after midnight'],
      [500, 'INTERNAL', 'the server failed'],
    ])('fails on %i %s (%s)', async (status, code) => {
      const changing = management().changeDeadline('k3Jd9', '2026-07-03');
      httpTesting.expectOne(deadline).flush(errorBody(code), { status, statusText: code });

      await expect(changing).rejects.toBeDefined();
    });
  });

  describe('closeVoting', () => {
    const close = '/api/events/k3Jd9/close';
    const closed: ManagedEvent = { ...cena, state: 'closed', deadline: '2026-06-20' };

    beforeEach(() => {
      management().claim('k3Jd9', TOKEN);
    });

    it('closes voting with the token and answers the event closed', async () => {
      const closing = management().closeVoting('k3Jd9');
      const request = httpTesting.expectOne(close);
      expect(request.request.method).toBe('POST');
      expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
      request.flush(closed);

      await expect(closing).resolves.toEqual({ kind: 'managed', event: closed });
    });

    it.each([
      [409, 'ALREADY_CONFIRMED', 'a date was confirmed meanwhile'],
      [400, 'VALIDATION_FAILED', 'a malformed event ID'],
    ])('reads the event again on %i %s (%s)', async (status, code) => {
      const closing = management().closeVoting('k3Jd9');
      httpTesting.expectOne(close).flush(errorBody(code), { status, statusText: code });
      await settle();
      httpTesting.expectOne(managed).flush(confirmed);

      await expect(closing).resolves.toEqual({ kind: 'managed', event: confirmed });
    });

    it.each([
      [401, 'UNAUTHENTICATED'],
      [403, 'FORBIDDEN'],
    ])('is refused on %i %s', async (status, code) => {
      const closing = management().closeVoting('k3Jd9');
      httpTesting.expectOne(close).flush(errorBody(code), { status, statusText: code });

      await expect(closing).resolves.toEqual({ kind: 'refused' });
    });

    it('tells a cancelled event by its kept title', async () => {
      const closing = management().closeVoting('k3Jd9');
      httpTesting
        .expectOne(close)
        .flush(errorBody('EVENT_CANCELLED', { title: 'Cena de verano' }), {
          status: 410,
          statusText: 'Gone',
        });

      await expect(closing).resolves.toEqual({ kind: 'cancelled', title: 'Cena de verano' });
    });

    it('fails when the closing does not get through', async () => {
      const closing = management().closeVoting('k3Jd9');
      httpTesting.expectOne(close).flush(null, { status: 500, statusText: 'Error' });

      await expect(closing).rejects.toBeDefined();
    });
  });

  describe('replaceOptions', () => {
    const optionsAt = '/api/events/k3Jd9/options';
    const options = [
      { dates: { kind: 'single', date: '2026-07-11' }, time: null },
      { dates: { kind: 'range', start: '2026-07-17', end: '2026-07-19' }, time: null },
    ] as const;

    beforeEach(() => {
      management().claim('k3Jd9', TOKEN);
    });

    it('sends the options and those they replace with the token, and answers them saved', async () => {
      const saving = management().replaceOptions('k3Jd9', options, [july10]);
      const request = httpTesting.expectOne(optionsAt);
      expect(request.request.method).toBe('PUT');
      expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
      expect(request.request.body).toEqual({ options, replacesOptionIds: [july10] });
      request.flush(cena);

      await expect(saving).resolves.toBe('saved');
    });

    it.each([
      ['VOTES_EXIST', 'votedMeanwhile'],
      ['OPTIONS_CHANGED', 'optionsOutdated'],
      ['ALREADY_CONFIRMED', 'refused'],
      ['VOTING_CLOSED', 'refused'],
    ])('answers 409 %s as %s', async (code, answer) => {
      const saving = management().replaceOptions('k3Jd9', options, [july10]);
      httpTesting
        .expectOne(optionsAt)
        .flush(errorBody(code), { status: 409, statusText: 'Conflict' });

      await expect(saving).resolves.toBe(answer);
    });

    it.each([
      [401, 'UNAUTHENTICATED'],
      [403, 'FORBIDDEN'],
      [410, 'EVENT_CANCELLED'],
    ])('answers %i %s as refused', async (status, code) => {
      const saving = management().replaceOptions('k3Jd9', options, [july10]);
      httpTesting
        .expectOne(optionsAt)
        .flush(errorBody(code, { title: 'Cena de verano' }), { status, statusText: code });

      await expect(saving).resolves.toBe('refused');
    });

    it.each([
      [400, 'VALIDATION_FAILED'],
      [429, 'RATE_LIMITED'],
      [500, 'INTERNAL'],
    ])('fails on %i %s: nothing was saved, and trying again may', async (status, code) => {
      const saving = management().replaceOptions('k3Jd9', options, [july10]);
      httpTesting.expectOne(optionsAt).flush(errorBody(code), { status, statusText: code });

      await expect(saving).rejects.toMatchObject({ status });
    });

    it('fails when the request does not get through', async () => {
      const saving = management().replaceOptions('k3Jd9', options, [july10]);
      httpTesting.expectOne(optionsAt).error(new ProgressEvent('error'));

      await expect(saving).rejects.toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('cancel', () => {
    beforeEach(() => {
      management().claim('k3Jd9', TOKEN);
    });

    it('cancels the event with the token and answers it cancelled, with its title', async () => {
      const cancelling = management().cancel('k3Jd9');
      const request = httpTesting.expectOne(managed);
      expect(request.request.method).toBe('DELETE');
      expect(request.request.headers.get('x-management-token')).toBe(TOKEN);
      request.flush({ title: 'Cena de verano' });

      await expect(cancelling).resolves.toEqual({ kind: 'cancelled', title: 'Cena de verano' });
    });

    it('answers the same when it was cancelled already, by another tab or a lost answer', async () => {
      const cancelling = management().cancel('k3Jd9');
      httpTesting
        .expectOne(managed)
        .flush(errorBody('EVENT_CANCELLED', { title: 'Cena de verano' }), {
          status: 410,
          statusText: 'Gone',
        });

      await expect(cancelling).resolves.toEqual({ kind: 'cancelled', title: 'Cena de verano' });
    });

    it.each([
      [401, 'UNAUTHENTICATED'],
      [403, 'FORBIDDEN'],
    ])('is refused on %i %s', async (status, code) => {
      const cancelling = management().cancel('k3Jd9');
      httpTesting.expectOne(managed).flush(errorBody(code), { status, statusText: code });

      await expect(cancelling).resolves.toEqual({ kind: 'refused' });
    });

    it('fails when the cancellation does not get through', async () => {
      const cancelling = management().cancel('k3Jd9');
      httpTesting.expectOne(managed).flush(null, { status: 500, statusText: 'Error' });

      await expect(cancelling).rejects.toBeDefined();
    });
  });
});

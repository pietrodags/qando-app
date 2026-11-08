import { provideHttpClient } from '@angular/common/http';
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
};
const confirmed: ManagedEvent = {
  ...cena,
  state: 'confirmed',
  confirmedOption: cena.options[0]!,
  recommendedOptionIds: [],
};

const managed = '/api/events/k3Jd9';
const confirmation = '/api/events/k3Jd9/confirmation';

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

    it('fails when the confirmation does not get through', async () => {
      const confirming = management().confirm('k3Jd9', july10);
      httpTesting.expectOne(confirmation).flush(null, { status: 500, statusText: 'Error' });

      await expect(confirming).rejects.toBeDefined();
    });
  });
});

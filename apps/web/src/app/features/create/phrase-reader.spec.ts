import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { DateInterpretation } from '@qando/contracts';
import { PhraseReader } from './phrase-reader';

const reading: DateInterpretation = {
  options: [{ dates: { kind: 'single', date: '2026-07-06' }, time: null }],
  questions: [],
  notices: [{ kind: 'unclear', fragment: 'o así' }],
  timesLeftOut: [],
  questionsNotAsked: [],
};

describe('the reader of a phrase', () => {
  let httpTesting: HttpTestingController;
  let reader: PhraseReader;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    reader = TestBed.inject(PhraseReader);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** The browser speaks `language`, as `navigator` says it. */
  function browserIn(language: string): void {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue(language);
  }

  it('asks the API with the phrase, the time zone of the browser and the region of its language', () => {
    browserIn('en-US');
    void reader.read('7/4 at 9pm');

    const request = httpTesting.expectOne('/api/date-interpretations');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      text: '7/4 at 9pm',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      region: 'US',
    });
    request.flush(reading);
  });

  it("asks the API with the time zone given, in place of the browser's", () => {
    browserIn('es-ES');
    void reader.read('el 7/4', 'Pacific/Kiritimati');

    const request = httpTesting.expectOne('/api/date-interpretations');
    expect(request.request.body).toEqual({
      text: 'el 7/4',
      timeZone: 'Pacific/Kiritimati',
      region: 'ES',
    });
    request.flush(reading);
  });

  it('names no region when the language of the browser has none', () => {
    browserIn('es');
    void reader.read('el 7/4');

    const request = httpTesting.expectOne('/api/date-interpretations');
    expect(request.request.body).toEqual({
      text: 'el 7/4',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    request.flush(reading);
  });

  it('answers what the phrase says', async () => {
    const read = reader.read('todos los lunes de julio');

    httpTesting.expectOne('/api/date-interpretations').flush(reading);

    await expect(read).resolves.toEqual({ kind: 'read', reading });
  });

  it('says so when the API takes no more phrases from this address for now', async () => {
    const read = reader.read('todos los lunes de julio');

    httpTesting
      .expectOne('/api/date-interpretations')
      .flush(
        { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
        { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '120' } },
      );

    await expect(read).resolves.toEqual({ kind: 'limited' });
  });

  it.each([400, 403, 500])('has failed when the API answers %i', async (status) => {
    const read = reader.read('todos los lunes de julio');

    httpTesting
      .expectOne('/api/date-interpretations')
      .flush({ error: { code: 'X', message: 'x' } }, { status, statusText: 'Error' });

    await expect(read).resolves.toEqual({ kind: 'failed' });
  });

  it('has failed when the API cannot be reached', async () => {
    const read = reader.read('todos los lunes de julio');

    httpTesting.expectOne('/api/date-interpretations').error(new ProgressEvent('error'));

    await expect(read).resolves.toEqual({ kind: 'failed' });
  });

  it('has failed when the answer is not what the contract says', async () => {
    const read = reader.read('todos los lunes de julio');

    httpTesting.expectOne('/api/date-interpretations').flush({ options: 'none' });

    await expect(read).resolves.toEqual({ kind: 'failed' });
  });

  it('has failed when no answer arrives in ten seconds, and gives the request up', async () => {
    vi.useFakeTimers();
    const read = reader.read('todos los lunes de julio');
    const request = httpTesting.expectOne('/api/date-interpretations');
    let answer: unknown;
    void read.then((result: unknown) => {
      answer = result;
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(answer).toBeUndefined();
    expect(request.cancelled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(answer).toEqual({ kind: 'failed' });
    expect(request.cancelled).toBe(true);
  });
});

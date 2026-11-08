import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import {
  ApplicationRef,
  createEnvironmentInjector,
  EnvironmentInjector,
  Injector,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { requestFailure, waiting, type RequestFailure } from './request-failure';

const limitedBody = { error: { code: 'RATE_LIMITED', message: 'Too many requests', details: [] } };

function limited(retryAfter: string | null, body: unknown = limitedBody): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 429,
    statusText: 'Too Many Requests',
    error: body,
    headers:
      retryAfter === null ? new HttpHeaders() : new HttpHeaders({ 'Retry-After': retryAfter }),
  });
}

describe('requestFailure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function follow(initial: unknown) {
    const error = signal<unknown>(initial);
    const failure = runInInjectionContext(TestBed.inject(Injector), () =>
      requestFailure(() => error()),
    );
    return { error, failure };
  }

  /** Lets the timers run and the effects that follow them. */
  function pass(ms: number): void {
    vi.advanceTimersByTime(ms);
    TestBed.inject(ApplicationRef).tick();
  }

  it('is null while there is no error', () => {
    expect(follow(undefined).failure()).toBeNull();
    expect(follow(null).failure()).toBeNull();
  });

  it('tells a failure that trying again may fix', () => {
    const serverError = new HttpErrorResponse({ status: 500, error: { error: {} } });

    expect(follow(serverError).failure()).toEqual({ kind: 'failed' });
    expect(follow(new Error('offline')).failure()).toEqual({ kind: 'failed' });
  });

  it('tells a rate limit with the seconds the API asks to wait', () => {
    expect(follow(limited('42')).failure()).toEqual({ kind: 'limited', seconds: 42 });
    expect(follow(limited('1')).failure()).toEqual({ kind: 'limited', seconds: 1 });
  });

  it('tells only a 429 as a rate limit, whatever another status carries', () => {
    const unavailable = new HttpErrorResponse({
      status: 503,
      error: limitedBody,
      headers: new HttpHeaders({ 'Retry-After': '42' }),
    });

    expect(follow(unavailable).failure()).toEqual({ kind: 'failed' });
  });

  it('counts the seconds down to 0 and stays there', () => {
    const { failure } = follow(limited('3'));
    TestBed.inject(ApplicationRef).tick();

    pass(999);
    expect(failure()).toEqual({ kind: 'limited', seconds: 3 });
    pass(1);
    expect(failure()).toEqual({ kind: 'limited', seconds: 2 });
    pass(2000);
    expect(failure()).toEqual({ kind: 'limited', seconds: 0 });
    expect(vi.getTimerCount()).toBe(0);
    pass(5000);
    expect(failure()).toEqual({ kind: 'limited', seconds: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('counts from the clock, so a tab whose timers were held back still shows the time left', () => {
    const { failure } = follow(limited('30'));
    TestBed.inject(ApplicationRef).tick();

    vi.setSystemTime(Date.now() + 20_000);
    pass(1000);

    expect(failure()).toEqual({ kind: 'limited', seconds: 9 });
  });

  it('starts again with a new error', () => {
    const { error, failure } = follow(limited('5'));
    TestBed.inject(ApplicationRef).tick();
    pass(5000);

    error.set(limited('20'));
    TestBed.inject(ApplicationRef).tick();
    expect(failure()).toEqual({ kind: 'limited', seconds: 20 });
    pass(1000);
    expect(failure()).toEqual({ kind: 'limited', seconds: 19 });

    error.set(null);
    TestBed.inject(ApplicationRef).tick();
    expect(failure()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('takes a 429 that breaks the contract as a plain failure', () => {
    expect(follow(limited(null)).failure()).toEqual({ kind: 'failed' });
    expect(follow(limited('0')).failure()).toEqual({ kind: 'failed' });
    expect(follow(limited('soon')).failure()).toEqual({ kind: 'failed' });
    expect(follow(limited('2.5')).failure()).toEqual({ kind: 'failed' });
    expect(follow(limited('10', { error: 'busy' })).failure()).toEqual({ kind: 'failed' });
  });

  it('stops counting when its injection context is destroyed', () => {
    const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    runInInjectionContext(injector, () => requestFailure(() => limited('30')));
    TestBed.inject(ApplicationRef).tick();
    expect(vi.getTimerCount()).toBe(1);

    injector.destroy();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('waiting', () => {
  it('holds while a rate limit still has seconds left', () => {
    const cases: [RequestFailure | null, boolean][] = [
      [null, false],
      [{ kind: 'failed' }, false],
      [{ kind: 'limited', seconds: 0 }, false],
      [{ kind: 'limited', seconds: 1 }, true],
    ];
    for (const [failure, expected] of cases) {
      expect(waiting(failure)).toBe(expected);
    }
  });
});

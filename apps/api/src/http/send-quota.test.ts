import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendQuota, type QuotaAnswer } from './send-quota.js';

const quota = () => sendQuota({ gapMs: 30_000, perHour: 3 });

/** Releases a granted send; fails the test if it was refused. */
function released(answer: QuotaAnswer): void {
  if (!answer.granted) throw new Error('The send was refused');
  answer.release();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-06-15T10:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sendQuota', () => {
  it('grants a first send, then refuses until the gap has passed', () => {
    const sends = quota();

    const first = sends.take('ana');
    vi.advanceTimersByTime(29_500);
    const early = sends.take('ana');
    vi.advanceTimersByTime(500);
    const later = sends.take('ana');

    expect(first.granted).toBe(true);
    expect(early).toEqual({ granted: false, retryAfterSeconds: 1 });
    expect(later.granted).toBe(true);
  });

  it('answers the whole seconds left, at least one', () => {
    const sends = quota();
    sends.take('ana');
    vi.advanceTimersByTime(10_200);

    expect(sends.take('ana')).toEqual({ granted: false, retryAfterSeconds: 20 });
  });

  it('grants at most the sends per hour in any hour, until the oldest is an hour old', () => {
    const sends = quota();
    for (let send = 0; send < 3; send += 1) {
      expect(sends.take('ana').granted).toBe(true);
      vi.advanceTimersByTime(30_000);
    }

    const fourth = sends.take('ana');
    vi.advanceTimersByTime(60 * 60_000 - 90_000 - 1);
    const almost = sends.take('ana');
    vi.advanceTimersByTime(1);
    const hourLater = sends.take('ana');

    expect(fourth).toEqual({ granted: false, retryAfterSeconds: 60 * 60 - 90 });
    expect(almost).toEqual({ granted: false, retryAfterSeconds: 1 });
    expect(hourLater.granted).toBe(true);
  });

  it('counts each key on its own', () => {
    const sends = quota();
    sends.take('ana');

    expect(sends.take('luis').granted).toBe(true);
  });

  it('grants a send again at once once the last one is released', () => {
    const sends = quota();
    released(sends.take('ana'));

    expect(sends.take('ana').granted).toBe(true);
  });

  it('takes nothing for a refused ask', () => {
    const sends = quota();
    const first = sends.take('ana');
    sends.take('ana');
    released(first);

    expect(sends.take('ana').granted).toBe(true);
  });

  it('frees only the released send’s place, never a later send’s', () => {
    const sends = quota();
    const slow = sends.take('ana');
    vi.advanceTimersByTime(31_000);
    sends.take('ana');
    released(slow);

    expect(sends.take('ana')).toEqual({ granted: false, retryAfterSeconds: 30 });
  });

  it('frees nothing more when a send is released twice', () => {
    const sends = quota();
    const first = sends.take('ana');
    released(first);
    sends.take('ana');
    released(first);

    expect(sends.take('ana').granted).toBe(false);
  });

  it('frees the released send’s place for the hourly count too', () => {
    const sends = quota();
    sends.take('ana');
    vi.advanceTimersByTime(30_000);
    const second = sends.take('ana');
    vi.advanceTimersByTime(30_000);
    sends.take('ana');
    released(second);
    vi.advanceTimersByTime(30_000);

    expect(sends.take('ana').granted).toBe(true);
  });

  it('keeps counting a key after an hour without any send of others', () => {
    const sends = quota();
    vi.advanceTimersByTime(2 * 60 * 60_000);
    sends.take('ana');

    expect(sends.take('ana').granted).toBe(false);
  });
});

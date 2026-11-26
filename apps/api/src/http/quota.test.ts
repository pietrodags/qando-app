import { beforeEach, describe, expect, it } from 'vitest';
import { movingClock, type MovingClock } from '../test/moving-clock.js';
import { quota, type QuotaAnswer } from './quota.js';

/** The clock the quota reads: only the test moves it, and the system's clock says another time. */
let clock: MovingClock;

const codes = () => quota({ gapMs: 30_000, limit: 3, per: 'hour' }, clock.now);

/** Releases a granted send; fails the test if it was refused. */
function released(answer: QuotaAnswer): void {
  if (!answer.granted) throw new Error('The send was refused');
  answer.release();
}

beforeEach(() => {
  clock = movingClock();
});

describe('quota', () => {
  it('grants a first send, then refuses until the gap has passed', () => {
    const sends = codes();

    const first = sends.take('ana');
    clock.advance(29_500);
    const early = sends.take('ana');
    clock.advance(500);
    const later = sends.take('ana');

    expect(first.granted).toBe(true);
    expect(early).toEqual({ granted: false, retryAfterSeconds: 1 });
    expect(later.granted).toBe(true);
  });

  it('answers the whole seconds left, at least one', () => {
    const sends = codes();
    sends.take('ana');
    clock.advance(10_200);

    expect(sends.take('ana')).toEqual({ granted: false, retryAfterSeconds: 20 });
  });

  it('grants at most the sends per hour in any hour, until the oldest is an hour old', () => {
    const sends = codes();
    for (let send = 0; send < 3; send += 1) {
      expect(sends.take('ana').granted).toBe(true);
      clock.advance(30_000);
    }

    const fourth = sends.take('ana');
    clock.advance(60 * 60_000 - 90_000 - 1);
    const almost = sends.take('ana');
    clock.advance(1);
    const hourLater = sends.take('ana');

    expect(fourth).toEqual({ granted: false, retryAfterSeconds: 60 * 60 - 90 });
    expect(almost).toEqual({ granted: false, retryAfterSeconds: 1 });
    expect(hourLater.granted).toBe(true);
  });

  it('counts in any minute when asked to: the next one once the oldest is a minute old', () => {
    const calls = quota({ gapMs: 0, limit: 60, per: 'minute' }, clock.now);
    for (let call = 0; call < 60; call += 1) {
      expect(calls.take('ana').granted).toBe(true);
      clock.advance(500);
    }

    // Half a minute has passed since the first call.
    const next = calls.take('ana');
    clock.advance(29_999);
    const almost = calls.take('ana');
    clock.advance(1);
    const minuteLater = calls.take('ana');

    expect(next).toEqual({ granted: false, retryAfterSeconds: 30 });
    expect(almost).toEqual({ granted: false, retryAfterSeconds: 1 });
    expect(minuteLater.granted).toBe(true);
  });

  it('counts each key on its own', () => {
    const sends = codes();
    sends.take('ana');

    expect(sends.take('luis').granted).toBe(true);
  });

  it('grants a send again at once once the last one is released', () => {
    const sends = codes();
    released(sends.take('ana'));

    expect(sends.take('ana').granted).toBe(true);
  });

  it('takes nothing for a refused ask', () => {
    const sends = codes();
    const first = sends.take('ana');
    sends.take('ana');
    released(first);

    expect(sends.take('ana').granted).toBe(true);
  });

  it('frees only the released send’s place, never a later send’s', () => {
    const sends = codes();
    const slow = sends.take('ana');
    clock.advance(31_000);
    sends.take('ana');
    released(slow);

    expect(sends.take('ana')).toEqual({ granted: false, retryAfterSeconds: 30 });
  });

  it('frees nothing more when a send is released twice', () => {
    const sends = codes();
    const first = sends.take('ana');
    released(first);
    sends.take('ana');
    released(first);

    expect(sends.take('ana').granted).toBe(false);
  });

  it('frees the released send’s place for the hourly count too', () => {
    const sends = codes();
    sends.take('ana');
    clock.advance(30_000);
    const second = sends.take('ana');
    clock.advance(30_000);
    sends.take('ana');
    released(second);
    clock.advance(30_000);

    expect(sends.take('ana').granted).toBe(true);
  });

  it('keeps counting a key after an hour without any send of others', () => {
    const sends = codes();
    clock.advance(2 * 60 * 60_000);
    sends.take('ana');

    expect(sends.take('ana').granted).toBe(false);
  });
});

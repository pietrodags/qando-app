import { describe, expect, it } from 'vitest';
import { currentState, type StoredEventState } from './event-state.js';

// "Cena de verano" closes at the end of 1 July in Madrid (UTC+2 in summer).
const closesAt = new Date('2026-07-01T21:59:59.999Z');
const beforeClosing = new Date('2026-07-01T21:59:59.998Z');

function stored(state: StoredEventState['state']): StoredEventState {
  return { state, closesAt };
}

describe('currentState', () => {
  it('is open before the closing instant', () => {
    expect(currentState(stored('open'), beforeClosing)).toBe('open');
  });

  it('is closed from the closing instant on, even if nobody closed it', () => {
    expect(currentState(stored('open'), closesAt)).toBe('closed');
    expect(currentState(stored('open'), new Date('2026-07-02T08:00:00Z'))).toBe('closed');
  });

  it('stays closed when the organizer closed voting early', () => {
    expect(currentState(stored('closed'), beforeClosing)).toBe('closed');
  });

  it('stays confirmed before and after the closing instant', () => {
    expect(currentState(stored('confirmed'), beforeClosing)).toBe('confirmed');
    expect(currentState(stored('confirmed'), closesAt)).toBe('confirmed');
  });
});

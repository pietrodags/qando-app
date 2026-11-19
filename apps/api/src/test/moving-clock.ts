/** A clock a test moves by hand, whatever the system's clock says meanwhile. */
export interface MovingClock {
  /** The clock's time, for the code under test. */
  readonly now: () => Date;
  /** Moves the clock forward. */
  advance(ms: number): void;
}

export function movingClock(start = new Date('2026-06-15T08:00:00Z')): MovingClock {
  let time = start.getTime();
  return {
    now: () => new Date(time),
    advance: (ms) => {
      time += ms;
    },
  };
}

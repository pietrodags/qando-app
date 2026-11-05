// The state of an event as people see it. Voting closes at `closesAt` (the deadline's last instant
// in the event's time zone) whether or not anything updated the stored state, so every reader and
// every vote check goes through `currentState` instead of the stored value.

export type EventState = 'open' | 'closed' | 'confirmed';

/** What is stored about an event's lifecycle. */
export interface StoredEventState {
  readonly state: EventState;
  readonly closesAt: Date;
}

/** The event's state at `now`: an open event whose closing instant has come is closed. */
export function currentState(event: StoredEventState, now: Date): EventState {
  if (event.state === 'open' && now.getTime() >= event.closesAt.getTime()) return 'closed';
  return event.state;
}

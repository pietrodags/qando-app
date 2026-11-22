import {
  currentState,
  localDate,
  validateOptions,
  type OptionProblem,
  type ProposedOption,
} from '@qando/domain';
import { changeManagedEvent } from './change-managed-event.js';
import type { ManagedEvents, ManagementCredentials } from './managed-events.js';
import type { ManagedEventReading } from './read-managed-event.js';

/** The options an organizer sends to replace an event's, and the ones the editor started from. */
export interface OptionsReplacement {
  readonly options: readonly ProposedOption[];
  /** The IDs of the options the editor showed when it opened, in any order. */
  readonly replacesOptionIds: readonly string[];
}

/**
 * What replacing the options amounts to: the event as it is now, or why nothing changed; besides
 * the refusals of every management request, the first that applies: a date is confirmed, voting
 * is closed, someone has voted, the editor started from other options, or the options break a
 * rule.
 */
export type OptionsChange =
  | ManagedEventReading
  | { readonly status: 'already-confirmed' }
  | { readonly status: 'voting-closed' }
  | { readonly status: 'votes-exist' }
  | { readonly status: 'options-changed' }
  | { readonly status: 'options-refused'; readonly problems: readonly OptionProblem[] };

/**
 * The use case behind "Editar opciones", free of HTTP like `readManagedEvent`: the whole list is
 * replaced, with the rules of a new event's options, today being read in the event's time zone.
 * Only while voting is open and nobody has voted; a closed event is reopened first by moving its
 * deadline. A save from an outdated list (another tab saved first) never undoes the other: the
 * options it started from must be the event's. Checked and stored with the event locked, so a
 * vote being stored finishes first and refuses the save, and a vote sent meanwhile waits and then
 * finds the new options.
 */
export async function replaceOptions(
  managedEvents: ManagedEvents,
  participationId: string,
  credentials: ManagementCredentials,
  { options, replacesOptionIds }: OptionsReplacement,
  now: () => Date,
): Promise<OptionsChange> {
  return changeManagedEvent(
    managedEvents,
    participationId,
    credentials,
    now,
    async (event, change, organizer) => {
      // Read the clock only now: the request may have waited for the lock.
      const at = now();
      const state = currentState(event, at);
      if (state === 'confirmed') return { status: 'already-confirmed' } as const;
      if (state === 'closed') return { status: 'voting-closed' } as const;
      if (event.voted) return { status: 'votes-exist' } as const;
      if (!sameOptions(event.optionIds, replacesOptionIds)) {
        return { status: 'options-changed' } as const;
      }
      const checked = validateOptions(options, localDate(at, event.timeZone));
      if (!checked.ok) return { status: 'options-refused', problems: checked.problems } as const;
      await change.replaceOptions(organizer, checked.options);
      return undefined;
    },
  );
}

/** Whether the IDs are the event's options, each once, in any order and either letter case. */
function sameOptions(current: readonly string[], sent: readonly string[]): boolean {
  // The stored IDs are lower case.
  const sorted = sent.map((id) => id.toLowerCase()).sort();
  const stored = current.toSorted();
  return sorted.length === stored.length && sorted.every((id, index) => id === stored[index]);
}

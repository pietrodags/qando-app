// An event as its organizer sends it to be created, checked whole: the wizard's steps in their
// order, then what only the last step asks (the deadline and the note). The API refuses what the
// wizard would not let through, and stores the event in the form this check answers.
import { countCharacters } from './characters.js';
import { detailsProblems, type DetailsProblem } from './event-details.js';
import { closingInstant } from './event-state.js';
import { localDate } from './local-date.js';
import { validateOptions, type OptionProblem, type ProposedOption } from './options.js';

/** The longest note, in characters as people see them, once trimmed. */
export const NOTE_MAX_LENGTH = 150;

/** A new event as its organizer sends it. */
export interface NewEventInput {
  readonly organizerName: string;
  readonly title: string;
  /** Optional: left out, empty or only spaces is no note. */
  readonly note?: string | undefined;
  /** IANA name the runtime knows, e.g. `Europe/Madrid`: today and the deadline are read in it. */
  readonly timeZone: string;
  /** Calendar date, `YYYY-MM-DD`: voting closes at its end in `timeZone`. */
  readonly deadline: string;
  readonly anonymous: boolean;
  readonly options: readonly ProposedOption[];
}

/** A new event that can be stored as it is. */
export interface NewEvent {
  /** Trimmed, like the title and the note. */
  readonly organizerName: string;
  readonly title: string;
  readonly note: string | null;
  readonly timeZone: string;
  readonly deadline: string;
  /** When voting closes: the deadline's last instant in `timeZone` (`closingInstant`). */
  readonly closesAt: Date;
  readonly anonymous: boolean;
  /** In the order every page and email shows them (`validateOptions`). */
  readonly options: readonly ProposedOption[];
}

export type NewEventProblem =
  | DetailsProblem
  | OptionProblem
  /** A deadline before today in the event's time zone. */
  | { readonly code: 'DEADLINE_PAST' }
  | { readonly code: 'NOTE_TOO_LONG' };

export type NewEventValidation =
  | { readonly ok: true; readonly event: NewEvent }
  | { readonly ok: false; readonly problems: readonly NewEventProblem[] };

/**
 * Checks a new event sent at `now` and lists every problem at once, in the order of the wizard's
 * steps: the name and the title, the options, the deadline, the note. Today is taken in the
 * event's time zone, for the options as for the deadline: a deadline of today closes at its end.
 */
export function validateNewEvent(input: NewEventInput, now: Date): NewEventValidation {
  const today = localDate(now, input.timeZone);
  const options = validateOptions(input.options, today);
  const note = input.note?.trim() ?? '';
  const problems: NewEventProblem[] = [...detailsProblems(input)];
  if (!options.ok) problems.push(...options.problems);
  if (input.deadline < today) problems.push({ code: 'DEADLINE_PAST' });
  if (countCharacters(note) > NOTE_MAX_LENGTH) problems.push({ code: 'NOTE_TOO_LONG' });
  if (!options.ok || problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    event: {
      organizerName: input.organizerName.trim(),
      title: input.title.trim(),
      note: note === '' ? null : note,
      timeZone: input.timeZone,
      deadline: input.deadline,
      closesAt: closingInstant(input.deadline, input.timeZone),
      anonymous: input.anonymous,
      options: options.options,
    },
  };
}

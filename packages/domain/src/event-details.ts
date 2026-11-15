// What the organizer tells first about an event: their name and its title. The wizard's first
// step and the API check them with the same rules, so both agree on, for example, " A ".
import { countCharacters } from './characters.js';

export const ORGANIZER_NAME_MIN_LENGTH = 2;
export const ORGANIZER_NAME_MAX_LENGTH = 30;
export const EVENT_TITLE_MAX_LENGTH = 50;

/** The organizer's name and the event's title, as typed. */
export interface EventDetails {
  readonly organizerName: string;
  readonly title: string;
}

export type DetailsProblem =
  | { readonly code: 'NAME_MISSING' }
  | { readonly code: 'NAME_TOO_SHORT' }
  | { readonly code: 'NAME_TOO_LONG' }
  | { readonly code: 'TITLE_MISSING' }
  | { readonly code: 'TITLE_TOO_LONG' };

/**
 * Every problem of the name and the title, the name's first (the order of the step); none when an
 * event can be created with them. Each is measured once trimmed, in characters as people see them:
 * only spaces is missing, one character is a name too short.
 */
export function detailsProblems(details: EventDetails): readonly DetailsProblem[] {
  const name = countCharacters(details.organizerName.trim());
  const title = countCharacters(details.title.trim());
  const problems: DetailsProblem[] = [];
  if (name === 0) problems.push({ code: 'NAME_MISSING' });
  else if (name < ORGANIZER_NAME_MIN_LENGTH) problems.push({ code: 'NAME_TOO_SHORT' });
  else if (name > ORGANIZER_NAME_MAX_LENGTH) problems.push({ code: 'NAME_TOO_LONG' });
  if (title === 0) problems.push({ code: 'TITLE_MISSING' });
  else if (title > EVENT_TITLE_MAX_LENGTH) problems.push({ code: 'TITLE_TOO_LONG' });
  return problems;
}

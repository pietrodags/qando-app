// What the organizer tells of an event besides its dates: their name and its title. The wizard
// and the API check them with the same rules, so both agree on, for example, " A ".
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
  return [organizerNameProblem(details.organizerName), titleProblem(details.title)].filter(
    (problem) => problem !== undefined,
  );
}

/**
 * The problem of an organizer's name, by the rules of `detailsProblems`; none when an event can be
 * created with it. Also the rule of the name a new account takes from the wizard.
 */
export function organizerNameProblem(
  organizerName: string,
): Extract<DetailsProblem, { code: `NAME_${string}` }> | undefined {
  const name = countCharacters(organizerName.trim());
  if (name === 0) return { code: 'NAME_MISSING' };
  if (name < ORGANIZER_NAME_MIN_LENGTH) return { code: 'NAME_TOO_SHORT' };
  if (name > ORGANIZER_NAME_MAX_LENGTH) return { code: 'NAME_TOO_LONG' };
  return undefined;
}

/**
 * The problem of an event's title, by the rules of `detailsProblems`; none when an event can be
 * created with it. Also the rule of the wizard's first step, which asks the title alone.
 */
export function titleProblem(
  title: string,
): Extract<DetailsProblem, { code: `TITLE_${string}` }> | undefined {
  const length = countCharacters(title.trim());
  if (length === 0) return { code: 'TITLE_MISSING' };
  if (length > EVENT_TITLE_MAX_LENGTH) return { code: 'TITLE_TOO_LONG' };
  return undefined;
}

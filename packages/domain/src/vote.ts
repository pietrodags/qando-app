// What makes a vote valid. The API checks every vote it receives with it, and the voting page uses
// the same rules, so both agree on, for example, whether "  A  " is a valid name.

export type VoteState = 'available' | 'preferred' | 'unavailable';

/** The parts of an event a vote is checked against. */
export interface VotingEvent {
  readonly anonymous: boolean;
  readonly optionIds: readonly string[];
}

/** A vote as the participant sent it: the name (named events only) and one state per option. */
export interface VoteInput {
  readonly name?: string | undefined;
  readonly votes: Readonly<Record<string, VoteState>>;
}

/** A vote ready to store: the name trimmed, or `null` on an anonymous event. */
export interface ValidVote {
  readonly name: string | null;
  readonly votes: Readonly<Record<string, VoteState>>;
}

export type VoteProblem =
  | { readonly code: 'NAME_TOO_SHORT' }
  | { readonly code: 'NAME_TOO_LONG' }
  | { readonly code: 'NAME_NOT_ALLOWED' }
  | { readonly code: 'OPTION_MISSING'; readonly optionId: string }
  | { readonly code: 'OPTION_UNKNOWN'; readonly optionId: string }
  | { readonly code: 'SEVERAL_PREFERRED'; readonly optionIds: readonly string[] };

export type VoteValidation =
  | { readonly ok: true; readonly vote: ValidVote }
  | { readonly ok: false; readonly problems: readonly VoteProblem[] };

export const VOTER_NAME_MIN_LENGTH = 2;
export const VOTER_NAME_MAX_LENGTH = 30;

/**
 * Checks a vote against its event and lists every problem at once: the name, then the options
 * (each option of the event answered exactly once, no other option), then at most one preferred.
 * A missing option is a problem, never a default state.
 */
export function validateVote(event: VotingEvent, input: VoteInput): VoteValidation {
  const name = event.anonymous ? null : (input.name ?? '').trim();
  const problems = [
    ...nameProblems(name, input.name),
    ...optionProblems(event.optionIds, input.votes),
  ];
  return problems.length === 0
    ? { ok: true, vote: { name, votes: input.votes } }
    : { ok: false, problems };
}

/** Whether a named event accepts this name: 2 to 30 characters once trimmed. */
export function isValidVoterName(name: string): boolean {
  return nameProblems(name.trim(), name).length === 0;
}

/**
 * Whether a typed name is the voter of a stored vote: the same letters and accents, whatever the
 * case and the spaces around or between the words. Only ever applied to a vote whose token the
 * client already holds: a name alone never identifies a voter.
 */
export function sameVoterName(stored: string, typed: string): boolean {
  return comparable(stored) === comparable(typed);
}

function comparable(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** `name` is the trimmed name, or `null` on an anonymous event, where `sent` must be absent. */
function nameProblems(name: string | null, sent: string | undefined): VoteProblem[] {
  if (name === null) return sent === undefined ? [] : [{ code: 'NAME_NOT_ALLOWED' }];
  const length = countCharacters(name);
  if (length < VOTER_NAME_MIN_LENGTH) return [{ code: 'NAME_TOO_SHORT' }];
  if (length > VOTER_NAME_MAX_LENGTH) return [{ code: 'NAME_TOO_LONG' }];
  return [];
}

// Splits text into graphemes, the segmenter's default granularity.
const characters = new Intl.Segmenter();

/** Characters as the participant sees them: "Á" with a combining accent or "👨‍👩‍👧" count as one. */
function countCharacters(text: string): number {
  return Array.from(characters.segment(text)).length;
}

function optionProblems(
  optionIds: readonly string[],
  votes: Readonly<Record<string, VoteState>>,
): VoteProblem[] {
  const answered = Object.keys(votes);
  const offered = new Set(optionIds);
  const problems: VoteProblem[] = [
    ...optionIds
      .filter((optionId) => !Object.hasOwn(votes, optionId))
      .map((optionId) => ({ code: 'OPTION_MISSING' as const, optionId })),
    ...answered
      .filter((optionId) => !offered.has(optionId))
      .map((optionId) => ({ code: 'OPTION_UNKNOWN' as const, optionId })),
  ];
  const preferred = answered.filter((optionId) => votes[optionId] === 'preferred');
  if (preferred.length > 1) problems.push({ code: 'SEVERAL_PREFERRED', optionIds: preferred });
  return problems;
}

/**
 * What a participant's answers amount to, told before the vote is sent: an option preferred,
 * some option available but none preferred (the participant may still want to choose one), or
 * no option possible.
 */
export type VoteSummary = 'preferred' | 'noPreferred' | 'nonePossible';

export function summaryOf(votes: Readonly<Record<string, VoteState>>): VoteSummary {
  const states = Object.values(votes);
  if (states.includes('preferred')) return 'preferred';
  return states.includes('available') ? 'noPreferred' : 'nonePossible';
}

import type { VoteState } from '@qando/domain';

/** The participant's answer to each option, by option ID, while the vote is being made. */
export type Answers = Readonly<Record<string, VoteState>>;

/** Where every vote starts: each option available. */
export function allAvailable(optionIds: readonly string[]): Answers {
  return Object.fromEntries(optionIds.map((id) => [id, 'available' as const]));
}

/**
 * Where an edit starts: the stored answer of each option, available for an option it lacks
 * (added since); answers to options the event no longer has are left out.
 */
export function resumed(
  optionIds: readonly string[],
  stored: Readonly<Record<string, VoteState>>,
): Answers {
  return Object.fromEntries(optionIds.map((id) => [id, stored[id] ?? 'available']));
}

/** A tap: available ↔ unavailable; the preferred option goes back to available. */
export function toggled(answers: Answers, optionId: string): Answers {
  return {
    ...answers,
    [optionId]: answers[optionId] === 'available' ? 'unavailable' : 'available',
  };
}

/**
 * A long-press or double-click: the option becomes the one preferred, and the previous preferred
 * goes back to available (at most one); on the preferred option itself it goes back to available.
 */
export function withPreferred(answers: Answers, optionId: string): Answers {
  if (answers[optionId] === 'preferred') return { ...answers, [optionId]: 'available' };
  const demoted = Object.entries(answers).map(([id, state]) => [
    id,
    state === 'preferred' ? 'available' : state,
  ]);
  return { ...Object.fromEntries(demoted), [optionId]: 'preferred' } as Answers;
}

/**
 * In step 2 of an event with times, a day stands for all of its options and is never preferred
 * itself: unavailable when every one of them is, available otherwise.
 */
export function dayState(
  answers: Answers,
  optionIds: readonly string[],
): Exclude<VoteState, 'preferred'> {
  return optionIds.every((id) => answers[id] === 'unavailable') ? 'unavailable' : 'available';
}

/**
 * A tap on a day of an event with times: every option of the day unavailable, or, when the day
 * was unavailable, every one of them available again.
 */
export function dayToggled(answers: Answers, optionIds: readonly string[]): Answers {
  const state = dayState(answers, optionIds) === 'unavailable' ? 'available' : 'unavailable';
  return { ...answers, ...Object.fromEntries(optionIds.map((id) => [id, state])) };
}

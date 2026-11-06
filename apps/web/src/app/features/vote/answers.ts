import type { VoteState } from '@qando/domain';

/** The participant's answer to each option, by option ID, while the vote is being made. */
export type Answers = Readonly<Record<string, VoteState>>;

/** Where every vote starts: each option available. */
export function allAvailable(optionIds: readonly string[]): Answers {
  return Object.fromEntries(optionIds.map((id) => [id, 'available' as const]));
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

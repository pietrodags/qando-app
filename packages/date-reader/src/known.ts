/**
 * A value the code counts on: what the grammar has just checked is there. A missing one is a
 * programming error, thrown as such, never an answer to a phrase.
 */
export function known<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new TypeError('The date reader counted on a value that is missing');
  }
  return value;
}

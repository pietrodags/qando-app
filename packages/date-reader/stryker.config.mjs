import { readFileSync } from 'node:fs';

import { strykerConfig } from '../../stryker.base.mjs';

const files = ['src/**/*.ts'];
// The vocabulary files are data (the words of each language), not logic.
const notMutated = ['!src/**/*.test.ts', '!src/vocabulary/{es,ca,en,shared}.ts'];

// CI runs the package's mutation testing in three parallel parts (`STRYKER_PART=1` … `3`), each
// held to the threshold on its own; without `STRYKER_PART` every file is mutated, as locally.
// The phrase reader holds two thirds of the package's mutants, nearly all of them inside `read`,
// so it is split in two by lines: part 1 takes it up to the declaration below, part 2 from that
// declaration to the end of the file, and part 3 takes every other file, new files included.
// The line is looked up at each run, so the two halves follow the file as it grows. StrykerJS
// mutates only what lies wholly inside a range: the declaration must be a function declared
// directly in `read`, so that only the body of `read` as a whole spans both halves; the one
// mutant that empties it, which any test kills, belongs to no part. To rebalance when one
// half's job grows much slower than the other, name another such function here; CI starts each
// part's incremental report afresh whenever this file changes.
const reader = 'src/phrase-reader.ts';
const secondHalfStarts = '  function pattern(';

/** The line of the phrase reader, counted from 1, where its second half starts. */
function secondHalfLine() {
  const lines = readFileSync(new URL(reader, import.meta.url), 'utf8').split('\n');
  const found = lines.flatMap((line, index) => (line.startsWith(secondHalfStarts) ? [index] : []));
  if (found.length !== 1) {
    throw new Error(
      `${reader} must have exactly one line starting with "${secondHalfStarts}", not ${found.length}`,
    );
  }
  return found[0] + 1;
}

/**
 * The `mutate` patterns of one part.
 * @param {string | undefined} part
 */
function mutateFor(part) {
  switch (part) {
    case undefined:
      return [...files, ...notMutated];
    case '1':
      return [`${reader}:1-${secondHalfLine() - 1}`];
    case '2':
      // A range may end past the last line of the file.
      return [`${reader}:${secondHalfLine()}-${Number.MAX_SAFE_INTEGER}`];
    case '3':
      return [...files, ...notMutated, `!${reader}`];
    default:
      throw new Error(`STRYKER_PART must be 1 to 3, not "${part}"`);
  }
}

const part = process.env.STRYKER_PART;

export default {
  ...strykerConfig({ breakAt: 85, mutate: mutateFor(part) }),
  // A report keeps the results of what it no longer mutates, so each part keeps its own: a
  // part run after a full one is scored on its own mutants only.
  ...(part === undefined
    ? {}
    : { incrementalFile: `reports/stryker-incremental-part-${part}.json` }),
};

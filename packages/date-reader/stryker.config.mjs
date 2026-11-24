import { readFileSync } from 'node:fs';

import { strykerConfig } from '../../stryker.base.mjs';

const files = ['src/**/*.ts'];
// The vocabulary files are data (the words of each language), not logic.
const notMutated = ['!src/**/*.test.ts', '!src/vocabulary/{es,ca,en,shared}.ts'];

// CI runs the package's mutation testing in five parallel parts (`STRYKER_PART=1` … `5`), each
// held to the threshold on its own; without `STRYKER_PART` every file is mutated, as locally.
// The phrase reader holds half of the package's mutants, nearly all of them inside `read`,
// so it is split in two by lines: part 1 takes it up to the declaration below, part 2 from that
// declaration to the end of the file. The line is looked up at each run, so the two halves
// follow the file as it grows. StrykerJS mutates only what lies wholly inside a range: the
// declaration must be a function declared directly in `read`, so that only the body of `read`
// as a whole spans both halves; the one mutant that empties it, which any test kills, belongs
// to no part. Of the other files, the tokenizer and the calendar run against nearly every test
// of the package (every phrase is tokenized and its days counted), so they take a part each, 3
// and 4, and part 5 takes every other file, new files included. To rebalance when a part's job
// nears 20 minutes of the 30 it is held to (the same run has taken half as long again on a
// slower runner), name another such function here or give a file a part of its own; CI starts
// each part's incremental report afresh whenever this file changes, and refuses to run when its
// parts are not as many as the ones here.
const parts = 5;
const reader = 'src/phrase-reader.ts';
const secondHalfStarts = '  function pattern(';
const tokenizer = 'src/tokenizer.ts';
const calendar = 'src/calendar.ts';

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
 * The `mutate` patterns of one part. Refuses a part that is not one of them, and a run whose
 * number of parts is another.
 * @param {string | undefined} part
 */
function mutateFor(part) {
  if (part === undefined) {
    return [...files, ...notMutated];
  }
  // CI says how many parts it runs: with fewer than the ones here, some files would be left
  // without mutation testing and nothing would fail.
  const running = process.env.STRYKER_PARTS;
  if (running !== undefined && Number(running) !== parts) {
    throw new Error(`The date reader has ${parts} parts and STRYKER_PARTS says ${running} are run`);
  }
  switch (part) {
    case '1':
      return [`${reader}:1-${secondHalfLine() - 1}`];
    case '2':
      // A range may end past the last line of the file.
      return [`${reader}:${secondHalfLine()}-${Number.MAX_SAFE_INTEGER}`];
    case '3':
      return [tokenizer];
    case '4':
      return [calendar];
    case '5':
      return [...files, ...notMutated, `!${reader}`, `!${tokenizer}`, `!${calendar}`];
    default:
      throw new Error(`STRYKER_PART must be 1 to ${parts}, not "${part}"`);
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

import { strykerConfig } from '../../stryker.base.mjs';

const files = ['src/**/*.ts'];
// The development-only pages and the tests' helpers are tools, not product: left out of the
// build and of the score.
const notMutated = ['!src/**/*.spec.ts', '!src/main.ts', '!src/app/dev/**', '!src/test/**'];

// CI runs the web's mutation testing in four parallel parts (`STRYKER_PART=1` … `4`), each held
// to the threshold on its own; without `STRYKER_PART` every file is mutated, as locally.
// The first three parts list their files; the fourth takes everything else, so every file is
// in exactly one part, new folders included. They are balanced by the test runs of the last
// full report (`reports/mutation/mutation.json`: the sum of `testsCompleted` per file), not by
// file or mutant count. To rebalance when a part's job grows much slower than the others, move
// whole folders or files between these lists, keeping hundreds of mutants in every part.
const listedParts = [
  // The day and time pickers of the voting page.
  [
    'src/app/features/vote/{vote-days,vote-times,calendar-months,time-pages,hour-preview,display}.ts',
  ],
  // The rest of the voting page, the management and create pages, the token checks.
  ['src/app/features/{vote,manage,create}/**/*.ts', 'src/styles/**/*.ts'],
  // The shared components and the core services.
  ['src/app/{shared,core}/**/*.ts'],
];

/**
 * The `mutate` patterns of one part. StrykerJS applies them in order, so each part takes its own
 * files minus those of the parts before it, and the last one takes all files minus every list.
 * @param {string | undefined} part
 */
function mutateFor(part) {
  if (part === undefined) {
    return [...files, ...notMutated];
  }
  const index = Number(part) - 1;
  if (!Number.isInteger(index) || index < 0 || index > listedParts.length) {
    throw new Error(`STRYKER_PART must be 1 to ${listedParts.length + 1}, not "${part}"`);
  }
  const own = index < listedParts.length ? listedParts[index] : files;
  const taken = listedParts.slice(0, index).flat();
  return [...own, ...taken.map((pattern) => `!${pattern}`), ...notMutated];
}

const config = strykerConfig({
  breakAt: 70,
  mutate: mutateFor(process.env.STRYKER_PART),
  vitestConfig: 'vitest-stryker.config.mts',
});

export default {
  ...config,
  // The compiled specs are bundles, so Vitest cannot tell which tests import a mutated file.
  vitest: { ...config.vitest, related: false },
  buildCommand: 'ng test --watch=false --dump-virtual-files',
};

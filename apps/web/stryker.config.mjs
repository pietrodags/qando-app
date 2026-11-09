import { strykerConfig } from '../../stryker.base.mjs';

const files = ['src/**/*.ts'];
// The development-only pages and the tests' helpers are tools, not product: left out of the
// build and of the score.
const notMutated = ['!src/**/*.spec.ts', '!src/main.ts', '!src/app/dev/**', '!src/test/**'];

// CI runs the web's mutation testing in four parallel parts (`STRYKER_PART=1` … `4`), each held
// to the threshold on its own; without `STRYKER_PART` every file is mutated, as locally.
// The first three parts list their files; the fourth takes everything else, so every file is
// in exactly one part, new files included. They are balanced by time, measured in CI: a file
// costs about its mutants plus the time of the tests that run against them (the voting page's
// component tests are the slowest). To rebalance when one part's job grows much slower than
// the others, move files or folders between these lists, keeping hundreds of mutants in every
// part; CI starts each part's incremental report afresh whenever this file changes.
const vote = 'src/app/features/vote';
const listedParts = [
  // The day and time pickers of the voting page, and the list of answers.
  [`${vote}/{vote-days,vote-times,hour-preview,display,my-votes}.ts`],
  // The voting page itself, its calendar, its time pages and its confirmation.
  [
    `${vote}/{vote-page,calendar-months,time-pages,answers,vote-confirm,vote-thanks,my-vote-link}.ts`,
  ],
  // The shared components, the core services and the voting page's welcome.
  ['src/app/{shared,core}/**/*.ts', `${vote}/vote-welcome.ts`],
  // The fourth part: results, management, create, the token checks, routes and the rest.
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

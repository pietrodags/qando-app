import { strykerConfig } from '../../stryker.base.mjs';

const files = ['src/**/*.ts'];
// The development-only pages and the tests' helpers are tools, not product: left out of the
// build and of the score. The waves' drawing is data (the points of each ribbon), not logic,
// and is built when its module loads, so each of its mutants would run the whole suite.
const notMutated = [
  '!src/**/*.spec.ts',
  '!src/main.ts',
  '!src/app/dev/**',
  '!src/test/**',
  '!src/app/core/layout/waves-background/wave-compositions.ts',
];

// CI runs the web's mutation testing in ten parallel parts (`STRYKER_PART=1` … `10`), each held
// to the threshold on its own; without `STRYKER_PART` every file is mutated, as locally.
// The first nine parts list their files; the tenth takes everything else, so every file is
// in exactly one part, new files included. They are balanced by time, measured in CI: a file
// costs about its mutants plus the time of the tests that run against them (each mutant's
// `duration` in the part's `mutation.json`, attached to the run), so a component with slow
// tests weighs more than its mutants say; the estimate is rough, so read the jobs' times after
// a change. To rebalance when one part's job nears 20 minutes of the 30 it is held to, move
// files between these lists or add a list, keeping hundreds of mutants in every part; CI
// starts each part's incremental report afresh whenever this file changes, and refuses to run
// when its parts are not as many as the ones here.
const vote = 'src/app/features/vote';
const create = 'src/app/features/create';
const ui = 'src/app/shared/ui';
const listedParts = [
  // The day and time pickers of the voting page, and the list of answers.
  [`${vote}/{vote-days,vote-times,hour-preview,display,my-votes}.ts`],
  // The voting page itself, its calendar, its time pages and its confirmation.
  [
    `${vote}/{vote-page,calendar-months,time-pages,answers,vote-confirm,vote-thanks,my-vote-link}.ts`,
  ],
  // The shared components that fold, stack and page what does not fit on the screen, and the
  // presses held (a long press, a press that repeats), whose tests wait the longest.
  [`${ui}/{scroll-fold,step-stack,step-pager,screen-room,long-press,hold-repeat}.ts`],
  // The rest of the shared components, the core services and the voting page's welcome.
  ['src/app/{shared,core}/**/*.ts', `${vote}/vote-welcome.ts`],
  // The creation wizard's dates step, whose component has the most mutants after a column of
  // hours, and its trash.
  [`${create}/{wizard-dates,clear-dates}.ts`],
  // The calendar of the dates step: its grid, its drag and the dates chosen.
  [`${create}/{month-grid,day-drag,date-selection,days-from,today}.ts`],
  // A column of hours of the times step, the slowest file of the web, and its saved times.
  [`${create}/{hour-column,saved-pills}.ts`],
  // The rest of the times step and its summary.
  [
    `${create}/{wizard-times,wizard-summary,day-times,row-drag,time-columns,column-strip,time-questions,save-offer,option-counter}.ts`,
  ],
  // The rest of the creation wizard: the smart calendar, its details step, its last step, the
  // draft and its page.
  [`${create}/**/*.ts`],
  // The tenth part: results, management, sign-in, the token checks, routes and the rest.
];

/**
 * The `mutate` patterns of one part. StrykerJS applies them in order, so each part takes its own
 * files minus those of the parts before it, and the last one takes all files minus every list.
 * Refuses a part that is not one of them, and a run whose number of parts is another.
 * @param {string | undefined} part
 */
function mutateFor(part) {
  if (part === undefined) {
    return [...files, ...notMutated];
  }
  const parts = listedParts.length + 1;
  const index = Number(part) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= parts) {
    throw new Error(`STRYKER_PART must be 1 to ${parts}, not "${part}"`);
  }
  // CI says how many parts it runs: with fewer than the ones here, some files would be left
  // without mutation testing and nothing would fail.
  const running = process.env.STRYKER_PARTS;
  if (running !== undefined && Number(running) !== parts) {
    throw new Error(`The web has ${parts} parts and STRYKER_PARTS says ${running} are run`);
  }
  const own = index < listedParts.length ? listedParts[index] : files;
  const taken = listedParts.slice(0, index).flat();
  return [...own, ...taken.map((pattern) => `!${pattern}`), ...notMutated];
}

const part = process.env.STRYKER_PART;
const config = strykerConfig({
  breakAt: 70,
  mutate: mutateFor(part),
  vitestConfig: 'vitest-stryker.config.mts',
});

export default {
  ...config,
  // A report keeps the results of files it no longer mutates, so each part keeps its own: a
  // part run after a full one is scored on its own files only.
  ...(part === undefined
    ? {}
    : { incrementalFile: `reports/stryker-incremental-part-${part}.json` }),
  // The compiled specs are bundles, so Vitest cannot tell which tests import a mutated file.
  vitest: { ...config.vitest, related: false },
  buildCommand: 'ng test --watch=false --dump-virtual-files',
};

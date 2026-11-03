// Shared StrykerJS settings; each workspace has a `stryker.config.mjs` that extends them.
// Run with `npm run mutation` (all workspaces) or `npm run mutation --workspace <name>`.

/**
 * @param {{ breakAt: number, mutate: string[], vitestConfig?: string }} options
 * @returns {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export function strykerConfig({ breakAt, mutate, vitestConfig }) {
  return {
    testRunner: 'vitest',
    plugins: ['@stryker-mutator/vitest-runner'],
    vitest: vitestConfig ? { configFile: vitestConfig } : {},
    mutate,
    // The score that fails the run; `high` and `low` only colour the report.
    thresholds: { high: 90, low: breakAt, break: breakAt },
    // Only changed code and its tests are mutated again; the rest is reused from the last run.
    incremental: true,
    incrementalFile: 'reports/stryker-incremental.json',
    reporters: ['clear-text', 'progress', 'html', 'json'],
    htmlReporter: { fileName: 'reports/mutation/mutation.html' },
    jsonReporter: { fileName: 'reports/mutation/mutation.json' },
    // A workspace with no code to mutate yet passes instead of failing.
    allowEmpty: true,
    tempDirName: '.stryker-tmp',
    cleanTempDir: 'always',
  };
}

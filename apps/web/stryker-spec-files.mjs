// The test runner of the web's mutation testing: StrykerJS's Vitest runner, with every test
// reported in the spec file it was written in instead of the compiled file Vitest runs.
//
// StrykerJS cannot drive `ng test`, so Vitest runs the specs `ng test --dump-virtual-files`
// compiles (see `vitest-stryker.config.mts`). An incremental run tells a test from the last run's
// by its file, its place in that file and its name, and diffs that file's code to find the tests
// that changed. The compiled files exist only in StrykerJS's working copy, so the report kept no
// code for them and the next run took every test for a new one: nearly every mutant ran again on
// every run. In its spec file, a test is new or changed only when that spec is.
//
// A test has no place in its spec (Vitest records none through the compiled file's source map),
// so it spans the whole file: any edit to a spec, its shared setup included, runs again every
// mutant its tests killed. Placing each test where it is written would rerun fewer, but an edit
// to the setup above a spec's first test, as most of the web's specs have, would change no test
// and the old results of their mutants would be reused. As in every workspace, an edit to the
// code a test runs (a template, a test helper, another component) runs again only the mutants of
// that file.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  commonTokens,
  declareFactoryPlugin,
  PluginKind,
  tokens,
} from '@stryker-mutator/api/plugin';
import { DryRunStatus } from '@stryker-mutator/api/test-runner';
import { strykerPlugins as vitestPlugins } from '@stryker-mutator/vitest-runner';

/** @typedef {import('@stryker-mutator/api/test-runner').TestResult} TestResult */

/**
 * Points each test at the spec file its compiled file was built from, without a place. The
 * compiled file's map (`<file>.map`) names that spec: its one `.spec.ts` source, relative to
 * `folder` as the Angular CLI writes it. A test is left as it was when its compiled file has no
 * map, the map names no single spec, or that spec is not in `folder`.
 * @param {TestResult[]} tests
 * @param {string} folder the web's folder
 * @returns {TestResult[]}
 */
export function inSpecFiles(tests, folder) {
  /** @type {Map<string, string | undefined>} */
  const specs = new Map();
  return tests.map((test) => {
    if (test.fileName === undefined) {
      return test;
    }
    if (!specs.has(test.fileName)) {
      specs.set(test.fileName, specOf(test.fileName, folder));
    }
    const spec = specs.get(test.fileName);
    if (spec === undefined) {
      return test;
    }
    // A place in the compiled file is not a place in the spec.
    const { startPosition: _place, ...rest } = test;
    return { ...rest, fileName: spec };
  });
}

/**
 * @param {string} compiled
 * @param {string} folder
 * @returns {string | undefined}
 */
function specOf(compiled, folder) {
  const mapFile = `${compiled}.map`;
  if (!existsSync(mapFile)) {
    return undefined;
  }
  /** @type {{ sources: string[] }} */
  const { sources } = JSON.parse(readFileSync(mapFile, 'utf8'));
  const specs = sources.filter((source) => source.endsWith('.spec.ts'));
  if (specs.length !== 1) {
    return undefined;
  }
  const spec = path.resolve(folder, specs[0]);
  return existsSync(spec) ? spec : undefined;
}

const [vitest] = vitestPlugins;

/** @param {import('@stryker-mutator/api/plugin').Injector} injector */
function createRunner(injector) {
  const runner = vitest.factory(injector);
  /** @type {import('@stryker-mutator/api/test-runner').TestRunner} */
  const inSpecs = {
    capabilities: () => runner.capabilities(),
    init: () => runner.init(),
    async dryRun(options) {
      const result = await runner.dryRun(options);
      // The test runner works in StrykerJS's working copy of the web's folder.
      return result.status === DryRunStatus.Complete
        ? { ...result, tests: inSpecFiles(result.tests, process.cwd()) }
        : result;
    },
    mutantRun: (options) => runner.mutantRun(options),
    dispose: () => runner.dispose(),
  };
  return inSpecs;
}
createRunner.inject = tokens(commonTokens.injector);

export const strykerPlugins = [
  declareFactoryPlugin(PluginKind.TestRunner, 'vitest-spec-files', createRunner),
];

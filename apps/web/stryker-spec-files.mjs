// The test runner of the web's mutation testing: StrykerJS's Vitest runner, with every test
// reported in the spec file it was written in instead of the compiled file Vitest runs.
//
// StrykerJS cannot drive `ng test`, so Vitest runs the specs `ng test --dump-virtual-files`
// compiles (see `vitest-stryker.config.mts`). An incremental run tells a test from the last run's
// by its file, its place in that file and its name, and diffs that file's code to find the tests
// that changed. The compiled files exist only in StrykerJS's working copy and change with every
// build, so every test looked new and nearly every mutant ran again on every run. Placed in its
// spec file, a test is new or changed only when its own code is, as in the other workspaces.

import { existsSync, readFileSync } from 'node:fs';
import { SourceMap } from 'node:module';
import path from 'node:path';
import {
  commonTokens,
  declareFactoryPlugin,
  PluginKind,
  tokens,
} from '@stryker-mutator/api/plugin';
import { DryRunStatus } from '@stryker-mutator/api/test-runner';
import { strykerPlugins as vitestPlugins } from '@stryker-mutator/vitest-runner';

/**
 * @typedef {import('@stryker-mutator/api/test-runner').TestResult} TestResult
 * @typedef {import('@stryker-mutator/api/core').Position} Position
 * @typedef {{ fileName: string, placeOf: (place: Position) => Position | undefined }} Spec
 */

/**
 * Points each test at the spec file its compiled file was built from, at the place where the test
 * is written there. The compiled file's map (`<file>.map`) names that spec: its one `.spec.ts`
 * source, relative to `folder` as the Angular CLI writes it. A test is left as it was when its
 * compiled file has no map, the map names no single spec, or that spec is not in `folder`; it
 * loses its place when the place is not in the spec (a test declared by a helper), and then
 * counts as changed whenever its spec file changes.
 * @param {TestResult[]} tests
 * @param {string} folder the web's folder
 * @returns {TestResult[]}
 */
export function placeInSpecFiles(tests, folder) {
  /** @type {Map<string, Spec | undefined>} */
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
    const { startPosition, ...rest } = test;
    const place = startPosition && spec.placeOf(startPosition);
    return place
      ? { ...rest, fileName: spec.fileName, startPosition: place }
      : { ...rest, fileName: spec.fileName };
  });
}

/**
 * @param {string} compiled
 * @param {string} folder
 * @returns {Spec | undefined}
 */
function specOf(compiled, folder) {
  const mapFile = `${compiled}.map`;
  if (!existsSync(mapFile)) {
    return undefined;
  }
  const payload = JSON.parse(readFileSync(mapFile, 'utf8'));
  /** @type {string[]} */
  const specSources = payload.sources.filter((/** @type {string} */ source) =>
    source.endsWith('.spec.ts'),
  );
  if (specSources.length !== 1) {
    return undefined;
  }
  const [source] = specSources;
  const fileName = path.resolve(folder, source);
  if (!existsSync(fileName)) {
    return undefined;
  }
  const map = new SourceMap(payload);
  return {
    fileName,
    // StrykerJS counts lines and columns from 0, source maps from 1.
    placeOf({ line, column }) {
      const origin = map.findOrigin(line + 1, column + 1);
      return 'fileName' in origin && origin.fileName === source
        ? { line: origin.lineNumber - 1, column: origin.columnNumber - 1 }
        : undefined;
    },
  };
}

const [vitest] = vitestPlugins;

/** @param {import('@stryker-mutator/api/plugin').Injector} injector */
function createRunner(injector) {
  const runner = vitest.factory(injector);
  /** @type {import('@stryker-mutator/api/test-runner').TestRunner} */
  const placing = {
    capabilities: () => runner.capabilities(),
    init: () => runner.init(),
    async dryRun(options) {
      const result = await runner.dryRun(options);
      // The test runner works in StrykerJS's working copy of the web's folder.
      return result.status === DryRunStatus.Complete
        ? { ...result, tests: placeInSpecFiles(result.tests, process.cwd()) }
        : result;
    },
    mutantRun: (options) => runner.mutantRun(options),
    dispose: () => runner.dispose(),
  };
  return placing;
}
createRunner.inject = tokens(commonTokens.injector);

export const strykerPlugins = [
  declareFactoryPlugin(PluginKind.TestRunner, 'vitest-spec-files', createRunner),
];

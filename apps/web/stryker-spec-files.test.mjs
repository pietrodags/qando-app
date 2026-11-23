import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { placeInSpecFiles } from './stryker-spec-files.mjs';

// A compiled spec as `ng test --dump-virtual-files` writes it: the spec's code after the code it
// imports, and a map whose sources are relative to the web's folder. Its lines:
//   0 import "./chunk-A.js";        (no source)
//   1 // src/app/thing.ts           (no source)
//   2 var thing = 1;                thing.ts, line 0
//   3 // src/app/thing.spec.ts      (no source)
//   4 describe("Thing", () => {     thing.spec.ts, line 0
//   5   it("draws", () => {});      thing.spec.ts, line 1
//   6   it("hides", () => {});      thing.spec.ts, line 2
//   7 });                           thing.spec.ts, line 3
const mappings = ';;ACAA;;ADAA;AACA;AACA;AACA';

/** @type {string} */
let folder;
/** @type {string} */
let bundle;

/**
 * @param {string} fileName
 * @param {string} content
 */
function write(fileName, content) {
  mkdirSync(path.dirname(fileName), { recursive: true });
  writeFileSync(fileName, content);
}

/** @param {string[]} sources */
function writeMap(sources) {
  write(`${bundle}.map`, JSON.stringify({ version: 3, sources, names: [], mappings }));
}

/**
 * @param {Partial<import('@stryker-mutator/api/test-runner').TestResult>} fields
 * @returns {import('@stryker-mutator/api/test-runner').TestResult}
 */
function test(fields) {
  return /** @type {import('@stryker-mutator/api/test-runner').TestResult} */ ({
    id: 'spec-app-thing.js#Thing > draws',
    name: 'Thing > draws',
    status: 'success',
    timeSpentMs: 3,
    fileName: bundle,
    ...fields,
  });
}

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'spec-files-'));
  bundle = path.join(folder, 'output-files', 'spec-app-thing.js');
  write(path.join(folder, 'src/app/thing.spec.ts'), 'describe("Thing", () => {});\n');
  write(path.join(folder, 'src/app/thing.ts'), 'export const thing = 1;\n');
  write(bundle, 'import "./chunk-A.js";\n');
  writeMap(['src/app/thing.spec.ts', 'src/app/thing.ts']);
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('placeInSpecFiles', () => {
  it('points a test at the spec file it was compiled from, where it is written there', () => {
    const [placed] = placeInSpecFiles([test({ startPosition: { line: 5, column: 2 } })], folder);

    expect(placed).toEqual(
      test({
        fileName: path.join(folder, 'src/app/thing.spec.ts'),
        startPosition: { line: 1, column: 2 },
      }),
    );
  });

  it('places every test of a compiled spec, each where it is', () => {
    const placed = placeInSpecFiles(
      [
        test({ startPosition: { line: 5, column: 2 } }),
        test({ name: 'Thing > hides', startPosition: { line: 6, column: 2 } }),
      ],
      folder,
    );

    expect(placed.map((one) => one.startPosition)).toEqual([
      { line: 1, column: 2 },
      { line: 2, column: 2 },
    ]);
  });

  it('points a test with no place at its spec file, still without a place', () => {
    const [placed] = placeInSpecFiles([test({})], folder);

    expect(placed?.fileName).toBe(path.join(folder, 'src/app/thing.spec.ts'));
    expect(placed).not.toHaveProperty('startPosition');
  });

  it('leaves out the place of a test declared outside its spec file', () => {
    const [placed] = placeInSpecFiles([test({ startPosition: { line: 2, column: 0 } })], folder);

    expect(placed?.fileName).toBe(path.join(folder, 'src/app/thing.spec.ts'));
    expect(placed).not.toHaveProperty('startPosition');
  });

  it('leaves out the place of a test where the map says nothing', () => {
    const [placed] = placeInSpecFiles([test({ startPosition: { line: 0, column: 0 } })], folder);

    expect(placed?.fileName).toBe(path.join(folder, 'src/app/thing.spec.ts'));
    expect(placed).not.toHaveProperty('startPosition');
  });

  it('leaves a test as it was when its compiled file has no map', () => {
    rmSync(`${bundle}.map`);
    const original = test({ startPosition: { line: 5, column: 2 } });

    expect(placeInSpecFiles([original], folder)).toEqual([original]);
  });

  it('leaves a test as it was when its map names no spec file, or more than one', () => {
    const original = test({ startPosition: { line: 5, column: 2 } });

    writeMap(['src/app/thing.ts', 'src/app/other.ts']);
    expect(placeInSpecFiles([original], folder)).toEqual([original]);

    write(path.join(folder, 'src/app/other.spec.ts'), '');
    writeMap(['src/app/thing.spec.ts', 'src/app/other.spec.ts']);
    expect(placeInSpecFiles([original], folder)).toEqual([original]);
  });

  it('leaves a test as it was when its spec file is not in the folder', () => {
    rmSync(path.join(folder, 'src/app/thing.spec.ts'));
    const original = test({ startPosition: { line: 5, column: 2 } });

    expect(placeInSpecFiles([original], folder)).toEqual([original]);
  });

  it('leaves a test without a file as it was', () => {
    const original = test({ fileName: undefined });

    expect(placeInSpecFiles([original], folder)).toEqual([original]);
  });
});

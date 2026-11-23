import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inSpecFiles } from './stryker-spec-files.mjs';

// Compiled specs as `ng test --dump-virtual-files` writes them: each one next to its map, whose
// sources are relative to the web's folder, the spec first and the code it imports after it.

/** @type {string} */
let folder;

/** @param {string} name */
function compiled(name) {
  return path.join(folder, 'output-files', name);
}

/**
 * @param {string} fileName
 * @param {string} content
 */
function write(fileName, content) {
  mkdirSync(path.dirname(fileName), { recursive: true });
  writeFileSync(fileName, content);
}

/**
 * @param {string} name
 * @param {string[]} sources
 */
function writeCompiled(name, sources) {
  write(compiled(name), 'import "./chunk-A.js";\n');
  write(`${compiled(name)}.map`, JSON.stringify({ version: 3, sources, names: [], mappings: '' }));
}

/**
 * @param {Partial<import('@stryker-mutator/api/test-runner').TestResult>} fields
 * @returns {import('@stryker-mutator/api/test-runner').TestResult}
 */
function test(fields) {
  return /** @type {import('@stryker-mutator/api/test-runner').TestResult} */ ({
    id: 'output-files/spec-app-thing.js#Thing > draws',
    name: 'Thing > draws',
    status: 'success',
    timeSpentMs: 3,
    fileName: compiled('spec-app-thing.js'),
    ...fields,
  });
}

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'spec-files-'));
  write(path.join(folder, 'src/app/thing.spec.ts'), '');
  write(path.join(folder, 'src/app/thing.ts'), '');
  writeCompiled('spec-app-thing.js', ['src/app/thing.spec.ts', 'src/app/thing.ts']);
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('inSpecFiles', () => {
  it('points a test at the spec file it was compiled from', () => {
    const [placed] = inSpecFiles([test({})], folder);

    expect(placed).toEqual(test({ fileName: path.join(folder, 'src/app/thing.spec.ts') }));
  });

  it('leaves out a place in the compiled file, which is not a place in the spec', () => {
    const [placed] = inSpecFiles([test({ startPosition: { line: 5, column: 2 } })], folder);

    expect(placed).toEqual(test({ fileName: path.join(folder, 'src/app/thing.spec.ts') }));
    expect(placed).not.toHaveProperty('startPosition');
  });

  it('points the tests of each compiled file at its own spec file', () => {
    write(path.join(folder, 'src/app/other.spec.ts'), '');
    writeCompiled('spec-app-other.js', ['src/app/other.spec.ts', 'src/app/thing.ts']);

    const placed = inSpecFiles(
      [
        test({}),
        test({ fileName: compiled('spec-app-other.js') }),
        test({ name: 'Thing > hides' }),
      ],
      folder,
    );

    expect(placed.map((one) => one.fileName)).toEqual([
      path.join(folder, 'src/app/thing.spec.ts'),
      path.join(folder, 'src/app/other.spec.ts'),
      path.join(folder, 'src/app/thing.spec.ts'),
    ]);
  });

  it('leaves a test as it was when its compiled file has no map', () => {
    rmSync(`${compiled('spec-app-thing.js')}.map`);
    const original = test({ startPosition: { line: 5, column: 2 } });

    expect(inSpecFiles([original], folder)).toEqual([original]);
  });

  it('leaves a test as it was when its map names no spec file, or more than one', () => {
    const original = test({});

    writeCompiled('spec-app-thing.js', ['src/app/thing.ts']);
    expect(inSpecFiles([original], folder)).toEqual([original]);

    write(path.join(folder, 'src/app/other.spec.ts'), '');
    writeCompiled('spec-app-thing.js', ['src/app/thing.spec.ts', 'src/app/other.spec.ts']);
    expect(inSpecFiles([original], folder)).toEqual([original]);
  });

  it('leaves a test as it was when its spec file is not in the folder', () => {
    rmSync(path.join(folder, 'src/app/thing.spec.ts'));
    const original = test({});

    expect(inSpecFiles([original], folder)).toEqual([original]);
  });

  it('leaves a test without a file as it was', () => {
    const original = test({ fileName: undefined });

    expect(inSpecFiles([original], folder)).toEqual([original]);
  });
});

// `npm run check:references`: prints every identifier that points to a document outside this
// repository and fails if there is any. The files are those git knows (tracked, or new and not
// ignored), so ignored output never counts.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { styleText } from 'node:util';

import { foreignReferences } from './foreign-references.ts';

/** The check's own unit tests: the one file that has to write such identifiers, to try them. */
const ownTests = 'tools/guide-check/src/foreign-references.test.ts';
/** Written by npm, not by a person: nobody words it or reads it for its reasons. */
const lockFile = 'package-lock.json';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const paths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter((path) => path !== '' && path !== ownTests && basename(path) !== lockFile)
  // A file deleted but not yet staged is still listed by git: it no longer counts.
  .filter((path) => statSync(join(root, path), { throwIfNoEntry: false })?.isFile())
  .sort();

// A file with a zero byte is binary (an image, a font): it has no text to read.
const files = paths
  .map((path) => ({ path, bytes: readFileSync(join(root, path)) }))
  .filter(({ bytes }) => !bytes.includes(0))
  .map(({ path, bytes }) => ({ path, text: bytes.toString('utf8') }));

const references = foreignReferences(files);
// Colours only where the stream shows them (a terminal, or FORCE_COLOR); never with NO_COLOR.
if (references.length > 0) {
  const count = styleText('red', `${String(references.length)} reference(s)`, {
    stream: process.stderr,
  });
  console.error(references.join('\n'));
  console.error(`\n${count} to documents outside this repository.`);
  process.exitCode = 1;
} else {
  const green = styleText('green', '✓', { stream: process.stdout });
  console.log(`${green} no file points to a document that is not in this repository.`);
}

// `npm run check:guide`: prints where the code guide and the code disagree and fails if they do.
// The files are those git knows (tracked, or new and not ignored), so ignored output never counts.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { guideProblems } from './guide-check.ts';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const paths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter((path) => path !== '');
// A file deleted but not yet staged is still listed by git: it no longer counts.
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const present = paths.filter((path) => existsSync(join(root, path)));

const problems = guideProblems(read('docs/code-guide.md'), present, read);
if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(
    `\n${String(problems.length)} problem(s): update docs/code-guide.md (rules at its top).`,
  );
  process.exitCode = 1;
} else {
  console.log('✓ docs/code-guide.md names every folder, export and component input and output.');
}

// The command as CI runs it: in a real Git repository, through its exit code and its output.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const RESET = '\u001b[39m';

// Put together here, so that this file holds no identifier the check itself would report.
const BUG = ['BUG', '046'].join('-');
const DECISION = ['OD', '05'].join('-');
const RECORD = ['ADR', '0004'].join(' ');

const PASSED = 'no file points to a document that is not in this repository.\n';
const ADVICE = 'points to a document that is not in this repository; say the reason in words\n';

const command = join(dirname(fileURLToPath(import.meta.url)), 'references-main.ts');

let root: string;

function write(path: string, contents: string | Uint8Array): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
}

function git(...args: string[]): void {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function check(env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [command], {
    cwd: join(root, 'src'),
    encoding: 'utf8',
    env: { ...withoutColourSettings(process.env), ...env },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

/** The environment without the variables that turn colours on or off, so each test decides. */
function withoutColourSettings(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => name !== 'NO_COLOR' && name !== 'FORCE_COLOR'),
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'references-check-'));
  git('init', '--quiet');
  write('.gitignore', 'ignored/\n');
  write('src/shown.ts', '// Two voters called Ana stay two people.\nexport const shown = 1;\n');
  write('docs/guide.md', '# Guide\n\nHashed with SHA-256.\n');
  write('gone/old.ts', `// ${BUG}\n`);
  // What the check leaves unread: npm's lock file, binary files, its own unit tests.
  write('package-lock.json', `{ "name": "${BUG}" }\n`);
  write('apps/web/package-lock.json', `{ "name": "${DECISION}" }\n`);
  write('logo.png', Buffer.from(`\u0089PNG\u0000 ${BUG} \u0000`, 'latin1'));
  write('tools/guide-check/src/foreign-references.test.ts', `expect('${RECORD}');\n`);
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--quiet',
    '--no-gpg-sign',
    '-m',
    'start',
  );
  // Deleted but not staged: git still lists it, the check must not read it.
  rmSync(join(root, 'gone'), { recursive: true });
  write('ignored/hidden.ts', `// ${BUG}\n`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('npm run check:references', () => {
  it('passes when no file read points outside, from any folder of the repository', () => {
    expect(check()).toEqual({ status: 0, output: `✓ ${PASSED}` });
  });

  it('fails and lists each identifier with its place, new files not yet added included', () => {
    write('src/shown.ts', `export const shown = 1;\n// Kept apart (${DECISION}, ${RECORD}).\n`);
    write('fresh/new.md', `As ${BUG} says.\n`);
    // Only those exact paths are left unread.
    write('src/foreign-references.test.ts', `// ${BUG}\n`);
    write('docs/package-lock.json.md', `${DECISION}\n`);

    const { status, output } = check();

    expect(status).toBe(1);
    expect(output).toBe(
      `docs/package-lock.json.md:1: \`${DECISION}\` ${ADVICE}` +
        `fresh/new.md:1: \`${BUG}\` ${ADVICE}` +
        `src/foreign-references.test.ts:1: \`${BUG}\` ${ADVICE}` +
        `src/shown.ts:2: \`${DECISION}\` ${ADVICE}` +
        `src/shown.ts:2: \`${RECORD}\` ${ADVICE}` +
        '\n5 reference(s) to documents outside this repository.\n',
    );
  });

  it('colours the tick green and the count red in a terminal that shows colours', () => {
    expect(check({ FORCE_COLOR: '1' }).output).toBe(`${GREEN}✓${RESET} ${PASSED}`);

    write('fresh/new.md', `As ${BUG} says.\n`);
    const { output } = check({ FORCE_COLOR: '1' });

    expect(output).toContain(`fresh/new.md:1: \`${BUG}\` ${ADVICE}`);
    expect(output).toContain(`${RED}1 reference(s)${RESET} to documents outside this repository.`);
  });
});

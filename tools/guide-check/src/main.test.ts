// The command as CI runs it: in a real Git repository, through its exit code and its output.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const command = join(dirname(fileURLToPath(import.meta.url)), 'main.ts');

let root: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function git(...args: string[]): void {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function check() {
  const result = spawnSync(process.execPath, [command], { cwd: root, encoding: 'utf8' });
  return { status: result.status, output: result.stdout + result.stderr };
}

function guide(...folders: string[]): string {
  return `# Code guide\n\n## Folders\n\n${folders.map((folder) => `### \`${folder}\`\n\n\`shown\`\n`).join('\n')}`;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'guide-check-'));
  git('init', '--quiet');
  write('.gitignore', 'ignored/\n');
  write('src/shown.ts', 'export const shown = 1;\n');
  write('gone/old.ts', 'export const old = 1;\n');
  write('docs/code-guide.md', guide('.', 'docs', 'src'));
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
  // Deleted but not staged: git still lists it, the check must not.
  rmSync(join(root, 'gone'), { recursive: true });
  write('ignored/hidden.ts', 'export const hidden = 1;\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('npm run check:guide', () => {
  it('passes when the guide names everything, ignoring ignored and deleted files', () => {
    expect(check()).toEqual({
      status: 0,
      output: '✓ docs/code-guide.md names every folder, export and component input and output.\n',
    });
  });

  it('fails and lists the problems, new files not yet added included', () => {
    write('src/shown.ts', 'export const shown = 1;\nexport const added = 2;\n');
    write('fresh/new.ts', 'export const shown = 1;\n');

    const { status, output } = check();

    expect(status).toBe(1);
    expect(output).toContain('✗ fresh: the folder has no section in the guide\n');
    expect(output).toContain('✗ src: export "added" (shown.ts) is not in the guide\n');
    expect(output).toContain('2 problem(s): update docs/code-guide.md');
    expect(output).not.toContain('gone');
    expect(output).not.toContain('ignored');
  });
});

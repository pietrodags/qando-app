// Checks the code guide against the code: that every folder has its section, and that each
// section names the public pieces of its folder. It checks presence, not truth.

/** Folders with no section: generated, local-only or tool data, wherever they are. */
const GENERATED_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'reports',
  'test-results',
  '.features-gen',
  '.angular',
]);

/** Generated folders that are committed, by path. */
const GENERATED_PATHS = new Set(['apps/api/drizzle/meta']);

const SECTION_HEADING = /^### `([^`]+)`\s*$/;

const NAMED_EXPORT =
  /^export\s+(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;

const CLASS_START = /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm;

const SIGNAL_MEMBER =
  /\b([A-Za-z_$][\w$]*)\s*=\s*(input|output|model)(?:\.required)?\s*(?:<[^()]*>)?\s*\(/g;

/**
 * Every place where the guide and the code disagree, one line each (`✗ <folder>: …`), in the order
 * of the folders and of the code in each file; empty when the guide is up to date.
 *
 * @param guide the text of `docs/code-guide.md`.
 * @param paths every file of the repository, relative to its root with `/` separators.
 * @param read the contents of one of `paths`; only the TypeScript sources the guide must describe
 *   are read.
 */
export function guideProblems(
  guide: string,
  paths: readonly string[],
  read: (path: string) => string,
): string[] {
  const sections = folderSections(guide);
  const files = paths.filter((path) => !isGenerated(path));
  const folders = foldersOf(files);
  const problems: string[] = [];

  for (const folder of folders) {
    const texts = sections.get(folder);
    if (texts === undefined) {
      problems.push(`✗ ${folder}: the folder has no section in the guide`);
      continue;
    }
    if (texts.length > 1) {
      problems.push(`✗ ${folder}: the folder has more than one section in the guide`);
    }
    const section = texts.join('\n');
    for (const path of files.filter((file) => folderOf(file) === folder && isDescribed(file))) {
      problems.push(...sourceProblems(folder, fileName(path), read(path), section));
    }
  }
  for (const folder of sections.keys()) {
    if (!folders.includes(folder)) {
      problems.push(`✗ ${folder}: the section names a folder that no longer exists`);
    }
  }
  return problems;
}

/** The sections under `## Folders`, by the path in their heading (more than one if repeated). */
function folderSections(guide: string): Map<string, string[]> {
  const found: { folder: string; lines: string[] }[] = [];
  let inFolders = false;
  let current: string[] | undefined;
  for (const line of guide.split('\n')) {
    if (line.startsWith('## ')) {
      inFolders = line.trim() === '## Folders';
      current = undefined;
    } else if (line.startsWith('### ')) {
      const folder = inFolders ? SECTION_HEADING.exec(line)?.[1] : undefined;
      current = undefined;
      if (folder !== undefined) {
        current = [];
        found.push({ folder, lines: current });
      }
    } else {
      current?.push(line);
    }
  }
  const sections = new Map<string, string[]>();
  for (const { folder, lines } of found) {
    sections.set(folder, [...(sections.get(folder) ?? []), lines.join('\n')]);
  }
  return sections;
}

function sourceProblems(folder: string, file: string, source: string, section: string): string[] {
  const problems: string[] = [];
  for (const [, name] of source.matchAll(NAMED_EXPORT)) {
    if (name !== undefined && !names(section, name)) {
      problems.push(`✗ ${folder}: export "${name}" (${file}) is not in the guide`);
    }
  }
  for (const { name, members } of classes(source)) {
    if (members.length === 0) continue;
    const row = section.split('\n').find((line) => line.includes(`**\`${name}\`**`));
    if (row === undefined) {
      problems.push(`✗ ${folder}: component "${name}" (${file}) has no row in the guide`);
      continue;
    }
    for (const member of members) {
      if (!names(row, member.name)) {
        problems.push(
          `✗ ${folder}: ${member.kind} "${member.name}" of ${name} (${file}) is not in its row`,
        );
      }
    }
  }
  return problems;
}

interface SignalMember {
  readonly name: string;
  readonly kind: string;
}

/** The exported classes of a file, each with the inputs, outputs and models in its body. */
function classes(source: string): { name: string; members: SignalMember[] }[] {
  const starts = [...source.matchAll(CLASS_START)];
  return starts.flatMap((start, index) => {
    const [header, name] = start;
    if (name === undefined || !header.startsWith('export')) return [];
    const body = source.slice(start.index, starts[index + 1]?.index ?? source.length);
    const members = [...body.matchAll(SIGNAL_MEMBER)].map(([, member = '', kind = '']) => ({
      name: member,
      kind,
    }));
    return [{ name, members }];
  });
}

/** Whether `text` holds `name` as a whole word. */
function names(text: string, name: string): boolean {
  const escaped = name.replaceAll('$', '\\$');
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(text);
}

function isGenerated(path: string): boolean {
  const parts = path.split('/');
  return parts.some(
    (part, index) =>
      GENERATED_NAMES.has(part) || GENERATED_PATHS.has(parts.slice(0, index + 1).join('/')),
  );
}

/** Whether the guide must describe the exports of a file: TypeScript sources, not tests. */
function isDescribed(path: string): boolean {
  return path.endsWith('.ts') && !/\.(test|spec|d)\.ts$/.test(path);
}

/** Every folder that holds a file, with the folders in between, root (`.`) first, sorted. */
function foldersOf(files: readonly string[]): string[] {
  const folders = new Set<string>(['.']);
  for (const file of files) {
    const parts = file.split('/').slice(0, -1);
    parts.forEach((_, index) => folders.add(parts.slice(0, index + 1).join('/')));
  }
  return [...folders].sort((a, b) => (a === '.' ? -1 : b === '.' ? 1 : a.localeCompare(b)));
}

function folderOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '.' : path.slice(0, slash);
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

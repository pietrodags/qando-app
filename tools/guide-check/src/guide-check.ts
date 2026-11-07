// Checks the code guide against the code: that every folder has its section, and that each
// section names the public pieces of its folder. It checks presence, not truth.
import ts from 'typescript';

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

const SIGNAL_FUNCTIONS = new Set(['input', 'output', 'model']);

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
  const { exports, classes } = publicPieces(file, source);
  const problems = exports
    .filter((name) => !names(section, name))
    .map((name) => `✗ ${folder}: export "${name}" (${file}) is not in the guide`);
  for (const { name, members } of classes) {
    if (members.length === 0) continue;
    const row = section.split('\n').find((line) => line.includes(`**\`${name}\`**`));
    if (row === undefined) {
      problems.push(`✗ ${folder}: component "${name}" (${file}) has no row in the guide`);
      continue;
    }
    for (const member of members.filter((member) => !names(row, member.name))) {
      problems.push(
        `✗ ${folder}: ${member.kind} "${member.name}" of ${name} (${file}) is not in its row`,
      );
    }
  }
  return problems;
}

interface SignalMember {
  readonly name: string;
  readonly kind: string;
}

/**
 * What a file offers the rest of the code, read from its syntax (comments and strings never
 * count): the names it exports itself, and its exported classes with their inputs, outputs and
 * models. Default exports, re-exports and destructured exports are left out.
 */
function publicPieces(
  file: string,
  source: string,
): { exports: string[]; classes: { name: string; members: SignalMember[] }[] } {
  const statements = ts.createSourceFile(file, source, ts.ScriptTarget.Latest).statements;
  const exports: string[] = [];
  const classes: { name: string; members: SignalMember[] }[] = [];
  for (const statement of statements.filter(isNamedExport)) {
    if (ts.isVariableStatement(statement)) {
      for (const { name } of statement.declarationList.declarations) {
        if (ts.isIdentifier(name)) exports.push(name.text);
      }
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name !== undefined
    ) {
      exports.push(statement.name.text);
      if (ts.isClassDeclaration(statement)) {
        classes.push({ name: statement.name.text, members: signalMembers(statement) });
      }
    }
  }
  return { exports, classes };
}

function isNamedExport(statement: ts.Statement): boolean {
  const modifiers = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : [];
  const kinds = modifiers.map((modifier) => modifier.kind);
  return (
    kinds.includes(ts.SyntaxKind.ExportKeyword) && !kinds.includes(ts.SyntaxKind.DefaultKeyword)
  );
}

/** The properties of a class set to `input(…)`, `output(…)` or `model(…)`, `.required` included. */
function signalMembers(declaration: ts.ClassDeclaration): SignalMember[] {
  return declaration.members.flatMap((member) => {
    if (!ts.isPropertyDeclaration(member) || !ts.isIdentifier(member.name)) return [];
    const initializer = member.initializer;
    if (initializer === undefined || !ts.isCallExpression(initializer)) return [];
    const callee = initializer.expression;
    const signal =
      ts.isPropertyAccessExpression(callee) && callee.name.text === 'required'
        ? callee.expression
        : callee;
    if (!ts.isIdentifier(signal) || !SIGNAL_FUNCTIONS.has(signal.text)) return [];
    return [{ name: member.name.text, kind: signal.text }];
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

/** Every folder that holds a file, with the folders in between, sorted, root (`.`) first. */
function foldersOf(files: readonly string[]): string[] {
  const folders = new Set<string>(['.']);
  for (const file of files) {
    const parts = file.split('/').slice(0, -1);
    parts.forEach((_, index) => folders.add(parts.slice(0, index + 1).join('/')));
  }
  // `.` sorts before every other path, `.github` included.
  return [...folders].sort();
}

function folderOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '.' : path.slice(0, slash);
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

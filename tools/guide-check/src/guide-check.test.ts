import { describe, expect, it } from 'vitest';

import { guideProblems } from './guide-check.ts';

/** A repository in memory: each path with its contents. */
function repo(files: Record<string, string>) {
  return {
    paths: Object.keys(files),
    read: (path: string) => {
      const source = files[path];
      if (source === undefined) throw new Error(`not in the repository: ${path}`);
      return source;
    },
  };
}

/** A guide whose Folders part has one section per entry, heading → body. */
function guide(sections: Record<string, string>): string {
  const body = Object.entries(sections)
    .map(([folder, text]) => `### \`${folder}\`\n\n${text}\n`)
    .join('\n');
  return `# Code guide\n\n## Flows\n\n### Vote\n\nA flow, not a folder.\n\n## Folders\n\n${body}`;
}

function problems(sections: Record<string, string>, files: Record<string, string>): string[] {
  const { paths, read } = repo(files);
  return guideProblems(guide(sections), paths, read);
}

describe('guideProblems', () => {
  describe('folders', () => {
    it('finds nothing when every folder has its section', () => {
      expect(
        problems(
          { '.': 'Root.', apps: 'Apps.', 'apps/api': 'The API.' },
          { 'package.json': '{}', 'apps/api/README.md': '# API' },
        ),
      ).toEqual([]);
    });

    it('asks a section for a folder that has none, including the folders in between', () => {
      expect(problems({ '.': 'Root.' }, { 'apps/api/README.md': '# API' })).toEqual([
        '✗ apps: the folder has no section in the guide',
        '✗ apps/api: the folder has no section in the guide',
      ]);
    });

    it('reports a section whose folder no longer exists', () => {
      expect(problems({ '.': 'Root.', old: 'Gone.' }, { 'package.json': '{}' })).toEqual([
        '✗ old: the section names a folder that no longer exists',
      ]);
    });

    it('reports a section that is twice in the guide', () => {
      const { paths, read } = repo({ 'package.json': '{}' });
      const twice = `## Folders\n\n### \`.\`\n\nRoot.\n\n### \`.\`\n\nRoot again.\n`;
      expect(guideProblems(twice, paths, read)).toEqual([
        '✗ .: the folder has more than one section in the guide',
      ]);
    });

    it('needs no section for generated folders, even when they are committed', () => {
      expect(
        problems(
          { '.': 'Root.', apps: 'Apps.', 'apps/api': 'API.', 'apps/api/drizzle': 'Migrations.' },
          {
            'apps/api/drizzle/0000_init.sql': 'create table events ();',
            'apps/api/drizzle/meta/_journal.json': '{}',
            'apps/web/node_modules/x/index.ts': 'export const x = 1;',
            'dist/index.ts': 'export const y = 1;',
            'reports/a.ts': '',
            'test-results/a.ts': '',
            'e2e/.features-gen/a.ts': '',
            '.git/HEAD': '',
            'apps/web/.angular/cache/a.ts': '',
          },
        ),
      ).toEqual([]);
    });

    it('ignores the headings outside the Folders part and those without a path', () => {
      const { paths, read } = repo({ 'package.json': '{}' });
      const text = `## Flows\n\n### \`not-a-folder\`\n\n## Folders\n\n### \`.\`\n\nRoot.\n\n### Notes\n\nPlain.\n\n## Afterwards\n\n### \`also-not\`\n`;
      expect(guideProblems(text, paths, read)).toEqual([]);
    });
  });

  describe('exports', () => {
    it('finds nothing when every export is named in its folder section', () => {
      expect(
        problems(
          { '.': 'Root.', src: '`toggled(answers)` and `Answers` and `MyVotes`, `HOLD_MS`.' },
          {
            'src/answers.ts': [
              'export type Answers = Record<string, string>;',
              'export function toggled(answers: Answers) { return answers; }',
              'export const HOLD_MS = 500;',
              'export class MyVotes {}',
            ].join('\n'),
          },
        ),
      ).toEqual([]);
    });

    it('reports each export its folder section does not name, with its file', () => {
      expect(
        problems(
          { '.': 'Root.', src: 'Nothing named here, only toggledAll.' },
          {
            'src/answers.ts': [
              'export type Answers = Record<string, string>;',
              'export interface Option { id: string }',
              'export async function toggled() {}',
              'export function* pages() {}',
              'export const HOLD_MS = 500;',
              'export let counter = 0;',
              'export abstract class Base {}',
              'export enum Mode { A }',
              'export declare const injected: string;',
            ].join('\n'),
          },
        ),
      ).toEqual([
        '✗ src: export "Answers" (answers.ts) is not in the guide',
        '✗ src: export "Option" (answers.ts) is not in the guide',
        '✗ src: export "toggled" (answers.ts) is not in the guide',
        '✗ src: export "pages" (answers.ts) is not in the guide',
        '✗ src: export "HOLD_MS" (answers.ts) is not in the guide',
        '✗ src: export "counter" (answers.ts) is not in the guide',
        '✗ src: export "Base" (answers.ts) is not in the guide',
        '✗ src: export "Mode" (answers.ts) is not in the guide',
        '✗ src: export "injected" (answers.ts) is not in the guide',
      ]);
    });

    it('counts only the folder section of the file, not another one', () => {
      expect(
        problems(
          { '.': 'Root.', a: 'Nothing.', b: '`helper`' },
          { 'a/helper.ts': 'export const helper = 1;', 'b/README.md': '' },
        ),
      ).toEqual(['✗ a: export "helper" (helper.ts) is not in the guide']);
    });

    it('needs the whole name, not a longer word that contains it', () => {
      expect(
        problems(
          { '.': 'Root.', src: '`Options` and `myVote` and `voteDay`' },
          { 'src/a.ts': 'export type Option = string;\nexport const vote = 1;' },
        ),
      ).toEqual([
        '✗ src: export "Option" (a.ts) is not in the guide',
        '✗ src: export "vote" (a.ts) is not in the guide',
      ]);
    });

    it('accepts a name with a dollar sign', () => {
      expect(
        problems({ '.': 'Root.', src: '`$state`' }, { 'src/a.ts': 'export const $state = 1;' }),
      ).toEqual([]);
    });

    it('skips re-exports, default exports, test files and non-TypeScript files', () => {
      expect(
        problems(
          { '.': 'Root.', src: 'Nothing named here.' },
          {
            'src/index.ts': [
              "export * from './vote.ts';",
              "export { a, b } from './vote.ts';",
              "export type { C } from './vote.ts';",
              'export default defineConfig({});',
              'export const { d, e } = pair;',
            ].join('\n'),
            'src/vote.test.ts': 'export const fixture = 1;',
            'src/vote-page.spec.ts': 'export class Harness {}',
            'src/types.d.ts': 'export interface Ambient {}',
            'src/config.mjs': 'export const config = 1;',
            'src/script.js': 'export function run() {}',
          },
        ),
      ).toEqual([]);
    });

    it('reads only the TypeScript sources it checks', () => {
      const read = (path: string) => {
        if (path !== 'src/a.ts') throw new Error(`read ${path}`);
        return 'export const a = 1;';
      };
      expect(
        guideProblems(
          guide({ '.': 'Root.', src: '`a`' }),
          ['src/a.ts', 'src/a.test.ts', 'src/logo.png', 'src/types.d.ts'],
          read,
        ),
      ).toEqual([]);
    });

    it('does not look for an export in a section that is missing', () => {
      expect(problems({ '.': 'Root.' }, { 'src/a.ts': 'export const a = 1;' })).toEqual([
        '✗ src: the folder has no section in the guide',
      ]);
    });

    it('needs the export at the start of a line, not inside a comment or a string', () => {
      expect(
        problems(
          { '.': 'Root.', src: 'Nothing.' },
          { 'src/a.ts': "// see export const old = 1;\nconst text = 'export class Fake {}';" },
        ),
      ).toEqual([]);
    });

    it('reads files from the root folder as the "." section', () => {
      expect(problems({ '.': 'Nothing.' }, { 'setup.ts': 'export const setup = 1;' })).toEqual([
        '✗ .: export "setup" (setup.ts) is not in the guide',
      ]);
    });
  });

  describe('component inputs and outputs', () => {
    const votePage = [
      "@Component({ selector: 'app-vote-page' })",
      'export class VotePage {',
      '  readonly eventId = input.required<string>();',
      '  readonly name = model<string>();',
      '  protected readonly choose = output<void>();',
      '  readonly sending = input(false);',
      '  readonly options = input.required<readonly Option[]>();',
      '  private readonly other = signal(0);',
      '}',
    ].join('\n');

    it('finds nothing when the row names every input, output and model', () => {
      expect(
        problems(
          {
            '.': 'Root.',
            src: '| **`VotePage`** (`vote-page.*`) | `eventId`, `name` (two-way), `sending`, `options` → `choose` | The page. |',
          },
          { 'src/vote-page.ts': votePage },
        ),
      ).toEqual([]);
    });

    it('reports each input, output or model its row does not name', () => {
      expect(
        problems(
          {
            '.': 'Root.',
            src: '`eventId` is told elsewhere.\n\n| **`VotePage`** (`vote-page.*`) | `sending` | The page. |',
          },
          { 'src/vote-page.ts': votePage },
        ),
      ).toEqual([
        '✗ src: input "eventId" of VotePage (vote-page.ts) is not in its row',
        '✗ src: model "name" of VotePage (vote-page.ts) is not in its row',
        '✗ src: output "choose" of VotePage (vote-page.ts) is not in its row',
        '✗ src: input "options" of VotePage (vote-page.ts) is not in its row',
      ]);
    });

    it('reports a component with inputs or outputs but no row of its own', () => {
      expect(
        problems(
          {
            '.': 'Root.',
            src: '`VotePage` with `eventId`, `name`, `choose`, `sending`, `options`.',
          },
          { 'src/vote-page.ts': votePage },
        ),
      ).toEqual(['✗ src: component "VotePage" (vote-page.ts) has no row in the guide']);
    });

    it('gives each class of a file its own inputs', () => {
      const file = [
        'export class StepStack {',
        '  readonly current = model(0);',
        '}',
        '',
        '@Directive({ selector: "ng-template[appStep]" })',
        'export class Step {',
        '  readonly appStep = input.required<string>();',
        '  readonly accent = input<StepAccent>("slate");',
        '}',
      ].join('\n');
      expect(
        problems(
          {
            '.': 'Root.',
            src: [
              '| **`StepStack`** | `current`, `appStep` | Steps. |',
              '| **`Step`** directive | `accent` | One step. |',
            ].join('\n'),
          },
          { 'src/step-stack.ts': file },
        ),
      ).toEqual(['✗ src: input "appStep" of Step (step-stack.ts) is not in its row']);
    });

    it('does not give the inputs of a later private class to the exported one', () => {
      const file = [
        'export class Shell {}',
        'class Inner {',
        '  readonly hidden = input(0);',
        '}',
      ].join('\n');
      expect(problems({ '.': 'Root.', src: '`Shell`' }, { 'src/shell.ts': file })).toEqual([]);
    });

    it('needs no row for a class without inputs or outputs', () => {
      expect(
        problems(
          { '.': 'Root.', src: '`Toaster` shows messages.' },
          { 'src/toast.ts': 'export class Toaster {\n  show(message: string) {}\n}' },
        ),
      ).toEqual([]);
    });
  });
});

// The shared packages hold qando's rules and the shape on the wire, so they must not depend on a
// framework, the database or an app. These tests lint code through the real `eslint.config.js`,
// placed at an existing file of each package so the type-aware rules can resolve it.
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const sharedFiles = [
  'packages/domain/src/index.ts',
  'packages/contracts/src/index.ts',
  'packages/date-reader/src/index.ts',
];

const forbidden = [
  "import express from 'express';",
  "import type { Request } from 'express';",
  "import { Component } from '@angular/core';",
  "import { HttpClient } from '@angular/common/http';",
  "import { eq } from 'drizzle-orm';",
  "import { pgTable } from 'drizzle-orm/pg-core';",
  "import pg from 'pg';",
  "import { betterAuth } from 'better-auth';",
  "import { emailOTP } from 'better-auth/plugins';",
  "import { createApp } from '../../../apps/api/src/app';",
  "import { createApp } from '@qando/api';",
  "import { App } from '@qando/web';",
  "export { Router } from 'express';",
  "export * from 'drizzle-orm';",
  "import pg = require('pg');",
  "export async function load() { return import('pg'); }",
  "export const load = () => import('@angular/core');",
  "export const load = () => import('../../../apps/api/src/app');",
];

const allowed = [
  "import { z } from 'zod';",
  "import { describe } from 'vitest';",
  "export const load = () => import('zod');",
];

const boundaryRules = new Set(['@typescript-eslint/no-restricted-imports', 'no-restricted-syntax']);

let eslint;
beforeAll(() => {
  eslint = new ESLint({ cwd: import.meta.dirname });
});

async function restrictedImports(code, filePath) {
  const [result] = await eslint.lintText(`${code}\nexport {};\n`, { filePath });
  return result.messages.filter((message) => boundaryRules.has(message.ruleId));
}

describe.each(sharedFiles)('imports in %s', (filePath) => {
  it.each(forbidden)('rejects %s', async (code) => {
    expect(await restrictedImports(code, filePath)).toHaveLength(1);
  });

  it.each(allowed)('allows %s', async (code) => {
    expect(await restrictedImports(code, filePath)).toEqual([]);
  });
});

it.each(["import express from 'express';", "export const load = () => import('pg');"])(
  'leaves the apps free to use their dependencies: %s',
  async (code) => {
    expect(await restrictedImports(code, 'apps/api/src/app.ts')).toEqual([]);
  },
);

// The Angular 22 practices a linter can check, in the web's components and templates. Each case
// breaks one practice; the written-out component follows all of them.
describe('Angular practices in the web', () => {
  const componentFile = 'apps/web/src/app/features/vote/vote-page.ts';
  const templateFile = 'apps/web/src/app/features/vote/vote-days.html';

  async function ruleIds(code, filePath) {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.map((message) => message.ruleId);
  }

  function component(members, { imports = '', metadata = "template: '<p></p>'," } = {}) {
    return `import { Component, computed, input, model, output, signal } from '@angular/core';
${imports}
@Component({ selector: 'app-probe', ${metadata} })
export class Probe {
${members}
}
`;
  }

  function inlineTemplate(lines) {
    const body = Array.from({ length: lines }, () => '    <p>x</p>').join('\n');
    return `template: \`\n${body}\n  \`,`;
  }

  it('accepts a component that follows every practice, with a 30-line inline template', async () => {
    const code = component(
      `  readonly value = model(0);
  readonly name = input('');
  readonly saved = output<string>();
  protected readonly count = signal(0);
  protected readonly double = computed(() => this.count() * 2);`,
      { metadata: inlineTemplate(30) },
    );

    expect(await ruleIds(code, componentFile)).toEqual([]);
  });

  it.each([
    [
      '@angular-eslint/prefer-signals',
      component('  @Input() name = "";', { imports: "import { Input } from '@angular/core';" }),
    ],
    [
      '@angular-eslint/prefer-signal-model',
      component('  readonly value = input(0);\n  readonly valueChange = output<number>();'),
    ],
    [
      '@angular-eslint/prefer-output-emitter-ref',
      component('  @Output() readonly saved = new EventEmitter<string>();', {
        imports: "import { EventEmitter, Output } from '@angular/core';",
      }),
    ],
    ['@angular-eslint/prefer-output-readonly', component('  saved = output<string>();')],
    [
      '@angular-eslint/prefer-host-metadata-property',
      component("  @HostListener('click') protected press(): void {}", {
        imports: "import { HostListener } from '@angular/core';",
      }),
    ],
    [
      '@angular-eslint/computed-must-return',
      component(
        '  protected readonly count = signal(0);\n  protected readonly read = computed(() => { this.count(); });',
      ),
    ],
    [
      '@angular-eslint/no-uncalled-signals',
      component(
        '  protected readonly count = signal(0);\n  protected isSet(): boolean { return this.count ? true : false; }',
      ),
    ],
    [
      '@angular-eslint/component-max-inline-declarations',
      component('', { metadata: inlineTemplate(31) }),
    ],
    [
      '@angular-eslint/relative-url-prefix',
      component('', { metadata: "templateUrl: 'probe.html'," }),
    ],
    [
      'no-restricted-imports',
      component('', {
        imports: "import { CommonModule } from '@angular/common';",
        metadata: "template: '', imports: [CommonModule],",
      }),
    ],
  ])('reports %s in a component', async (rule, code) => {
    expect(await ruleIds(code, componentFile)).toContain(rule);
  });

  it.each([
    ['@angular-eslint/template/prefer-class-binding', '<p [ngClass]="{ on: true }"></p>'],
    ['@angular-eslint/template/prefer-style-binding', '<p [ngStyle]="{ color: \'red\' }"></p>'],
    ['@angular-eslint/template/prefer-ngsrc', '<img src="logo.png" alt="qando" />'],
  ])('reports %s in a template', async (rule, html) => {
    expect(await ruleIds(html, templateFile)).toContain(rule);
  });

  it('accepts class and style bindings in a template', async () => {
    expect(
      await ruleIds('<p [class.on]="true" [style.color]="\'red\'"></p>', templateFile),
    ).toEqual([]);
  });
});

// Tests replace only the system's edges, by injection; and a type is either checked or parsed,
// never invented by asserting through `unknown`. Checked in every workspace's tests and code.
describe('honest tests and types', () => {
  const files = [
    'apps/web/src/app/features/vote/vote-page.spec.ts',
    'apps/api/src/app.test.ts',
    'packages/domain/src/index.ts',
  ];

  async function messages(code, filePath) {
    const [result] = await eslint.lintText(`${code}\nexport {};\n`, { filePath });
    return result.messages.filter((message) =>
      ['no-restricted-properties', 'no-restricted-syntax'].includes(message.ruleId),
    );
  }

  describe.each(files)('in %s', (filePath) => {
    it.each([
      ["import { vi } from 'vitest';\nvi.mock('./clock');", 'vi.mock'],
      ["import { vi } from 'vitest';\nvi.doMock('./clock', () => ({}));", 'vi.doMock'],
      [
        "import { vi } from 'vitest';\nvi.unstable_mockModule('./clock', () => ({}));",
        'vi.unstable_mockModule',
      ],
      ['export const n = 1 as unknown as string;', 'as unknown as'],
      ['export const n = (1 as unknown) as string;', 'as unknown as'],
      ['export const n = <string>(<unknown>1);', '<T><U>'],
      ['export const n = <string>(1 as unknown);', 'mixed'],
    ])('rejects %s', async (code) => {
      const found = await messages(code, filePath);
      expect(found).toHaveLength(1);
      expect(found[0].message).toMatch(/instead/);
    });

    it.each([
      'export const days = [1, 2] as const;',
      'export const days = ([1, 2] as const) as readonly number[];',
      'export const box = ({} as Record<string, number>);',
      "import { vi } from 'vitest';\nexport const spy = vi.fn();",
    ])('allows %s', async (code) => {
      expect(await messages(code, filePath)).toEqual([]);
    });
  });
});

// The shared packages hold qando's rules and the shape on the wire, so they must not depend on a
// framework, the database or an app. These tests lint code through the real `eslint.config.js`,
// placed at an existing file of each package so the type-aware rules can resolve it.
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const sharedFiles = ['packages/domain/src/index.ts', 'packages/contracts/src/index.ts'];

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

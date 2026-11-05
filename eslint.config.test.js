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
];

const allowed = ["import { z } from 'zod';", "import { describe } from 'vitest';"];

let eslint;
beforeAll(() => {
  eslint = new ESLint({ cwd: import.meta.dirname });
});

async function restrictedImports(code, filePath) {
  const [result] = await eslint.lintText(`${code}\nexport {};\n`, { filePath });
  return result.messages.filter((message) => message.ruleId === 'no-restricted-imports');
}

describe.each(sharedFiles)('imports in %s', (filePath) => {
  it.each(forbidden)('rejects %s', async (code) => {
    expect(await restrictedImports(code, filePath)).toHaveLength(1);
  });

  it.each(allowed)('allows %s', async (code) => {
    expect(await restrictedImports(code, filePath)).toEqual([]);
  });
});

it('leaves the apps free to use their frameworks', async () => {
  const code = "import express from 'express';";
  expect(await restrictedImports(code, 'apps/api/src/app.ts')).toEqual([]);
});

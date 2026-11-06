// Acceptance tests: the Gherkin features in features/ run with playwright-bdd.
//   npm run e2e                                  starts the API and the web locally
//   E2E_BASE_URL=https://qando.app npm run e2e   runs against a deployed URL, starts nothing
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const baseURL = process.env.E2E_BASE_URL;
const ci = Boolean(process.env.CI);

const testDir = defineBddConfig({
  // A story's feature joins this list in the story's first pull request (outside-in). Scenarios not
  // built yet carry @wip and run as expected to fail (steps/pending.hooks.ts); the other features
  // are the stories still to build.
  features: ['features/smoke.feature', 'features/hu06-vote.feature'],
  steps: 'steps/**/*.ts',
  // Steps are written with the scenario that uses them, so a pending scenario may still have
  // undefined steps: it fails when run (expected while @wip), not when the tests are generated.
  missingSteps: 'fail-on-run',
});

export default defineConfig({
  testDir,
  globalSetup: './global-setup.ts',
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: baseURL ?? 'http://localhost:4200',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  // Locally and in CI: the API (DATABASE_URL from the environment) and the web dev server, which
  // forwards /api to the API like the deployed site does.
  webServer: baseURL
    ? []
    : [
        {
          name: 'api',
          command: 'npx tsx --conditions=@qando/source apps/api/src/main.ts',
          cwd: '..',
          port: 3000,
          reuseExistingServer: !ci,
        },
        {
          name: 'web',
          command: 'npm run start --workspace @qando/web -- --port 4200',
          cwd: '..',
          url: 'http://localhost:4200',
          reuseExistingServer: !ci,
          timeout: 120_000,
        },
      ],
});

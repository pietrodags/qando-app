// Acceptance tests: the Gherkin features in features/ run with playwright-bdd.
//   npm run e2e                                  starts the API and the web locally
//   E2E_BASE_URL=https://qando.app npm run e2e   runs against a deployed URL, starts nothing
// Layout checks (layout/) run beside the features, in their own project.
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const baseURL = process.env.E2E_BASE_URL;

/** The widths of the design's breakpoints: phone, tablet and desktop. */
const WIDTHS = [
  { name: 'phone', width: 375 },
  { name: 'tablet', width: 768 },
  { name: 'desktop', width: 1280 },
];
const ci = Boolean(process.env.CI);

const testDir = defineBddConfig({
  // A story's feature joins this list in the story's first pull request (outside-in). Scenarios not
  // built yet carry @wip and run as expected to fail (steps/pending.hooks.ts); the other features
  // are the stories still to build.
  // Against a deployed URL only the smoke feature runs: the others store their events in the
  // database and move the API's clock, which only local and CI runs allow.
  features: baseURL
    ? ['features/smoke.feature']
    : [
        'features/smoke.feature',
        'features/hu06-vote.feature',
        'features/hu07-results.feature',
        'features/hu08-confirm-date.feature',
      ],
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
  // Every test runs at the three widths the design is checked at (phone, tablet, desktop): the
  // features in Chromium, and the rendered layout no unit test can measure (jsdom lays nothing
  // out) in plain Playwright tests that answer the API themselves, so they store nothing and run
  // against any URL.
  projects: WIDTHS.flatMap(({ name, width }) => {
    const use = { ...devices['Desktop Chrome'], viewport: { width, height: 800 } };
    return [
      { name, use },
      { name: `layout ${name}`, testDir: './layout', use },
    ];
  }),
  // Locally and in CI: the API (DATABASE_URL from the environment) on the test clock and the web
  // dev server, which forwards /api to the API like the deployed site does.
  webServer: baseURL
    ? []
    : [
        {
          name: 'api',
          // The test clock lets each request name the time the API reads (steps/fixtures.ts). Never
          // reused: a development API already on the port would ignore the scenarios' times, so
          // the run stops instead ("port 3000 is already used"); stop that API first.
          command: 'QANDO_TEST_CLOCK=on npx tsx --conditions=@qando/source apps/api/src/main.ts',
          cwd: '..',
          port: 3000,
          reuseExistingServer: false,
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

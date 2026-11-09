# qando

qando helps a group find a date that works for everyone. The organizer proposes dates and times and shares a link; participants vote without creating an account; the organizer reads the results and confirms the date.

Work in progress: v1 is delivered on 2026-11-23. Planning and design documents are in [`docs/`](docs/README.md); the work is tracked on the [GitHub Project](https://github.com/users/pietrodags/projects/1).

## Run it locally

Requires Node.js 26 (see `.nvmrc`; 24.15+ also works) and npm 11.

```sh
npm ci          # install every workspace
npm run build   # build domain, contracts, api and web
npm test        # run the unit tests of every workspace
npm run mutation  # mutation testing of every workspace (StrykerJS)
npm run e2e     # acceptance tests: the Gherkin features in a browser (see below)
npm run check   # format check, lint, type-check and the code guide check (run before every pull request)
npm run check:guide # only the code guide check: docs/code-guide.md against the code
npm run lint:fix    # apply ESLint autofixes
npm run format      # format with Prettier (Markdown and Gherkin are left as written)
npm run start:api   # API on http://localhost:3000 (PORT to change it)
npm run start:web   # web app on http://localhost:4200 (proxies /api to the API)
```

The API reads `DATABASE_URL` (a PostgreSQL connection string); without it, `GET /api/health` reports the database as down. It does not start without `BETTER_AUTH_SECRET` (signs the session cookies, at least 32 random characters) and `BETTER_AUTH_URL` (the public address of the pages, which sessions are trusted from); `start:api` and `npm run e2e` set local values for both (`http://localhost:4200`, the web dev server that forwards `/api`), and Render generates the secret. Sign-in codes go out through the SMTP server of `SMTP_HOST`, `SMTP_PORT` (587 by default), `SMTP_SECURE` (TLS required unless `false`, for a local SMTP sink without a certificate), `SMTP_USER` and `SMTP_PASSWORD` (both or neither) and `MAIL_FROM` (the sender, `qando <no-reply@qando.app>` by default); without `SMTP_HOST` the API warns at start and every code fails to be delivered (`502`). `render.yaml` sets the host, port and sender; the user and password are set by hand in Render.

### API contract

Every endpoint is defined once in `packages/contracts` with its Zod schemas: the API serves them, the web uses their types, and the OpenAPI document is generated from them. Browse it with Swagger UI at `/api/docs` (`http://localhost:3000/api/docs`, or `https://qando.app/api/docs`); the raw document is at `/api/openapi.json`. A test fails if the API does not serve an endpoint of the contract or answers it outside its schemas.

Workspace packages export their TypeScript sources under the `@qando/source` condition, so type-checking, tests and `start:api` use the packages without building them first; builds and production use the compiled `dist`.

### Acceptance tests

The stories' Gherkin features in `e2e/features` run in Chromium with [playwright-bdd](https://vitalets.github.io/playwright-bdd/); step definitions live in `e2e/steps`. A feature runs once its story is being built (the list in `e2e/playwright.config.ts`); `smoke.feature` checks that the web, the API and the database work together.

```sh
npx playwright install chromium               # once per computer (in e2e/)
DATABASE_URL=postgres://... npm run e2e       # starts the API and the web, then runs the features
E2E_BASE_URL=https://qando.app npm run e2e    # runs them against a deployed version, starts nothing
```

Locally and in CI the run first applies the migrations to `DATABASE_URL`, and the steps store each scenario's events straight in it (`@qando/api/seed`, the same code as `db:seed`); against a deployed URL only `smoke.feature` runs and nothing is stored. Locally, servers already running on ports 3000 and 4200 are reused. CI runs the features on every pull request against a PostgreSQL service and attaches the HTML report when one fails.

### Mutation testing

StrykerJS mutates the code of each workspace and runs its unit tests against every mutant. A run fails below the threshold of its workspace: **85 %** for `packages/domain`, **70 %** for the rest (`stryker.config.mjs` in each workspace, shared settings in `stryker.base.mjs`). Runs are incremental: only changed code and its tests are mutated again, the rest is reused from `reports/stryker-incremental.json`. The HTML report is written to `reports/mutation/mutation.html`; in CI each workspace is a job of its own and its report is attached to the run. The web's is split in four parallel parts, each held to the threshold on its own: `STRYKER_PART=2 npm run mutation` in `apps/web` runs one part locally, without it every file is mutated.

Not mutated: process entry points (`main.ts`, `migrate.ts`, `seed.ts`) and the code covered only by integration tests (`apps/api/src/db/migrate.ts`, `schema.ts`, the repositories, `src/seed/seed-event.ts` and `src/seed/index.ts`). StrykerJS cannot drive `ng test` yet, so in `apps/web` it builds the specs with `ng test --dump-virtual-files` and runs the compiled files with `vitest-stryker.config.mts`, which mirrors the settings of the Angular CLI.

### Database

The schema lives in `apps/api/src/db/schema.ts` (Drizzle); every change becomes a versioned SQL migration in `apps/api/drizzle/`, reviewed in the pull request.

```sh
npm run db:generate --workspace @qando/api   # write the migration for the schema changes
npm run db:migrate --workspace @qando/api    # apply pending migrations to DATABASE_URL
npm run db:seed --workspace @qando/api       # add the demo events to DATABASE_URL and print their links
npm run test:integration                     # integration tests against a PostgreSQL server
```

`db:seed` adds five demo events dated from the day it runs, one per state the pages show (open, open and anonymous, closed pending confirmation, confirmed, cancelled), with votes, and prints the links that open them (vote, results, manage, each vote's edit link) built on `QANDO_WEB_URL` (`http://localhost:4200` by default; `https://qando.app` with the production database). Each run adds new events and never changes earlier ones.

Integration tests need `TEST_DATABASE_URL`, a PostgreSQL 18 server where they may create and drop databases (e.g. `postgres://postgres:postgres@localhost:5432/postgres`); each test file gets its own empty database. CI runs them against a PostgreSQL service.

| Workspace | Path | What |
|---|---|---|
| `@qando/domain` | `packages/domain` | Pure domain logic, no framework or database |
| `@qando/contracts` | `packages/contracts` | Schemas and types shared by API and web |
| `@qando/api` | `apps/api` | Express API (TypeScript) |
| `@qando/web` | `apps/web` | Angular 22 web app (zoneless, Vitest) |
| `@qando/e2e` | `e2e` | Acceptance tests: Gherkin features (one per user story) run with playwright-bdd |
| — | `docs` | Stories, sitemap, diagrams, API contract, mockups, backlog |

## Deployment

[`render.yaml`](render.yaml) describes the production stack on Render, in Frankfurt: the web at `https://qando.app` as a static site on Render's CDN (it forwards `/api/*` to the API, so both share one public URL), the API as a Node web service and a managed PostgreSQL database. Every push to `main` deploys once the CI checks pass; pending migrations are applied before the new API version starts, and a failed migration stops the deploy.

## Copyright

Copyright © 2026 Pietro D'Agostino. All rights reserved. The source is public for reference only: no licence is granted to use, copy, modify or distribute it.

# qando

qando helps a group find a date that works for everyone. The organizer proposes dates and times and shares a link; participants vote without creating an account; the organizer reads the results and confirms the date.

Work in progress: v1 is delivered on 2026-11-23. Planning and design documents are in [`docs/`](docs/README.md); the work is tracked on the [GitHub Project](https://github.com/users/pietrodags/projects/1).

## Run it locally

Requires Node.js 26 (see `.nvmrc`; 24.15+ also works) and npm 11.

```sh
npm ci          # install every workspace
npm run build   # build domain, contracts, api and web
npm test        # run the unit tests of every workspace
npm run check   # format check, lint and type-check (run before every pull request)
npm run lint:fix    # apply ESLint autofixes
npm run format      # format with Prettier (Markdown and Gherkin are left as written)
npm run start:api   # API on http://localhost:3000 (PORT to change it)
npm run start:web   # web app on http://localhost:4200 (proxies /api to the API)
```

The API reads `DATABASE_URL` (a PostgreSQL connection string); without it, `GET /api/health` reports the database as down.

### Database

The schema lives in `apps/api/src/db/schema.ts` (Drizzle); every change becomes a versioned SQL migration in `apps/api/drizzle/`, reviewed in the pull request.

```sh
npm run db:generate --workspace @qando/api   # write the migration for the schema changes
npm run db:migrate --workspace @qando/api    # apply pending migrations to DATABASE_URL
npm run test:integration                     # integration tests against a PostgreSQL server
```

Integration tests need `TEST_DATABASE_URL`, a PostgreSQL 18 server where they may create and drop databases (e.g. `postgres://postgres:postgres@localhost:5432/postgres`); each test file gets its own empty database. CI runs them against a PostgreSQL service.

| Workspace | Path | What |
|---|---|---|
| `@qando/domain` | `packages/domain` | Pure domain logic, no framework or database |
| `@qando/contracts` | `packages/contracts` | Schemas and types shared by API and web |
| `@qando/api` | `apps/api` | Express API (TypeScript) |
| `@qando/web` | `apps/web` | Angular 22 web app (zoneless, Vitest) |
| — | `e2e/features` | Acceptance tests in Gherkin, one feature per user story |
| — | `docs` | Stories, sitemap, diagrams, API contract, mockups, backlog |

## Deployment

[`render.yaml`](render.yaml) describes the production stack on Render, in Frankfurt: the web at `https://qando.app` as a static site on Render's CDN (it forwards `/api/*` to the API, so both share one public URL), the API as a Node web service and a managed PostgreSQL database. Every push to `main` deploys once the CI checks pass; pending migrations are applied before the new API version starts, and a failed migration stops the deploy.

## Copyright

Copyright © 2026 Pietro D'Agostino. All rights reserved. The source is public for reference only: no licence is granted to use, copy, modify or distribute it.

# Code guide

A map of the code of qando: where each part lives, the words it uses, what the main flows go through and, folder by folder, what each piece does and the functions it offers to the rest of the code.

## How this guide is written

The guide is one file with a strict shape, so that a person or a tool can split it into one `README.md` per folder (a mirror of the repository) and find what they need without reading the whole of it.

- **Top-level sections.** *Index*, *Glossary* and *Flows* describe the whole project; they become the mirror's root `README.md`, `GLOSSARY.md` and `FLOWS.md`.
- **One section per folder.** Under *Folders*, each folder of the repository has a section whose heading is its exact path (`` ### `apps/web/src/app/features/vote` ``); the section becomes that folder's `README.md`. Generated or local-only folders (`node_modules`, `dist`, `reports`, `test-results`, `.angular`, `e2e/.features-gen`, `apps/api/drizzle/meta`) have none.
- **Every folder section has the same parts, in this order**: **Summary** (one line, the one the index shows), **Purpose**, then whichever of **Contents** (sub-folders and files), **Components**, **Exports** apply, then **Depends on** and **Used by** (paths of other folders).
- **Each section stands alone.** It never says "see above"; another piece is named by its path.
- **Only the public interface.** A folder lists what other folders use (exported functions, classes, types, components with their inputs and outputs); private helpers are left to the code. An Angular component is one entry, whatever files (`.ts`, `.html`, `.scss`, `.spec.ts`) it has.
- **Kept current.** The pull request that adds, removes or changes a public piece updates its section here. `npm run check` (and so CI) fails when a folder has no section, a section names a folder that no longer exists, a section does not name an export of its folder, or a component's row does not name one of its inputs, outputs or models (`tools/guide-check`). It checks that each piece is named, not that what the guide says of it is true.

## Index

```text
.                              qando: a group finds a date that works for everyone
├── .github/                   GitHub configuration
│   └── workflows/             continuous integration (CI)
├── apps/                      the two deployable applications
│   ├── api/                   REST API (Node.js, Express, PostgreSQL)
│   │   ├── drizzle/           versioned SQL migrations
│   │   └── src/               API source: app wiring, entry points, capability tokens
│   │       ├── db/            database connection, schema, migrations, health probe
│   │       ├── http/          Express pieces every module shares
│   │       ├── modules/       one folder per API resource
│   │       │   ├── docs/          OpenAPI document and Swagger UI
│   │       │   ├── health/        GET /api/health
│   │       │   ├── participations/  cast, read and edit a vote
│   │       │   └── public-events/   read an event by its participation link
│   │       ├── seed/          store whole events: demo data and acceptance tests
│   │       └── test/          helpers for the API's own tests
│   └── web/                   web app (Angular 22)
│       ├── public/            static files served as they are
│       └── src/               web source: entry point, global styles
│           ├── app/           the app shell, routes and every page
│           │   ├── core/      app-wide services
│           │   │   ├── api/       typed access to the API contract
│           │   │   ├── i18n/      translations and tab titles
│           │   │   └── layout/    the header of every page
│           │   ├── features/  one folder per page or flow
│           │   │   ├── create/    temporary home page (service status)
│           │   │   ├── not-found/ unknown address
│           │   │   └── vote/      the voting page
│           │   └── shared/    pieces several pages use
│           │       └── ui/        small UI components and directives
│           ├── i18n/          translation catalogues
│           └── styles/        design tokens, base styles and their checks
├── packages/                  code shared by the API and the web
│   ├── contracts/             the API contract
│   │   └── src/               endpoints, Zod schemas, OpenAPI generation
│   │       ├── health/            the health endpoint
│   │       └── public-events/     endpoints opened with a participation link
│   └── domain/                business rules
│       └── src/               event state and vote rules
├── tools/                     scripts that check the repository
│   └── guide-check/           checks this guide against the code
│       └── src/               the check and its command
├── e2e/                       acceptance tests (Playwright + Gherkin)
│   ├── features/              one Gherkin feature per user story
│   └── steps/                 step definitions and fixtures
└── docs/                      planning and design documents
    └── mockups/               screen mockups
```

## Glossary

The words of the product and the name each one has in the code.

| Term | In the code | Meaning |
|---|---|---|
| Event | `events` table, `PublicEvent`, `StoredPublicEvent` | What an organizer creates so a group can choose a date: a title, the options, a deadline, a time zone. |
| Organizer | `organizerName` | The person who creates the event and later confirms a date. |
| Participant, voter | `participations` table | Anyone who opens the participation link and votes; no account needed. |
| Option | `Option`, `options` table, `optionId` | One thing participants answer: a whole day, a range of days (`endDate`), or a single date with a start time and optionally an end time. |
| Vote, participation | `Participation`, `CastVoteBody`, `MyVote`, `ValidVote` | One participant's answer to every option of an event. Stored as a participation with one vote state per option. |
| Vote state | `VoteState`: `available` · `preferred` · `unavailable` | The answer to one option. At most one option of a vote is `preferred`. |
| Answers | `Answers` (web) | The vote while it is being made on the voting page, one state per option ID. |
| Quick vote | `allAvailable`, `VoteWelcome.quickVote` | Voting every option available in one tap, without going through the steps. |
| Named / anonymous event | `anonymous: boolean` | A named event asks each voter's name (2 to 30 characters); an anonymous one never stores a name (`null`). |
| Deadline | `deadline` | The last day participants can vote, a calendar date in the event's time zone. |
| Closing instant | `closesAt`, `closingInstant` | The last millisecond of the deadline's day in the event's time zone; voting closes then by itself. |
| Event state | `EventState`: `open` · `closed` · `confirmed` | Whether the event accepts votes. Always read through `currentState`, which closes an open event at its closing instant. |
| Confirmation | `confirmations` table | The option the organizer confirmed as the date; final. |
| Cancelled event | `cancelledEvents` table, `EVENT_CANCELLED` | What is left of a cancelled event: its links answer "cancelled" with the title. |
| Capability token | `newCapabilityToken`, `hashCapabilityToken` | A random secret inside a link that grants access without an account. Only its SHA-256 hash is stored. |
| Participation link | `/vote/:eventId`, `publicId` | The link the organizer shares; opens the voting page. Its ID is the event's public ID. |
| Results link | `/results/:resultsId`, `resultsId` | The link to the results page. |
| Management link | `/manage/:eventId` | The organizer's link to manage the event. |
| Vote-edit token | `voteTokenSchema`, `X-Vote-Token` header | The capability to read and edit one vote. The voting page creates it before the first send, so a repeated send never stores a second vote. |
| Private link | `/vote/:eventId/my-vote#t=<token>`, `openMyVoteLink` | The link to edit one's own vote from another browser; carries the vote-edit token. |
| Endpoint, contract | `Endpoint`, `defineEndpoint`, `endpoints` | One HTTP endpoint described once with its Zod schemas; the API serves it, the web calls it, the OpenAPI document is generated from it. |
| Port | `PublicEvents`, `Participations`, `DatabaseCheck` | The interface through which an API module reaches the database; tests replace it with fixed answers. |
| Step, step stack | `Step`, `StepStack` | A page made of steps shown as a stack of cards: the current card, the earlier ones folded into tabs above it. |
| Design token | `_tokens.scss` | A named colour, size, spacing or duration; stylesheets use tokens, never literal values. |
| Demo event, seed | `demoEvents`, `seedEvent` | An event stored straight in the database, for local runs (`npm run db:seed`) and acceptance tests. |
| Test clock | `testClock`, `X-Test-Now` header, `ScenarioClock` | Lets an acceptance scenario set "today" for the browser and the API without touching the system clock. |

## Flows

What each user-visible flow goes through, from the page to the database. Paths are relative to the repository root.

### Open the voting page

1. The participant opens the participation link `/vote/:eventId`; the route (`apps/web/src/app`) loads **`VotePage`** (`apps/web/src/app/features/vote`).
2. `VotePage` reads the event with `apiResource(publicEventEndpoint)` (`apps/web/src/app/core/api`), which calls `GET /api/public/events/{id}` (`packages/contracts/src/public-events`).
3. The API's **`publicEventsRouter`** (`apps/api/src/modules/public-events`) finds the event through the `PublicEvents` port (its repository reads only what participants may see) and answers it with its current state from **`currentState`** (`packages/domain/src`). An unknown link answers `404 NOT_FOUND`, a cancelled event `410 EVENT_CANCELLED` with its title.
4. At the same time, **`MyVotes.stored`** reads the vote this browser holds for the event, if any (`GET …/participations/mine` with its vote-edit token), so the page can say "you already voted" and start from those answers.

### Vote

1. On **`VoteWelcome`** (step 1) the participant types a name on a named event, then either sends a **quick vote** (every option available) or chooses the dates.
2. **`VoteDays`** (step 2) and, in an event with times, **`VoteTimes`** (step 3) change the answers with the functions of `answers.ts` (`toggled`, `withPreferred`, `dayToggled`); all in `apps/web/src/app/features/vote`.
3. **`VoteConfirm`** shows what the answers amount to (`summaryOf`, `packages/domain/src`) and sends them.
4. **`MyVotes.cast`** creates the vote-edit token before the first send and sends `POST /api/public/events/{id}/participations` with it in `X-Vote-Token`.
5. The API's **`participationsRouter`** (`apps/api/src/modules/participations`) checks, inside one transaction that locks the event, that the event is open (`currentState`) and that the vote is valid (`validateVote`), and stores it under the token's hash (`hashCapabilityToken`, `apps/api/src/capability-token.ts`). Sending the same token again stores nothing new and gets the same answer. A closed event answers `409 VOTING_CLOSED`; an invalid vote `400 VALIDATION_FAILED` with every problem.
6. **`VoteThanks`** shows the private link `/vote/:eventId/my-vote#t=<token>`.

### Edit my vote

1. From the same browser, the voting page finds the stored vote (`MyVotes.stored`) and the steps start from its answers (`resumed`).
2. From another browser, the participant opens the private link: **`openMyVoteLink`** hands the token to `MyVotes.claim` and opens the voting page without the token in the address bar.
3. Sending calls `PUT /api/public/events/{id}/participations/mine` with the token; `participationsRouter` replaces the name and every state of that participation. A token of another event answers `403 FORBIDDEN`.

### Check the service

1. `CreatePage` (`apps/web/src/app/features/create`), the temporary home page, calls `GET /api/health` (`packages/contracts/src/health`).
2. **`healthRouter`** (`apps/api/src/modules/health`) asks the database with `SELECT 1` through `createDatabaseCheck` (`apps/api/src/db`) and answers `200` with `database: up` or `503` with `database: down`.

### Store demo and test events

1. `npm run db:seed` (`apps/api/src/seed.ts`) or an acceptance scenario (`e2e/steps`) calls **`seedEvent`** through `openSeeder` (`apps/api/src/seed`).
2. `seedEvent` writes the event, its options, votes and outcome in one transaction and returns its links; `storedVotes` reads the votes back for the tests to check.

## Folders

### `.`

**Summary:** qando: a group finds a date that works for everyone.

**Purpose:** The organizer proposes dates and times and shares a link; participants vote without creating an account; the organizer reads the results and confirms the date. The repository is an npm workspace: two applications, two shared packages and the acceptance tests.

**Contents:**
- `apps/`: the API and the web app.
- `packages/`: the contract and the business rules both applications share.
- `e2e/`: acceptance tests.
- `tools/`: scripts that check the repository.
- `docs/`: planning and design documents, including this guide.
- `.github/`: continuous integration.
- `package.json`: the workspaces and the scripts that run over all of them (`build`, `test`, `mutation`, `e2e`, `check`, `check:guide`).
- `tsconfig.base.json`, `eslint.config.js`, `stryker.base.mjs`: settings every workspace extends.
- `render.yaml`: the deployment on Render.

**Depends on:** —

**Used by:** —

### `.github`

**Summary:** GitHub configuration.

**Purpose:** Holds what GitHub runs on the repository.

**Contents:** `workflows/`.

**Depends on:** —

**Used by:** —

### `.github/workflows`

**Summary:** Continuous integration (CI).

**Purpose:** `ci.yml` runs three jobs on every pull request and push: format, lint, type-check, unit and integration tests and the build; the acceptance tests against a PostgreSQL service; and mutation testing, one job per workspace, failing below its threshold.

**Contents:** `ci.yml`.

**Depends on:** `apps`, `packages`, `e2e` (through the npm scripts).

**Used by:** —

### `apps`

**Summary:** The two deployable applications.

**Purpose:** The API and the web app, deployed separately; the web reaches the API under `/api`.

**Contents:** `api/`, `web/`.

**Depends on:** `packages/contracts`, `packages/domain`.

**Used by:** `e2e`.

### `apps/api`

**Summary:** REST API (Node.js, Express, PostgreSQL).

**Purpose:** Serves every endpoint of the contract, stores events and votes in PostgreSQL with Drizzle, and enforces the business rules whatever the client sends.

**Contents:**
- `src/`: the source.
- `drizzle/`: the SQL migrations.
- `drizzle.config.ts`: where drizzle-kit reads the schema and writes migrations.
- `vitest.config.ts`, `vitest.stryker.config.ts`, `stryker.config.mjs`: unit tests and mutation testing.

**Depends on:** `packages/contracts`, `packages/domain`.

**Used by:** `apps/web` (over HTTP), `e2e` (seeds events through `apps/api/src/seed`).

### `apps/api/drizzle`

**Summary:** Versioned SQL migrations.

**Purpose:** Each schema change in `apps/api/src/db/schema.ts` becomes a numbered SQL file here (`npm run db:generate --workspace @qando/api`), reviewed in its pull request and applied in order before every deploy.

**Contents:** `0000_baseline.sql`, `0001_events_options_participations_votes.sql`, `0002_confirmations_cancelled_events.sql`; `meta/` (drizzle-kit's journal, generated).

**Depends on:** `apps/api/src/db`.

**Used by:** `apps/api/src/db` (`runMigrations`).

### `apps/api/src`

**Summary:** API source: app wiring, entry points and capability tokens.

**Purpose:** Builds the Express app from its modules and its edges (database ports, clock, error log), and starts it.

**Contents:** `db/`, `http/`, `modules/`, `seed/`, `test/`; the files below.

**Exports:**

| Export | What it does |
|---|---|
| `createApp(dependencies)` (`app.ts`) | Builds the Express app: mounts health, the rate limit on capability endpoints, public events, participations, docs and the error boundary, in that order. |
| `AppDependencies` (`app.ts`) | The app's edges: `checkDatabase`, `publicEvents`, `participations`, `now` (the clock) and `logError`. |
| `newCapabilityToken()` (`capability-token.ts`) | A new capability token: 128 random bits in base64url (22 characters, safe in a link). |
| `hashCapabilityToken(token)` (`capability-token.ts`) | What is stored of a token: its SHA-256 in hex, so a copy of the database opens nothing. |

Entry points (no exports): `main.ts` starts the API on `PORT` with `DATABASE_URL` (and the test clock under `QANDO_TEST_CLOCK=on`); `migrate.ts` applies the migrations before every deploy; `seed.ts` stores the demo events and prints their links.

**Depends on:** `apps/api/src/db`, `apps/api/src/http`, `apps/api/src/modules`, `packages/contracts`.

**Used by:** —

### `apps/api/src/db`

**Summary:** Database connection, schema, migrations and health probe.

**Purpose:** Everything that touches PostgreSQL directly besides the repositories. The schema guards what must never be stored whatever the code does: links that collide, a vote for another event's option, two preferred options, degenerate date or time ranges.

**Exports:**

| Export | What it does |
|---|---|
| `events`, `options`, `participations`, `votes`, `confirmations`, `cancelledEvents` (`schema.ts`) | The Drizzle tables, one per stored concept, with their constraints. |
| `eventState`, `voteState` (`schema.ts`) | The PostgreSQL enums of event states and vote states. |
| `eventsRelations`, `optionsRelations`, `participationsRelations`, `votesRelations`, `confirmationsRelations` (`schema.ts`) | The relations Drizzle's queries follow. |
| `Database`, `createDatabase(pool)` (`database.ts`) | The typed Drizzle database over a `pg` pool, as the repositories query it. |
| `runMigrations(pool)`, `migrationsFolder` (`migrate.ts`) | Applies the migrations not run yet, in order, each in a transaction. |
| `createDatabaseCheck(database, timeoutMs)`, `Queryable` (`database-check.ts`) | Probes the database with `SELECT 1`; a failure or an answer slower than 2 s counts as down. |
| `optionFromRow(row)` (`option-row.ts`) | Turns an option row into the contract's `Option`: an end date makes a range, times become `HH:MM`. |

**Depends on:** `apps/api/drizzle`, `packages/contracts`.

**Used by:** `apps/api/src`, `apps/api/src/modules/participations`, `apps/api/src/modules/public-events`, `apps/api/src/seed`.

### `apps/api/src/http`

**Summary:** Express pieces every module shares.

**Purpose:** Reading requests against the contract, answering failures, limiting requests to capability links, and the plumbing around them.

**Exports:**

| Export | What it does |
|---|---|
| `readRequest(endpoint, request)` (`read-request.ts`) | Parses a request's path, headers and body with the endpoint's schemas. Problems name where each broken part travels and its path, never its value (it may be a token or personal data). |
| `routePath(endpoint)` (`route-path.ts`) | The Express route of a contract path: `/api/events/{id}` → `/api/events/:id`. |
| `errorBoundary(log)` (`error-boundary.ts`) | The last middleware: a request Express could not read is a `400`, any other failure a `500` in the shared error body, logged without anything that could carry a link, a token or personal data. |
| `ErrorLog`, `ErrorLogEntry`, `logToStandardError` (`error-boundary.ts`) | What a failure log holds, and the log that writes it as one JSON line on standard error. |
| `capabilityRateLimit()` (`rate-limit.ts`) | 60 requests a minute per client address over every capability endpoint together; beyond, `429 RATE_LIMITED` with `Retry-After`, before any database work. |
| `trustedProxies` (`trusted-proxies.ts`) | The proxy ranges between a client and the API, so `request.ip` is the client's real address. |
| `testClock(realNow)`, `TestClock` (`test-clock.ts`) | The acceptance tests' clock: a request may name the time the API reads with `X-Test-Now`. Mounted only under `QANDO_TEST_CLOCK=on`. |

**Depends on:** `packages/contracts`.

**Used by:** `apps/api/src`, `apps/api/src/modules/participations`, `apps/api/src/modules/public-events`.

### `apps/api/src/modules`

**Summary:** One folder per API resource.

**Purpose:** Each module is a router built from a port (its view of the database) and the clock; the repository behind the port lives in the same folder. Routers never touch the database directly, so their unit tests replace the port.

**Contents:** `docs/`, `health/`, `participations/`, `public-events/`.

**Depends on:** `apps/api/src/http`, `apps/api/src/db`, `packages/contracts`, `packages/domain`.

**Used by:** `apps/api/src`.

### `apps/api/src/modules/docs`

**Summary:** The OpenAPI document and Swagger UI.

**Purpose:** Serves `/api/openapi.json`, generated from the contract, and Swagger UI at `/api/docs` to browse it.

**Exports:**

| Export | What it does |
|---|---|
| `docsRouter()` (`docs.ts`) | The router of `/api/openapi.json` and `/api/docs`. |

**Depends on:** `packages/contracts`.

**Used by:** `apps/api/src`.

### `apps/api/src/modules/health`

**Summary:** `GET /api/health`.

**Purpose:** Says whether the API and its database answer, for the hosting's health check and the home page.

**Exports:**

| Export | What it does |
|---|---|
| `healthRouter(checkDatabase)` (`health.ts`) | Answers `200 { status: ok, database: up }` or `503 { status: unavailable, database: down }`. |
| `DatabaseCheck` (`health.ts`) | The port: resolves to true when the database answers. |

**Depends on:** `packages/contracts`.

**Used by:** `apps/api/src`.

### `apps/api/src/modules/participations`

**Summary:** Cast, read and edit a vote.

**Purpose:** Serves the voting page's sends and reads under `/api/public/events/:id/participations`: cast a vote (`POST`), read the vote of a token (`GET …/mine`) and replace it (`PUT …/mine`). Each send runs in one transaction that locks the event, so the organizer cannot close voting or change the options in between; a repeated token stores no second vote.

**Exports:**

| Export | What it does |
|---|---|
| `participationsRouter(participations, now)` (`participations.ts`) | The router of the three endpoints; checks the event is open (`currentState`) and the vote valid (`validateVote`) before storing. |
| `Participations` (`participations.ts`) | The port: `transaction(work)` runs a `Ballot` in one transaction. |
| `Ballot` (`participations.ts`) | The reads and writes of one vote: `event(publicId)` (locked), `participation(tokenHash)`, `add(eventId, tokenHash, vote)`, `replace(eventId, participationId, vote)`. |
| `StoredVotingEvent`, `VotingEventLookup`, `StoredParticipation` (`participations.ts`) | What the port answers: the event found, cancelled or missing; a stored participation. |
| `createParticipations(db)` (`participations-repository.ts`) | The PostgreSQL implementation of the port. |

**Depends on:** `apps/api/src/db`, `apps/api/src/http`, `apps/api/src/capability-token.ts`, `packages/contracts/src/public-events`, `packages/domain/src`.

**Used by:** `apps/api/src`.

### `apps/api/src/modules/public-events`

**Summary:** Read an event by its participation link.

**Purpose:** Serves `GET /api/public/events/:id`: what a participant may see of an event (never the organizer's email, tokens, counts or votes), with its current state.

**Exports:**

| Export | What it does |
|---|---|
| `publicEventsRouter(publicEvents, now)` (`public-events.ts`) | Answers the event with `currentState`, `404 NOT_FOUND` or `410 EVENT_CANCELLED` with its title. |
| `PublicEvents` (`public-events.ts`) | The port: `find(publicId)`. |
| `StoredPublicEvent`, `PublicEventLookup` (`public-events.ts`) | The stored event in the shape participants see, and what a link leads to (found, cancelled, missing). |
| `createPublicEvents(db)` (`public-events-repository.ts`) | The PostgreSQL implementation; reads only the columns participants may see. |

**Depends on:** `apps/api/src/db`, `apps/api/src/http`, `packages/contracts/src/public-events`, `packages/domain/src`.

**Used by:** `apps/api/src`.

### `apps/api/src/seed`

**Summary:** Store whole events: demo data and acceptance tests.

**Purpose:** Writes events straight into the database, until organizers create them through the API. The package entry `@qando/api/seed` (`index.ts`) is what the acceptance tests use; the pool, Drizzle and the migrations stay behind it.

**Exports:**

| Export | What it does |
|---|---|
| `migrateDatabase(url)` (`index.ts`) | Applies the pending migrations to the database at `url`. |
| `openSeeder(url)`, `Seeder` (`index.ts`) | A connection that stores events (`seedEvent`) and reads their votes back (`storedVotes`) until closed. |
| `seedEvent(db, seed)` (`seed-event.ts`) | Stores an event, its options, votes and outcome in one transaction and returns its links and tokens. |
| `EventSeed`, `OptionSeed`, `VoteSeed`, `Outcome`, `SeededEvent` (`seed-event.ts`) | The shape of a seeded event and what seeding it returns. |
| `storedVotes(db, publicId)` (`stored-votes.ts`) | The votes stored for an event, in the shape they are seeded, so a test can check what a vote stored. |
| `demoEvents(today)`, `DemoEvent`, `linksOf(…)` (`demo-events.ts`) | The demo events of `npm run db:seed`, one per state the pages show, dated from `today`, and their labelled links. |

**Depends on:** `apps/api/src/db`, `apps/api/src/capability-token.ts`.

**Used by:** `apps/api/src/seed.ts`, `e2e/steps`.

### `apps/api/src/test`

**Summary:** Helpers for the API's own tests.

**Purpose:** The edges replaced by fixed answers for unit tests, and an empty database per file for integration tests. Never used by production code.

**Exports:**

| Export | What it does |
|---|---|
| `testDependencies(state)`, `TestState`, `TestParticipation` (`test-dependencies.ts`) | `AppDependencies` with in-memory ports and a fixed time. |
| `createFreshDatabase()`, `FreshDatabase` (`fresh-database.ts`) | A database created empty for one test file and dropped afterwards. |
| `testServerUrl()` (`fresh-database.ts`) | The PostgreSQL server of the integration tests, from `TEST_DATABASE_URL`. |

**Depends on:** `apps/api/src`, `apps/api/src/db`.

**Used by:** the API's `*.test.ts` and `*.integration.test.ts` files.

### `apps/web`

**Summary:** Web app (Angular 22).

**Purpose:** The pages people use. Calls the API under `/api` (proxied to `localhost:3000` locally) with the types of the contract.

**Contents:** `src/`, `public/`; `angular.json`, `proxy.conf.json` (sends `/api` to the local API), the Vitest and Stryker settings.

**Depends on:** `packages/contracts`, `packages/domain`.

**Used by:** `e2e`.

### `apps/web/public`

**Summary:** Static files served as they are.

**Purpose:** Files copied unchanged into the build.

**Contents:** `favicon.ico`, `logo.svg`.

**Depends on:** —

**Used by:** `apps/web/src`.

### `apps/web/src`

**Summary:** Web source: entry point and global styles.

**Purpose:** Boots the app and holds what is not a component: translations and styles.

**Contents:** `app/`, `i18n/`, `styles/`; `main.ts` (boots `App` with `appConfig`), `index.html`, `styles.scss` (the global stylesheet), `text-imports.d.ts` (types for files imported as text).

**Depends on:** `apps/web/src/app`.

**Used by:** —

### `apps/web/src/app`

**Summary:** The app shell, the routes and every page.

**Purpose:** The shell every page shares and the table of routes, one per view of the sitemap; views not built yet show the placeholder page.

**Components:**

| Component | Inputs → outputs | What it does |
|---|---|---|
| **`App`** (`app.ts`) | — | The shell: the header, the current page and the toast area. |

**Exports:**

| Export | What it does |
|---|---|
| `routes` (`app.routes.ts`) | Every URL and its page: `/` (home), `/vote/:eventId`, `/vote/:eventId/my-vote` (private link), `/results/:resultsId`, `/manage/:eventId`, `/manage/:eventId/options`, `/sign-in`, `/my-events`, `/profile`, and `**` (not found). Each page loads on demand. |
| `appConfig` (`app.config.ts`) | The app's providers: router with component input binding, HTTP client, translations, tab titles. |

**Depends on:** `apps/web/src/app/core`, `apps/web/src/app/features`, `apps/web/src/app/shared/ui`.

**Used by:** `apps/web/src`.

### `apps/web/src/app/core`

**Summary:** App-wide services.

**Purpose:** What every page relies on and exists once in the app: access to the API, translations, the header.

**Contents:** `api/`, `i18n/`, `layout/`.

**Depends on:** `packages/contracts`.

**Used by:** `apps/web/src/app`, `apps/web/src/app/features`.

### `apps/web/src/app/core/api`

**Summary:** Typed access to the API contract.

**Purpose:** Pages name an endpoint of the contract and get its typed, schema-checked answer; a contract change breaks the build of every page that uses it.

**Exports:**

| Export | What it does |
|---|---|
| `apiResource(endpoint, params)` (`api-resource.ts`) | Reads a GET endpoint as a resource that follows the page: read again when its parameters change; its value is the checked success body. |
| `apiError(endpoint, error)` (`api-resource.ts`) | The documented error answer behind a failed request, typed by its status; undefined when the API was not reached or the answer is not in the contract. |
| `ApiClient` (`api-client.ts`) | `send(endpoint, request)` for the actions a page takes (send a vote): resolves with the checked success body, rejects with the HTTP error. |
| `ApiRequest` (`api-client.ts`) | What a request carries: path parameters, headers and body, typed by the endpoint. |

**Depends on:** `packages/contracts`.

**Used by:** `apps/web/src/app/features/create`, `apps/web/src/app/features/vote`.

### `apps/web/src/app/core/i18n`

**Summary:** Translations and tab titles.

**Purpose:** Transloco with ICU MessageFormat and keyed JSON catalogues; the Spanish catalogue ships with the app so the first page renders without waiting.

**Exports:**

| Export | What it does |
|---|---|
| `provideI18n()` (`provide-i18n.ts`) | The providers of Transloco and its catalogue loader. |
| `I18nTitleStrategy` (`i18n-title-strategy.ts`) | Turns a route's `title` key into the browser tab's "<page> \| qando", or "qando" without a title. |

**Depends on:** `apps/web/src/i18n`.

**Used by:** `apps/web/src/app`.

### `apps/web/src/app/core/layout`

**Summary:** The header of every page.

**Purpose:** The page frame that is not a page.

**Components:**

| Component | Inputs → outputs | What it does |
|---|---|---|
| **`AppHeader`** (`app-header.*`) | — | The logo back to the home page and the sign-in icon. |

**Depends on:** —

**Used by:** `apps/web/src/app`.

### `apps/web/src/app/features`

**Summary:** One folder per page or flow.

**Purpose:** Each folder is a route's page and everything only it uses. Pieces two pages share move to `apps/web/src/app/shared/ui`.

**Contents:** `create/`, `not-found/`, `vote/`.

**Depends on:** `apps/web/src/app/core`, `apps/web/src/app/shared/ui`, `packages/contracts`, `packages/domain`.

**Used by:** `apps/web/src/app`.

### `apps/web/src/app/features/create`

**Summary:** Temporary home page (service status).

**Purpose:** For now, shows that the deployed web reaches the API and the database, and samples the design tokens. The event creation wizard will replace it.

**Components:**

| Component | Inputs → outputs | What it does |
|---|---|---|
| **`CreatePage`** (`create-page.*`), route `/` | — | Calls `GET /api/health` and shows "checking", "up" or "down". |

**Depends on:** `apps/web/src/app/core/api`, `packages/contracts/src/health`.

**Used by:** `apps/web/src/app`.

### `apps/web/src/app/features/not-found`

**Summary:** Unknown address.

**Purpose:** The page of any address that is not a page of the app, such as a link cut short when copied.

**Components:**

| Component | Inputs → outputs | What it does |
|---|---|---|
| **`NotFoundPage`** (`not-found-page.*`), route `**` | — | Says the page does not exist and links back home. |

**Depends on:** —

**Used by:** `apps/web/src/app`.

### `apps/web/src/app/features/vote`

**Summary:** The voting page.

**Purpose:** The page a participant opens with the participation link, from the welcome card to the thank-you screen, including editing an earlier vote from the same browser or from the private link. Each browser guards its votes with its own vote-edit tokens.

**Components:**

| Component | Inputs → outputs | What it does |
|---|---|---|
| **`VotePage`** (`vote-page.*`), route `/vote/:eventId` | `eventId` | Reads the event and the vote this browser holds, walks the voter through the steps as a stack of cards, keeps the name and the answers while the voter goes back and forth, sends the vote and shows the thanks. |
| **`VoteWelcome`** (`vote-welcome.*`), step 1 | `event`, `name` (two-way), `sending`, `quickVoteFailed`, `notice` → `choose`, `quickVote` | Presents the event, asks for the name on named events, says when this browser already voted or the private link holds no vote, and offers the two ways to vote: choose the dates, or the quick vote. |
| **`VoteDays`** (`vote-days.*`), step 2 | `options`, `answers` (two-way) → `back`, `done`, `toTimes` | The proposed days month by month; a tap toggles available ↔ unavailable, a long press or double-click marks the preferred one. In an event with times a day stands for all its times and goes on to step 3, and the mouse over a day (or a long press) previews its times. |
| **`VoteTimes`** (`vote-times.*`), step 3 | `options`, `answers` (two-way), `timeZone` → `back`, `done` | The times of each day still possible, page by page, answered the same way as the days; names the event's time zone when the browser's is another; a column over 10 units scrolls under ︿ ﹀, and on a phone any column too tall for the step's buttons to stay on screen; on a phone a tap on such a column's header or arrows opens its whole day in a modal (`Dialog`), answered the same way. |
| **`VoteConfirm`** (`vote-confirm.*`) | `answers`, `deadline`, `sending`, `failed` → `back`, `send` | The confirmation bubble over the last step: what the answers amount to, and the button that sends them; a failed send is told inside it. |
| **`VoteThanks`** (`vote-thanks.*`) | `organizerName`, `deadline`, `editLink`, `updated` | The thank-you screen, with the private link to edit the vote from another browser, to open or copy. |

**Exports:**

| Export | What it does |
|---|---|
| `MyVotes` (`my-votes.ts`) | What this browser knows of its votes, one vote-edit token per event kept in the browser's storage and shared by its tabs. `stored(eventId)` reads the vote it holds (never fails: what the API cannot answer counts as no vote); `cast(eventId, vote)` sends a new vote or edits the stored one and answers the private link and whether it replaced a vote; `claim(eventId, token)` takes the token of a private link just opened. |
| `StoredVote`, `CastVote` (`my-votes.ts`) | What `stored` and `cast` answer. |
| `VoteNotice` (`vote-welcome.ts`) | What the welcome card tells before the vote: `alreadyVoted` (this browser voted) or `unknownLink` (the private link holds no vote). |
| `openMyVoteLink` (`my-vote-link.ts`), route `/vote/:eventId/my-vote` | Opens the private link: hands its token to `MyVotes` and goes to the voting page, without the token in the address bar or the history. |
| `Answers` (`answers.ts`) | The answer to each option, by option ID, while the vote is being made. |
| `allAvailable(optionIds)` (`answers.ts`) | Where a new vote starts: every option available. |
| `resumed(optionIds, stored)` (`answers.ts`) | Where an edit starts: the stored answers, `available` for options added since, without options the event no longer has. |
| `toggled(answers, optionId)` (`answers.ts`) | A tap: available ↔ unavailable; the preferred option goes back to available. |
| `withPreferred(answers, optionId)` (`answers.ts`) | A long press or double-click: the option becomes the preferred one and the previous one goes back to available. |
| `dayState(answers, optionIds)` (`answers.ts`) | In an event with times, what a day shows: unavailable when all its times are, available otherwise. |
| `dayToggled(answers, optionIds)` (`answers.ts`) | A tap on such a day: all its times unavailable, or all available again. |
| `calendarMonths(options)`, `CalendarMonth`, `CalendarDay` (`calendar-months.ts`) | The months of step 2: every month with a proposed day, Monday first, with ranges drawn as one shape cut at week and month ends. |
| `timePages(…)`, `TimePage`, `TimeColumn`, `TimeBlock` (`time-pages.ts`) | The pages of step 3: one column per day still possible, in the event's order, a few columns per page; each column says how many blocks show before it scrolls (`fold`: 10 units, a time 1, a range of times 2, the whole day 3). |
| `hourPreview(times)`, `HourPreview` (`hour-preview.ts`) | What the preview over a day of step 2 lists: its first four times (`09:00`, `09:00 → 11:00`, `null` for the whole day), each once, and how many more there are. |
| `longDate(isoDate, locale)` (`display.ts`) | `2026-07-01` → "1 de julio de 2026". |
| `capitalised(name, locale)` (`display.ts`) | "ana" → "Ana". |

**Depends on:** `apps/web/src/app/core/api`, `apps/web/src/app/shared/ui`, `packages/contracts/src/public-events`, `packages/domain/src`.

**Used by:** `apps/web/src/app`.

### `apps/web/src/app/shared`

**Summary:** Pieces several pages use.

**Purpose:** Groups the shared UI; a piece moves here once a second page needs it.

**Contents:** `ui/`.

**Depends on:** `apps/web/src/styles`.

**Used by:** `apps/web/src/app`, `apps/web/src/app/features`.

### `apps/web/src/app/shared/ui`

**Summary:** Small UI components and directives.

**Purpose:** Generic pieces with no knowledge of events or votes: loading and error states, the step stack, the toast, the long press, the tooltip, the folded scrolling box and the modal dialog.

**Components:**

| Component | Inputs → outputs | What it does |
|---|---|---|
| **`LoadingState`** (`loading-state.*`) | `message` | A spinner and a message ("Cargando…" by default) while a page waits for its data. |
| **`ErrorState`** (`error-state.*`) | `message`, `retryable` → `retry` | A message when a page could not get its data, with a retry button when trying again can help. |
| **`StepStack`** (`step-stack.*`) | `current` (two-way), `locked` | Steps as a stack of cards: the current card with its label, earlier steps folded into tabs that go back to them; moves the focus to the new card. |
| **`Step`** directive (`step-stack.*`), `ng-template[appStep]` | `appStep` (label), `accent` | One step of a `StepStack`, with the colour of its dot (`StepAccent`). |
| **`Toast`** (`toast.*`) | — | Where the `Toaster`'s messages appear, once in the app shell. |
| **`LongPress`** directive (`long-press.ts`) | → `longPress` | Fires after a finger rests `HOLD_MS` (500 ms) on the element, with a short vibration, and swallows the click that follows; exposes the `holding` class for a progress style. |
| **`Tooltip`** (`tooltip.*`) | `anchor` (an element) | A small white box above the anchor with a stem at its centre, showing what it is given; stays inside its container (the nearest positioned ancestor). Shown while it is in the page. |
| **`ScrollFold`** directive (`scroll-fold.ts`), `[appScrollFold]`, `exportAs: 'appScrollFold'` | `appScrollFold` (how many children show, or `null`), `foldHeight` (the most it may measure, or `null`) | A box as tall as its first children (one at least, as many as fit in `foldHeight`) that scrolls the rest: `back()` / `forward()` move one child, `nextHidden('back' | 'forward')` says which child they would bring into sight, `atStart` / `atEnd` say where it stands, and `folded()` and the class `folded` say it scrolls, for the page's arrows and for its stylesheet to hide the scrollbar. |
| **`Dialog`** (`dialog.*`) | `label` → `closed` | A card over the whole screen on a dark scrim (the browser's modal `<dialog>`), with what it is given and a round ✓ at the bottom; open while it is in the page. The ✓, a tap on the scrim, Escape or back on a phone close it and emit `closed` for the page to remove it. |
| **`PlaceholderPage`** (`placeholder-page.*`) | — (reads the route title) | Stands in for a view of the sitemap until its story is built. |

**Exports:**

| Export | What it does |
|---|---|
| `Toaster` (`toast.ts`) | `show(message)`: a short message at the bottom of the screen for two seconds ("Enlace copiado"), from any page. |
| `StepAccent` (`step-stack.ts`) | The identity colours of a step: `slate`, `blue`, `teal`, `amber`, `salmon`. |
| `HOLD_MS` (`long-press.ts`) | How long the finger rests before a long press fires. |

**Depends on:** `apps/web/src/styles`, `apps/web/src/app/core/i18n`.

**Used by:** `apps/web/src/app`, `apps/web/src/app/features/vote`.

### `apps/web/src/i18n`

**Summary:** Translation catalogues.

**Purpose:** The UI copy as keyed ICU MessageFormat messages; no text is written in a template.

**Contents:** `es.json` (Spanish, shipped with the app).

**Depends on:** —

**Used by:** `apps/web/src/app/core/i18n`.

### `apps/web/src/styles`

**Summary:** Design tokens, base styles and their checks.

**Purpose:** The colours, type, spacing, motion and breakpoints of the app (`docs/design-tokens.md`), and the tests that keep stylesheets on them: text contrast meets WCAG, and component stylesheets use tokens instead of literal values.

**Contents:** `_tokens.scss` (the design tokens), `_base.scss` (element defaults), `_breakpoints.scss` (media query mixins); the test helpers below.

**Exports:**

| Export | What it does |
|---|---|
| `contrastRatio(text, background)` (`contrast.ts`) | The WCAG contrast ratio (1–21) of a text colour, translucent or not, over an opaque background. |
| `parseColor(css)`, `Rgba` (`contrast.ts`) | Reads a hex or `rgb()`/`rgba()` colour. |
| `readCustomProperties(css)` (`contrast.ts`) | The custom properties of a stylesheet with their `var()` references resolved. |
| `literalValues(css)` (`token-usage.ts`) | The colours, lengths and durations written by hand in a stylesheet, which should be tokens. |

These helpers are used only by the tests; they never reach the app bundle.

**Depends on:** —

**Used by:** `apps/web/src`, `apps/web/src/app` (every component stylesheet).

### `packages`

**Summary:** Code shared by the API and the web.

**Purpose:** What both applications must agree on, written once: the contract of the API and the business rules.

**Contents:** `contracts/`, `domain/`.

**Depends on:** —

**Used by:** `apps/api`, `apps/web`.

### `packages/contracts`

**Summary:** The API contract (`@qando/contracts`).

**Purpose:** Every endpoint defined once with its Zod schemas: the API reads requests and answers with them, the web uses their types and checks answers with them, and the OpenAPI document is generated from them. A test fails if the API does not serve an endpoint of the contract or answers outside its schemas.

**Contents:** `src/`; package, TypeScript, Vitest and Stryker settings.

**Depends on:** —

**Used by:** `apps/api`, `apps/web`.

### `packages/contracts/src`

**Summary:** Endpoints, Zod schemas and OpenAPI generation.

**Purpose:** The machinery every endpoint uses, the shared error bodies, and the list of endpoints. `index.ts` re-exports everything the applications import.

**Contents:** `health/`, `public-events/`; the files below.

**Exports:**

| Export | What it does |
|---|---|
| `defineEndpoint(endpoint)`, `Endpoint`, `EndpointResponse`, `HttpMethod` (`endpoint.ts`) | Describes an endpoint (method, path, parameters, headers, body, responses) keeping its literal types. |
| `urlOf(endpoint, params)` (`endpoint.ts`) | The endpoint's path with each `{placeholder}` replaced, URL-encoded. |
| `successBodyOf(endpoint, body)`, `errorResponseOf(endpoint, status, body)`, `isSuccessStatus(status)` (`endpoint.ts`) | Checks a 2xx body against the success schemas (throws if it breaks them); finds the documented error answer of a status. |
| `SuccessBody`, `ErrorResponse`, `ParamsOf`, `HeadersOf`, `RequestBodyOf` (`endpoint.ts`) | The types of an endpoint's answers and request parts. |
| `errorBodySchema(code, shape)` (`error.ts`) | The body every error shares: `{ error: { code, message, details } }`; `code` is what clients branch on. |
| `internalErrorSchema`, `validationFailedSchema`, `fieldProblemSchema`, `rateLimitedSchema`, `rateLimitedResponse` (`error.ts`) | The shared error answers: `500`, `400` naming each broken part (never its value), `429`. |
| `InternalErrorBody`, `ValidationFailedBody`, `FieldProblem`, `RateLimitedBody` (`error.ts`) | The types of those bodies. |
| `endpoints` (`endpoints.ts`) | Every endpoint the API serves; the OpenAPI document lists exactly these. |
| `createOpenApiDocument()` (`openapi.ts`) | Builds the OpenAPI document from the endpoints' schemas. |

**Depends on:** —

**Used by:** `apps/api/src`, `apps/api/src/http`, `apps/api/src/modules`, `apps/web/src/app/core/api`.

### `packages/contracts/src/health`

**Summary:** The health endpoint.

**Purpose:** `GET /api/health`: whether the API and its database answer.

**Exports:**

| Export | What it does |
|---|---|
| `healthEndpoint` (`health.ts`) | The endpoint: `200` up or `503` down. |
| `healthOkSchema`, `healthUnavailableSchema`, `healthResponseSchema`, `HealthResponse` (`health.ts`) | Its two answers. |

**Depends on:** `packages/contracts/src`.

**Used by:** `apps/api/src/modules/health`, `apps/web/src/app/features/create`.

### `packages/contracts/src/public-events`

**Summary:** Endpoints opened with a participation link.

**Purpose:** What a participant can do with the link: read the event, cast a vote, read and edit their own vote with its vote-edit token. All of them are rate-limited and answer `404` for an unknown link and `410` for a cancelled event.

**Exports:**

| Export | What it does |
|---|---|
| `publicEventEndpoint` (`public-event.ts`) | `GET /api/public/events/{id}`: the event as participants see it. |
| `publicEventSchema`, `PublicEvent`, `optionSchema`, `Option` (`public-event.ts`) | The event (never the organizer's email, tokens, counts or votes) and its options. |
| `eventNotFoundSchema`, `eventCancelledSchema` (`public-event.ts`) | `404 NOT_FOUND`; `410 EVENT_CANCELLED` with the title. |
| `castVoteEndpoint` (`cast-vote.ts`) | `POST /api/public/events/{id}/participations` with `X-Vote-Token`: stores a vote; a repeated token gets the same answer. |
| `castVoteBodySchema`, `CastVoteBody`, `castVoteHeadersSchema`, `voteCastSchema`, `VoteCast`, `voteStateSchema`, `voteTokenSchema` (`cast-vote.ts`) | The vote sent (name and one state per option, the new token in `X-Vote-Token`), its answer, the states and the token format. |
| `voteProblemSchema`, `VoteProblemDetail`, `voteRuleProblemSchemas`, `voteRejectedSchema`, `votingClosedSchema` (`cast-vote.ts`) | Why a vote was refused: `400 VALIDATION_FAILED` with every problem, `409 VOTING_CLOSED`. |
| `myVoteEndpoint` (`my-vote.ts`) | `GET …/participations/mine`: the vote stored under the token. |
| `editVoteEndpoint` (`my-vote.ts`) | `PUT …/participations/mine`: replaces it. |
| `myVoteSchema`, `MyVote`, `myVoteHeadersSchema`, `voteForbiddenSchema`, `editVoteProblemSchema`, `EditVoteProblemDetail`, `editVoteRejectedSchema` (`my-vote.ts`) | The stored vote, `403 FORBIDDEN` for a token of another event, and why an edit was refused. |

**Depends on:** `packages/contracts/src`.

**Used by:** `apps/api/src/modules/public-events`, `apps/api/src/modules/participations`, `apps/web/src/app/features/vote`.

### `packages/domain`

**Summary:** Business rules (`@qando/domain`).

**Purpose:** The rules the API and the web must apply the same way, as pure functions with no input or output. The API enforces them; the web uses them to tell the participant about a problem before sending.

**Contents:** `src/`; package, TypeScript, Vitest and Stryker settings (mutation threshold 85 %).

**Depends on:** —

**Used by:** `apps/api`, `apps/web`.

### `packages/domain/src`

**Summary:** Event state and vote rules.

**Purpose:** When an event accepts votes, and what makes a vote valid. `index.ts` re-exports both files.

**Exports:**

| Export | What it does |
|---|---|
| `currentState(event, now)` (`event-state.ts`) | The event's state at `now`: an open event whose closing instant has come is closed, whatever is stored. |
| `closingInstant(deadline, timeZone)` (`event-state.ts`) | The instant voting closes: the last millisecond of the deadline's day in the event's time zone, also on days when the clocks change. |
| `EventState`, `StoredEventState` (`event-state.ts`) | `open` · `closed` · `confirmed`; the stored state and closing instant. |
| `validateVote(event, input)` (`vote.ts`) | Checks a vote against its event and returns either the vote ready to store (name trimmed) or every problem at once: name too short or too long, name on an anonymous event, option missing or unknown, more than one preferred. |
| `isValidVoterName(name)` (`vote.ts`) | Whether a named event accepts the name: 2 to 30 characters once trimmed, counting characters as people see them (an emoji is one). |
| `sameVoterName(stored, typed)` (`vote.ts`) | Whether a typed name is the voter of a stored vote, ignoring case and spaces. |
| `summaryOf(votes)` (`vote.ts`) | What the answers amount to before sending: an option preferred, some available but none preferred, or none possible. |
| `VOTER_NAME_MIN_LENGTH`, `VOTER_NAME_MAX_LENGTH` (`vote.ts`) | The name limits, 2 and 30. |
| `VoteState`, `VotingEvent`, `VoteInput`, `ValidVote`, `VoteProblem`, `VoteValidation`, `VoteSummary` (`vote.ts`) | The types of the rules' inputs and answers. |

**Depends on:** —

**Used by:** `apps/api/src/modules/participations`, `apps/api/src/modules/public-events`, `apps/web/src/app/features/vote`.

### `tools`

**Summary:** Scripts that check the repository.

**Purpose:** Checks that run with `npm run check` and in CI but are part of no application; each is a workspace of its own, with its tests and mutation testing.

**Contents:** `guide-check/`.

**Depends on:** —

**Used by:** `.`

### `tools/guide-check`

**Summary:** Checks this guide against the code.

**Purpose:** `npm run check:guide` (part of `npm run check`) lists, one line each (`✗ <folder>: …`), every folder without a section, every section of a folder that no longer exists, every export a folder's section does not name and every input, output or model a component's row does not name, and fails if there is any. The files are those git knows, so ignored output never counts. It checks presence, not truth.

**Contents:** `src/`; `stryker.config.mjs` (threshold 70 %, `main.ts` not mutated).

**Depends on:** —

**Used by:** `.`, `.github/workflows`.

### `tools/guide-check/src`

**Summary:** The check and its command.

**Purpose:** `guide-check.ts` holds the whole check as a pure function over the guide's text and the repository's files; `main.ts` lists the files with git, reads them, prints the problems and sets the exit code.

**Exports:**

| Export | What it does |
|---|---|
| `guideProblems(guide, paths, read)` (`guide-check.ts`) | Every place where the guide and the code disagree, one line each, in folder order; empty when the guide is up to date. `paths` are the repository's files; `read` is called only for the TypeScript sources the guide must describe (not tests or `.d.ts`). Generated folders need no section, wherever they are; sources are read with the TypeScript parser, so comments and strings never count. |

**Depends on:** —

**Used by:** `tools/guide-check`.

### `e2e`

**Summary:** Acceptance tests (Playwright + Gherkin).

**Purpose:** The user stories as executable scenarios, run in Chromium with playwright-bdd against the real web, API and database. A feature runs once its story is being built (the list in `playwright.config.ts`); scenarios not built yet carry `@wip` and run as expected to fail, so one that starts passing turns the run red until its tag is removed.

**Contents:** `features/`, `steps/`; `playwright.config.ts` (starts the API with the test clock and the web, or targets `E2E_BASE_URL`), `global-setup.ts` (applies the migrations to `DATABASE_URL` before any scenario; `databaseUrl()` reads it, or says how to set it).

**Depends on:** `apps/api/src/seed`, `apps/web`, `apps/api`.

**Used by:** `.github/workflows`.

### `e2e/features`

**Summary:** One Gherkin feature per user story.

**Purpose:** The acceptance criteria of each story (HU01–HU10) written as scenarios, plus a smoke test that the web, the API and the database work together.

**Contents:** `hu01-sign-in-with-code.feature` … `hu10-plain-language-dates.feature`, `smoke.feature`. Running today: `smoke.feature`, `hu06-vote.feature`.

**Depends on:** `e2e/steps`.

**Used by:** `e2e`.

### `e2e/steps`

**Summary:** Step definitions and fixtures.

**Purpose:** What each Gherkin step does in the browser or the database, and the per-scenario state the steps share.

**Contents:** `common.steps.ts` (opening pages and reading what they show), `events.steps.ts` (storing events), `vote.steps.ts` (the voting page), `clock.steps.ts` (setting the scenario's time), `pending.hooks.ts` (the `@wip`, `@m2`, `@m3` handling), `fixtures.ts`.

**Exports:**

| Export | What it does |
|---|---|
| `test` (`fixtures.ts`) | Playwright's `test` extended with the fixtures below, for every step file. |
| `StoredEvents` (`fixtures.ts`) | The events a scenario stored, by title, so later steps open them by the name they read. |
| `ScenarioClock` (`fixtures.ts`) | The scenario's time, frozen in the browser and sent to the API in `X-Test-Now`. |
| `OtherBrowsers` (`fixtures.ts`) | Fresh browsers besides the scenario's own, on the same time and address. |
| `MyVote` (`fixtures.ts`) | The vote the scenario cast through a page, for the steps that come back to it. |
| `localInstant(date, time, timeZone)` (`clock.steps.ts`) | The instant the clocks of a time zone show `time` on `date`; refuses times skipped or repeated by a clock change. |

**Depends on:** `apps/api/src/seed`.

**Used by:** `e2e/features`.

### `docs`

**Summary:** Planning and design documents.

**Purpose:** What v1 does and how it looks: user stories, sitemap, diagrams, API contract, mockups, design tokens, backlog, and this guide. `README.md` lists them.

**Contents:** `README.md`, `user-stories.md`, `sitemap.md`, `diagrams.md`, `api-contract.md`, `mockups.md`, `design-tokens.md`, `backlog.md`, `code-guide.md`; `mockups/`.

**Depends on:** —

**Used by:** —

### `docs/mockups`

**Summary:** Screen mockups.

**Purpose:** The images `docs/mockups.md` shows: the desktop screens and emails, and the changes each story makes to them.

**Contents:** one JPEG per screen or email (`create-1-title-and-name.jpg`, `email-summary.jpg`, …).

**Depends on:** —

**Used by:** `docs`.

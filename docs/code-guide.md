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
│   │       ├── email/         sending email over SMTP
│   │       ├── http/          Express pieces every module shares
│   │       ├── modules/       one folder per API resource
│   │       │   ├── auth/          sign-in by email code, its email, sessions, sign-out (Better Auth)
│   │       │   ├── docs/          OpenAPI document and Swagger UI
│   │       │   ├── health/        GET /api/health
│   │       │   ├── management/      manage an event with its token or its owner's session
│   │       │   ├── participations/  cast, read and edit a vote
│   │       │   ├── public-events/   read an event by its participation link
│   │       │   └── results/         read the results by the results link
│   │       ├── seed/          store whole events: demo data and acceptance tests
│   │       └── test/          helpers for the API's own tests
│   └── web/                   web app (Angular 22)
│       ├── public/            static files served as they are
│       │   └── email/         images the emails show
│       └── src/               web source: entry point, global styles
│           ├── app/           the app shell, routes and every page
│           │   ├── core/      app-wide services
│           │   │   ├── api/       typed access to the API contract
│           │   │   ├── i18n/      translations and tab titles
│           │   │   └── layout/    the header of every page
│           │   ├── dev/       development-only pages (not in production)
│           │   ├── features/  one folder per page or flow
│           │   │   ├── create/    temporary home page (service status)
│           │   │   ├── manage/    the management page
│           │   │   ├── not-found/ unknown address
│           │   │   ├── results/   the results page
│           │   │   └── vote/      the voting page
│           │   └── shared/    pieces several pages use
│           │       └── ui/        small UI components and directives
│           ├── i18n/          translation catalogues
│           ├── styles/        design tokens, base styles and their checks
│           └── test/          helpers for the web's own tests
├── packages/                  code shared by the API and the web
│   ├── contracts/             the API contract
│   │   └── src/               endpoints, Zod schemas, OpenAPI generation
│   │       ├── auth/              the sign-in and sign-out endpoints
│   │       ├── health/            the health endpoint
│   │       ├── management/        endpoints opened with a management token
│   │       ├── public-events/     endpoints opened with a participation link
│   │       └── results/           the results endpoint
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
| Account, owner | `users` table, `ownerId` | An organizer's account, created verified by the first sign-in code of an email; every event belongs to one (its owner). |
| Session | `sessions` table | One signed-in browser of an account, carried by the session cookie. |
| Sign-in code | `verifications` table, `SignInCodes`, `signInCodesOf` | The 6-digit code emailed to sign in: only its hash is stored, valid for 10 minutes and 5 wrong tries; a new one, once delivered, replaces the last. |
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
| Confirmation | `confirmations` table, `confirmOption`, `ALREADY_CONFIRMED` | The option the organizer confirmed as the date; final. |
| Cancelled event | `cancelledEvents` table, `EVENT_CANCELLED` | What is left of a cancelled event: its links answer "cancelled" with the title. |
| Capability token | `newCapabilityToken`, `hashCapabilityToken` | A random secret inside a link that grants access without an account. Only its SHA-256 hash is stored. |
| Participation link | `/vote/:eventId`, `publicId` | The link the organizer shares; opens the voting page. Its ID is the event's public ID. |
| Results link | `/results/:resultsId`, `resultsId` | The link to the results page; the organizer may share it. The participation link never opens the results (`403`). |
| Results | `resultsOf`, `Results`, `resultsEndpoint` | What the votes amount to: the winners (best attendance, then most preferred), the alternatives (as well attended, less preferred), the counts and, on named events, who answered each option each way. Provisional while voting is open, final after. |
| Management link | `/manage/:eventId#t=<token>`, `openManagementLink` | The organizer's link to manage the event; `:eventId` is the participation ID and the token travels in the fragment. |
| Management token | `managementTokenSchema`, `X-Management-Token` header, `management_token_hash`, `EventManagement` (web) | The capability to manage one event, created by the API; only its hash is stored. |
| Acting organizer | `ActingOrganizer`, `actingOrganizer`, `ManagementCredentials` | Whoever a management request acts as, resolved once from its credentials (the management token, the owner's session) before any management use case runs. |
| Recommended options | `recommendedOptionIds` | The options the results recommend (their winners); confirming another one asks first. |
| Vote-edit token | `voteTokenSchema`, `X-Vote-Token` header | The capability to read and edit one vote. The voting page creates it before the first send, so a repeated send never stores a second vote. |
| Private link | `/vote/:eventId/my-vote#t=<token>`, `openMyVoteLink` | The link to edit one's own vote from another browser; carries the vote-edit token. |
| Endpoint, contract | `Endpoint`, `defineEndpoint`, `endpoints` | One HTTP endpoint described once with its Zod schemas; the API serves it, the web calls it, the OpenAPI document is generated from it. |
| Port | `PublicEvents`, `Participations`, `EventResults`, `ManagedEvents`, `DatabaseCheck` | The interface through which an API module reaches the database; tests replace it with fixed answers. |
| Step, step stack | `Step`, `StepStack` | A page made of steps shown as a stack of cards: the current card, the earlier ones folded into tabs above it. |
| Design token | `_tokens.scss` | A named colour, size, spacing or duration; stylesheets use tokens, never literal values. |
| Demo event, seed | `demoEvents`, `seedEvent` | An event stored straight in the database, for local runs (`npm run db:seed`) and acceptance tests. |
| Session | `Sessions`, `sessionReader`, `signedInAccount`, `qando.session_token` cookie | A browser signed in to an account: an HttpOnly cookie Better Auth sets, valid 90 days from its last use. It manages the account's events like their management links; a change sent with it from a page of another site is refused (CSRF). |
| Test clock | `testClock`, `X-Test-Now` header, `ScenarioClock` | Lets an acceptance scenario set "today" for the browser and the API without touching the system clock. |

## Flows

What each user-visible flow goes through, from the page to the database. Paths are relative to the repository root.

### Open the voting page

1. The participant opens the participation link `/vote/:eventId`; the route (`apps/web/src/app`) loads **`VotePage`** (`apps/web/src/app/features/vote`).
2. `VotePage` reads the event with `apiResource(publicEventEndpoint)` (`apps/web/src/app/core/api`), which calls `GET /api/public/events/{id}` (`packages/contracts/src/public-events`).
3. The API's **`publicEventsRouter`** (`apps/api/src/modules/public-events`) finds the event through the `PublicEvents` port (its repository reads only what participants may see) and answers it with its current state from **`currentState`** (`packages/domain/src`). An unknown link answers `404 NOT_FOUND`, a cancelled event `410 EVENT_CANCELLED` with its title.
4. At the same time, **`MyVotes.stored`** reads the vote this browser holds for the event, if any (`GET …/participations/mine` with its vote-edit token), so the page can say "you already voted" and start from those answers.
5. A link that no longer takes votes shows **`VoteEnded`** in place of the steps: closed (saying whether this browser's vote was registered), the confirmed date, or cancelled under the kept title (`410`). A link of no event (`404`, or `400` when malformed) shows **`NotFoundCard`** (`apps/web/src/app/shared/ui`); only a failed request offers to try again (`ErrorState`).

### Vote

1. On **`VoteWelcome`** (step 1) the participant types a name on a named event, then either sends a **quick vote** (every option available) or chooses the dates.
2. **`VoteDays`** (step 2) and, in an event with times, **`VoteTimes`** (step 3) change the answers with the functions of `answers.ts` (`toggled`, `withPreferred`, `dayToggled`); all in `apps/web/src/app/features/vote`.
3. **`VoteConfirm`** shows what the answers amount to (`summaryOf`, `packages/domain/src`) and sends them.
4. **`MyVotes.cast`** creates the vote-edit token before the first send and sends `POST /api/public/events/{id}/participations` with it in `X-Vote-Token`.
5. The API's **`participationsRouter`** (`apps/api/src/modules/participations`) checks, inside one transaction that locks the event, that the event is open (`currentState`) and that the vote is valid (`validateVote`), and stores it under the token's hash (`hashCapabilityToken`, `apps/api/src/capability-token.ts`). Sending the same token again stores nothing new and gets the same answer. A closed event answers `409 VOTING_CLOSED`; an invalid vote `400 VALIDATION_FAILED` with every problem.
6. **`VoteThanks`** shows the private link `/vote/:eventId/my-vote#t=<token>`.
7. A vote refused because voting closed meanwhile (`409`) makes the page read the event again (the steps stay, locked): it turns into the confirmed `VoteEnded` when the organizer confirmed a date, else (or when the read fails) into the closed one. Either says the vote did not arrive in time, or, when `MyVotes.stored` reads a vote stored before, that the changes did not and that vote is kept; a `410` turns it into the cancelled one.

### Edit my vote

1. From the same browser, the voting page finds the stored vote (`MyVotes.stored`) and the steps start from its answers (`resumed`).
2. From another browser, the participant opens the private link: **`openMyVoteLink`** hands the token to `MyVotes.claim` and opens the voting page without the token in the address bar.
3. Sending calls `PUT /api/public/events/{id}/participations/mine` with the token; `participationsRouter` replaces the name and every state of that participation. A token of another event answers `403 FORBIDDEN`.

### Open the results

1. Anyone with the results link opens `/results/:resultsId`; the route (`apps/web/src/app`) loads **`ResultsPage`** (`apps/web/src/app/features/results`).
2. `ResultsPage` reads the results with `apiResource(resultsEndpoint)` (`apps/web/src/app/core/api`), which calls `GET /api/results/{resultsId}` (`packages/contracts/src/results`).
3. The API's **`resultsRouter`** (`apps/api/src/modules/results`) runs **`readResults`**: it finds the event with its votes through the `EventResults` port, works out the winners and alternatives with `resultsOf` (`packages/domain/src`) and adds the names on named events. The participation link answers `403 FORBIDDEN`, a cancelled event `410 EVENT_CANCELLED`, an unknown link `404 NOT_FOUND`.
4. The page names each option with **`OptionLabels`** and draws the bars with **`ResultsChart`**; **`ShareLinks`** (`apps/web/src/app/shared/ui`) shares the link. A `403`, `404` or `400` shows `NotFoundCard`, a `410` the cancelled `VoteEnded`.

### Sign in with an email code

1. A page of qando sends the email to `POST /api/auth/sign-in-code` (`packages/contracts/src/auth`). The API's **`signInRouter`** (`apps/api/src/modules/auth`) first refuses a request from a page of another site, or without `Origin`, with **`ownPagesOnly`** (`apps/api/src/http`): `403 FORBIDDEN`, session or not. Then **`requestLimit`** (`apps/api/src/http`) allows 20 codes an hour per client address and **`sendQuota`** (`apps/api/src/modules/auth`), per email, a new code only after 30 seconds and at most 5 in any hour (a code the email server refused gives its place back, one delivered after the browser left keeps it); beyond, `429 RATE_LIMITED` with `Retry-After`. A broken email answers `400 VALIDATION_FAILED` (`contractBroken`).
2. **`SignInCodes.send`** (`signInCodesOf`, `apps/api/src/modules/auth`) has Better Auth create a 6-digit code for the email, stored hashed, renders it with **`signInCodeEmail`** (the code in the subject; the account's stored name, if it has one) and hands it to the `SendEmail` port, **`smtpEmail`** (`apps/api/src/email`). The answer is `200 { sent: true, resendAfterSeconds: 30 }`; an email server that refused it or could not be reached is logged without its message and answers `502 CODE_NOT_DELIVERED`, and the page may ask again at once; the last delivered code stays the stored one until the new one is delivered, so it is still accepted with its own tries and expiry.
3. The person types the 6 digits of the email; the page sends `POST /api/auth/sign-in` with `{ email, code }`, behind the same `ownPagesOnly` check and at most 30 tries per 15 minutes per address (`429`).
4. **`SignInCodes.signIn`** has Better Auth check the code. The right one uses it up, opens a session (creating the account, already verified, when the email has none) and answers `200 { signedIn: true }` with the session cookie. Otherwise `400`: `WRONG_CODE` with `attemptsLeft` (1 to 4, read from the code Better Auth stores), `CODE_EXPIRED` (it expired, was used, or was never sent) or `TOO_MANY_ATTEMPTS` (void after 5 wrong tries, even for the right code). No answer is cached.

### Open the management page

1. The organizer opens the management link `/manage/:eventId#t=<token>`; the route (`apps/web/src/app`) runs **`openManagementLink`** (`apps/web/src/app/features/manage`), which hands the token to **`EventManagement`** (kept per event in the browser's storage) and opens the page again without it, replacing the entry in the history. Without a token the page opens as it is, with the token the browser held before, if any.
2. **`ManagePage`** reads the event with `EventManagement.read`, which calls `GET /api/events/{id}` (`packages/contracts/src/management`) with the stored management token in `X-Management-Token`; the browser also sends the session cookie, if it is signed in.
3. In front of the management routes, **`sessionReader`** (`apps/api/src/http`) reads the session cookie through the `Sessions` port (`sessionsOf`, `apps/api/src/modules/auth`) and sends back the cookie Better Auth renewed. The API's **`managementRouter`** (`apps/api/src/modules/management`) runs **`readManagedEvent`**, which first resolves the acting organizer with **`actingOrganizer`** from the token and the signed-in account: neither answers `401 UNAUTHENTICATED` without touching the database; credentials that do not manage the event (another event's token, any other link, the session of another account, an unknown event) `403 FORBIDDEN`; a cancelled event `410 EVENT_CANCELLED` with its title.
4. With the organizer resolved, the `ManagedEvents` port reads the event with its votes; the answer carries the current state (`currentState`), the vote count and the recommended options (`resultsOf`, `packages/domain/src`), never cached. Every management endpoint shares the voting endpoints' rate limit.
5. The page shows the title and state, **`FinalDate`** (the choice of the final date, or the confirmed one) and **`EventLinks`**; `401`, `403` and a malformed ID (`400`) show "No tienes acceso a este evento", a `410` the cancelled `VoteEnded` (`apps/web/src/app/features/vote`); only a failed request offers to try again.

### Confirm the final option

1. On the management page, **`FinalDate`** (`apps/web/src/app/features/manage`) confirms the chosen option at once in the usual case (voting closed, a recommended option, votes in); otherwise its question (`Dialog`, `apps/web/src/app/shared/ui`) first says what makes it unusual: nobody voted, nobody can attend any option, not the recommended option, voting will close.
2. **`EventManagement.confirm`** calls `POST /api/events/{id}/confirmation` (`packages/contracts/src/management`) with `{ optionId }` and the management token in `X-Management-Token`.
3. The API's **`managementRouter`** (`apps/api/src/modules/management`) runs **`confirmOption`**, which resolves the acting organizer with **`actingOrganizer`** first (`401`, `403`, `410` as when reading the event). With the session, `sessionReader` (`apps/api/src/http`) first refuses a confirmation sent from a page of another site, or without `Origin`, with `403 FORBIDDEN`.
4. In one transaction (`ManagedEvents.change`), `confirmOption` lower-cases the option ID, locks the event (`EventChange.lock`: votes being stored finish first, later ones wait and then find voting closed) and checks it: another option confirmed already answers `409 ALREADY_CONFIRMED`, the same option again changes nothing, an option that is not the event's `400` with `OPTION_UNKNOWN`. Otherwise `EventChange.confirm` stores the confirmation and the `confirmed` state.
5. The answer is the event as the management page shows it, read by `managedEventFor`; the page then shows the confirmed date. A `409` or `400` (the event changed meanwhile) makes `EventManagement` read the event again, so the page shows the date confirmed meanwhile; a send that fails says so under the button. From then on the participation and results pages show the confirmed option and votes are refused with `409 VOTING_CLOSED`.

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

**Purpose:** `ci.yml` runs three jobs on every pull request and push: format, lint, type-check, unit and integration tests and the build; the acceptance tests against a PostgreSQL service; and mutation testing, one job per workspace, failing below its threshold. The web's runs in four parallel parts (`STRYKER_PART`, files listed in `apps/web/stryker.config.mjs`), each held to the threshold on its own, and one check, *Mutation testing (apps/web)*, passes when all four do.

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

**Purpose:** Builds the Express app from its modules and its edges (database ports, sessions, sign-in codes, clock, error log), and starts it.

**Contents:** `db/`, `email/`, `http/`, `modules/`, `seed/`, `test/`; the files below.

**Exports:**

| Export | What it does |
|---|---|
| `createApp(dependencies)` (`app.ts`) | Builds the Express app: mounts health, sign-in, sign-out, one rate limit shared by every capability endpoint (the session reader behind it on management), public events, participations, results, management, docs and the error boundary, in that order. |
| `AppDependencies` (`app.ts`) | The app's edges: `checkDatabase`, `publicEvents`, `participations`, `results`, `managedEvents`, `sessions` (the `Sessions` port), `signInCodes` (the `SignInCodes` port), `now` (the clock) and `logError`. |
| `newCapabilityToken()` (`capability-token.ts`) | A new capability token: 128 random bits in base64url (22 characters, safe in a link). |
| `hashCapabilityToken(token)` (`capability-token.ts`) | What is stored of a token: its SHA-256 in hex, so a copy of the database opens nothing. |

Entry points (no exports): `main.ts` starts the API on `PORT` with `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` (it refuses to start without the last two; the test clock under `QANDO_TEST_CLOCK=on`), and sends sign-in codes through the SMTP server of `SMTP_HOST`, `SMTP_PORT` (587 by default), `SMTP_SECURE` (TLS required unless `false`, for a local sink), `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` (`qando <no-reply@qando.app>` by default); without `SMTP_HOST` it warns and every delivery fails (`502`); `migrate.ts` applies the migrations before every deploy; `seed.ts` stores the demo events and prints their links.

**Depends on:** `apps/api/src/db`, `apps/api/src/email`, `apps/api/src/http`, `apps/api/src/modules`, `packages/contracts`.

**Used by:** —

### `apps/api/src/db`

**Summary:** Database connection, schema, migrations and health probe.

**Purpose:** Everything that touches PostgreSQL directly besides the repositories. The schema guards what must never be stored whatever the code does: links that collide, a vote for another event's option, two preferred options, degenerate date or time ranges, an event without an owner (an account that owns events cannot be deleted). The account tables are Better Auth's core tables, with its columns, read and written only through `apps/api/src/modules/auth`.

**Exports:**

| Export | What it does |
|---|---|
| `events`, `options`, `participations`, `votes`, `confirmations`, `cancelledEvents` (`schema.ts`) | The Drizzle tables, one per stored concept, with their constraints. |
| `users`, `sessions`, `accounts`, `verifications` (`schema.ts`) | Better Auth's tables: accounts (owners of events), signed-in browsers, ways to prove identity besides the code (empty: qando has none) and pending sign-in codes, stored hashed. |
| `eventState`, `voteState` (`schema.ts`) | The PostgreSQL enums of event states and vote states. |
| `usersRelations`, `sessionsRelations`, `accountsRelations`, `eventsRelations`, `optionsRelations`, `participationsRelations`, `votesRelations`, `confirmationsRelations` (`schema.ts`) | The relations Drizzle's queries follow. |
| `Database`, `createDatabase(pool)` (`database.ts`) | The typed Drizzle database over a `pg` pool, as the repositories query it. |
| `runMigrations(pool)`, `migrationsFolder` (`migrate.ts`) | Applies the migrations not run yet, in order, each in a transaction. |
| `createDatabaseCheck(database, timeoutMs)`, `Queryable` (`database-check.ts`) | Probes the database with `SELECT 1`; a failure or an answer slower than 2 s counts as down. |
| `optionFromRow(row)` (`option-row.ts`) | Turns an option row into the contract's `Option`: an end date makes a range, times become `HH:MM`. |

**Depends on:** `apps/api/drizzle`, `packages/contracts`.

**Used by:** `apps/api/src`, `apps/api/src/modules/auth`, `apps/api/src/modules/participations`, `apps/api/src/modules/public-events`, `apps/api/src/modules/results`, `apps/api/src/seed`.

### `apps/api/src/email`

**Summary:** Sending email over SMTP.

**Purpose:** The edge to the email server (ADR 0011): the port every email goes through and its one implementation with Nodemailer, the same against Scaleway in production and a local SMTP sink in development and tests. What an email says is rendered by its template in the module that sends it; this folder only delivers it.

**Exports:**

| Export | What it does |
|---|---|
| `SendEmail` (`email.ts`) | The port: hands one email to the email server; resolves once the server took it, rejects when it refused it or could not be reached (the error may quote the address, so it is never logged). |
| `EmailContent`, `OutgoingEmail` (`email.ts`) | What an email says (subject, plain text and HTML), and that content with the one address it goes to. |
| `SmtpSettings` (`email.ts`) | The server's host and port, whether TLS is required (implicit on port 465, STARTTLS on any other; off only for a local sink), the user and password (both or neither) and the sender. |
| `smtpEmail(settings)` (`email.ts`) | `SendEmail` over that SMTP server: one connection per email, giving up after 10 seconds to connect and 20 without an answer, so a delivery fits inside a request. |

**Depends on:** —

**Used by:** `apps/api/src`, `apps/api/src/modules/auth`.

### `apps/api/src/http`

**Summary:** Express pieces every module shares.

**Purpose:** Reading requests against the contract, answering failures, limiting requests, reading the session, keeping other sites' pages out, and the plumbing around them.

**Exports:**

| Export | What it does |
|---|---|
| `readRequest(endpoint, request)` (`read-request.ts`) | Parses a request's path, headers and body with the endpoint's schemas, those it declares (an endpoint without path parameters or headers reads them as empty). Problems name where each broken part travels and its path, never its value (it may be a token or personal data). |
| `contractBroken(problems)` (`read-request.ts`) | The `400 VALIDATION_FAILED` body every router answers to a request that breaks the contract: each broken part, never its value. |
| `routePath(endpoint)` (`route-path.ts`) | The Express route of a contract path: `/api/events/{id}` → `/api/events/:id`. |
| `errorBoundary(log)` (`error-boundary.ts`) | The last middleware: a request Express could not read is a `400`, any other failure a `500` in the shared error body, logged without anything that could carry a link, a token or personal data. |
| `ErrorLog`, `ErrorLogEntry`, `logToStandardError` (`error-boundary.ts`) | What a failure log holds, and the log that writes it as one JSON line on standard error. |
| `describeError(error)` (`error-boundary.ts`) | What of an error may be logged: its name, its cause's name and code, its stack frames; never its message, which may quote a query's parameters. |
| `requestLimit(limit)`, `RequestLimit` (`rate-limit.ts`) | Refuses the requests past `limit` in `windowMs` from one client address (IPv6 per /56 network) with `429 RATE_LIMITED` and `Retry-After`, before they reach the route (no database work). The count lives in memory: the API runs as one instance. |
| `answerRateLimited(response, retryAfterSeconds)` (`rate-limit.ts`) | The `429 RATE_LIMITED` answer, never cached, with `Retry-After`; for limits a route applies itself (e.g. `sendQuota`). |
| `capabilityRateLimit()` (`rate-limit.ts`) | `requestLimit` of 60 requests a minute per client address over every capability endpoint together (voting, results and management), as long as the app mounts one instance on all of them. |
| `sessionOriginCheck(sessions)` (`session.ts`) | Refuses a change (any method but `GET`, `HEAD`, `OPTIONS`) carrying the session cookie from a page of another site, or without `Origin`, with `403 FORBIDDEN`, before the session is read (CSRF); a request without the cookie passes. |
| `sessionReader(sessions)` (`session.ts`) | `sessionOriginCheck`, then signs each request in as the account of its session cookie and sends back the cookie renewed while reading it; a request without the cookie reads nothing. Mounted as a list of two handlers. |
| `ownPagesOnly(sessions)` (`session.ts`) | Refuses any request from a page of another site, or without `Origin`, with `403 FORBIDDEN`, session cookie or not: for the routes that sign a browser in, so another site can neither sign the person into an account of its own (login CSRF) nor have codes sent from their browser. |
| `signedInAccount(request)` (`session.ts`) | The account the request is signed in as, once `sessionReader` read it; undefined otherwise. |
| `Sessions`, `SessionRead` (`session.ts`) | The port to the sessions: `carried(headers)` (a session cookie at all, no database work), `trusts(origin)` (a page of qando), `read(headers)` (its account, undefined when it ended, and the renewed cookies to send back), `end(headers)` (deletes the session, then answers the cookies that clear it; rejects when it could not be deleted). |
| `trustedProxies` (`trusted-proxies.ts`) | The proxy ranges between a client and the API, so `request.ip` is the client's real address. |
| `testClock(realNow)`, `TestClock` (`test-clock.ts`) | The acceptance tests' clock: a request may name the time the API reads with `X-Test-Now`. Mounted only under `QANDO_TEST_CLOCK=on`. |

**Depends on:** `packages/contracts`.

**Used by:** `apps/api/src`, `apps/api/src/modules/auth`, `apps/api/src/modules/management`, `apps/api/src/modules/participations`, `apps/api/src/modules/public-events`, `apps/api/src/modules/results`.

### `apps/api/src/modules`

**Summary:** One folder per API resource.

**Purpose:** Each module is a router built from a port (its view of the database) and the clock; the repository behind the port lives in the same folder. Routers never touch the database directly, so their unit tests replace the port.

**Contents:** `auth/`, `docs/`, `health/`, `management/`, `participations/`, `public-events/`, `results/`.

**Depends on:** `apps/api/src/http`, `apps/api/src/db`, `apps/api/src/email`, `packages/contracts`, `packages/domain`.

**Used by:** `apps/api/src`.

### `apps/api/src/modules/auth`

**Summary:** Sign-in by email code and sessions, through Better Auth.

**Purpose:** The only place that knows Better Auth (ADR 0004): its Drizzle adapter on the account tables of `apps/api/src/db` and its email-code plugin. Codes have 6 digits, are stored hashed, last 10 minutes and 5 wrong tries, and a new one replaces the last; the first code an email signs in with creates its account, already verified. Only sign-in codes are sent (qando has no passwords to reset). A session is the cookie `qando.session_token` (`__Secure-qando.session_token` over HTTPS): HttpOnly, SameSite=Lax, Secure over HTTPS, valid 90 days from its last use and renewed at most once a day. Better Auth's Origin check stays on in every environment (it skips it under `NODE_ENV=test` otherwise). None of Better Auth's own routes is served: qando's routes call it behind their own Origin checks (`sessionOriginCheck`, `ownPagesOnly`). Sign-out is ours because Better Auth's logs a failed deletion and still answers success; sending the code is ours so that a failed delivery reaches the page (`502`) and the email is qando's own, and signing in is ours so that a wrong code answers the tries left, which Better Auth keeps but does not answer.

**Exports:**

| Export | What it does |
|---|---|
| `createAuth(dependencies)`, `Auth` (`auth.ts`) | Better Auth over qando's database, under `/api/auth`. Its own code sending is never reached: its callback rejects. |
| `AuthDependencies` (`auth.ts`) | The database, the secret that signs session cookies, the public address of the pages (Better Auth trusts only pages of its origin), and `log(entry)`, where Better Auth's warnings and failures go. |
| `AuthLogEntry` (`auth.ts`) | What is logged of a Better Auth warning or failure, or of a sign-in code not delivered: its level, its fixed message (`Authentication problem`, `Sign-in code not delivered`) and `describeError` of its error, never Better Auth's message or arguments (a failed query quotes the session token or the email). |
| `signInCodesOf(auth, delivery)`, `SignInCodeDelivery` (`auth.ts`) | The `SignInCodes` port over Better Auth: it creates, stores (hashed) and checks the codes; the code is delivered with `delivery.sendEmail` (the `SendEmail` port of `apps/api/src/email`) in `signInCodeEmail`, greeting the account by its stored name, and a failed delivery goes to `delivery.log` and changes nothing: an email keeps a single stored code, and the new one (created by Better Auth, then set aside) takes the place of the last delivered one only once its email was delivered. Each swap is one transaction, and an email's swaps and tries run in turns (in memory), so none meets a code half swapped. After a wrong code, the tries left are read from the code Better Auth stores (`<hash>:<wrong tries>`): a change of that format in an upgrade fails loudly, never with a wrong count. |
| `signInRouter(codes, sessions)` (`sign-in.ts`) | `POST /api/auth/sign-in-code` and `POST /api/auth/sign-in`, only to qando's pages (`ownPagesOnly`), never cached. Sending is limited per email by `sendQuota` (a new code after 30 seconds, at most 5 in any hour; a code the email server refused gives its place back, so it can be retried at once) and to 20 an hour per address; tries to 30 per 15 minutes per address, besides the 5 wrong tries each code allows. |
| `SignInCodes`, `CodeDelivery`, `SignInOutcome` (`sign-in.ts`) | The port the router signs in through: `send(email)` creates a code and delivers it (only a delivered code replaces the email's last one), answering `sent` or `not-delivered` (never throwing for a failed delivery); `signIn(email, code)` answers `signed-in` with the session cookies (the account created if new), `wrong-code` with the tries left, `expired` (expired, used or never sent) or `too-many-attempts`. |
| `sendQuota(settings)`, `SendQuota`, `SendQuotaSettings`, `QuotaAnswer` (`send-quota.ts`) | Sends per key (an email) counted by the sends themselves: `take(key)` grants one, holding its place for an hour, or answers the seconds to wait (`gapMs` since the last one, `perHour` in any hour); `release()` gives back only that send's place (a delivery refused even after a later code went out frees nothing else). A refused ask takes nothing. In memory; keys without sends in the last hour are forgotten. |
| `signInCodeEmail(data)`, `SignInCodeEmailData` (`sign-in-code-email.ts`) | The email that carries a code, in Spanish: the code in the subject (`<code> es tu código de qando`, readable in a phone notification) and in the body with its 10-minute expiry, qando's logo from `/email/logo.png` of the site, and the account's stored name in the greeting when it has one (never a name sent by a browser). |
| `sessionsOf(auth)` (`auth.ts`) | The `Sessions` port of `apps/api/src/http` over Better Auth: the signed cookie, its account, the cookie renewed while reading it (which Better Auth only returns to our routes), and ending a session: deleted first, so a failure rejects, then its cookies cleared. |
| `signOutRouter(sessions)` (`sign-out.ts`) | `POST /api/auth/sign-out`: after `sessionOriginCheck`, ends the session and answers `200 { signedOut: true }` with the cookies cleared, never cached; a session that could not be deleted answers `500` and keeps its cookie, so the page can retry. |

**Depends on:** `apps/api/src/db`, `apps/api/src/email`, `apps/api/src/http`, `apps/web/public/email` (the logo the email shows, over HTTP), `packages/contracts/src/auth`.

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

### `apps/api/src/modules/management`

**Summary:** Manage an event with its management token or its owner's session.

**Purpose:** Serves the management endpoints under `/api/events/:id`, `:id` being the participation ID of the link; `GET`, the event as its organizer manages it, and `POST …/confirmation`, confirming its final option. Who is acting is resolved in one place, `actingOrganizer` (ADR 0016): every management use case calls it first and only gets on with an `ActingOrganizer`, which only that function makes, so the owner's session is one more way to resolve it (later an agent's grant too) without changing any use case; either credential that manages the event grants it. No credential answers `401 UNAUTHENTICATED` (a session that ended counts as none), credentials that do not manage the event (another event's token, any other link, the session of another account, an unknown event) `403 FORBIDDEN`, a cancelled event `410 EVENT_CANCELLED` with its title. The token travels in `X-Management-Token`, is matched by its hash and never logged; the session's account comes from `signedInAccount` (`apps/api/src/http`).

**Exports:**

| Export | What it does |
|---|---|
| `actingOrganizer(managedEvents, participationId, credentials)` (`managed-events.ts`) | Resolves the request's credentials into the organizer of the link's event, or the refusal; no credential costs no database work. |
| `ActingOrganizer`, `ManagementCredentials`, `ManagementAccess`, `ManagementRefusal` (`managed-events.ts`) | The organizer allowed to manage one event (its stored ID), what a request carries (the token, the signed-in account), and the access granted or refused (unauthenticated, forbidden, cancelled). |
| `ManagementMatch` (`managed-events.ts`) | What the stored event is matched by: the token's hash, the owner's account, or both; its type never holds neither. |
| `ManagedEvents` (`managed-events.ts`) | The port: `access(participationId, match)`, `event(organizer)`, the event an organizer manages, and `change(work)`, which runs a change to it in one transaction. |
| `EventChange`, `LockedEvent` (`managed-events.ts`) | The reads and writes of one change: `lock(organizer)` locks the event and answers its option IDs and confirmed option (undefined if deleted since the check), `confirm(organizer, optionId)` stores the confirmation and closes voting. |
| `StoredManagedEvent` (`managed-events.ts`) | What the management page is computed from: the event, its options, confirmation, links and every vote's states. |
| `readManagedEvent(managedEvents, participationId, credentials, now)`, `ManagedEventReading` (`read-managed-event.ts`) | The use case, free of HTTP: the event with its current state, vote count and recommended options, or the refusal. An event deleted between the check and the read answers forbidden. |
| `managedEventFor(managedEvents, organizer, now)` (`read-managed-event.ts`) | The same reading once access is granted, for a use case that answers the event after changing it. |
| `confirmOption(managedEvents, participationId, credentials, optionId, now)`, `Confirmation` (`confirm-option.ts`) | The use case behind confirming, free of HTTP: before or after the deadline, checked and stored with the event locked; the option ID is lower-cased before it is checked and stored; the event as it is now, or the refusal (those of `actingOrganizer`, `already-confirmed`, `not-an-option`). The confirmed option sent again answers the event and changes nothing. |
| `managementRouter(managedEvents, now)` (`management.ts`) | The HTTP side: reads the path, the token header, the signed-in account and the body (`400` names each broken part, never its value), answers each outcome with its status, never cached. |
| `createManagedEvents(db)` (`managed-events-repository.ts`) | The PostgreSQL implementation: the token matched by its hash and the session by the event's owner, in the query; only a refusal costs the read that tells a cancelled event apart. A change locks the event row `FOR UPDATE`, which waits for the votes holding it `FOR SHARE`. |

**Depends on:** `apps/api/src/db`, `apps/api/src/http`, `apps/api/src/capability-token.ts`, `packages/contracts/src/management`, `packages/domain/src`.

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

### `apps/api/src/modules/results`

**Summary:** Read the results by the results link.

**Purpose:** Serves `GET /api/results/:resultsId`: the domain's results (`resultsOf`) with each shown option in full and, on named events, the names of who answered it each way in Spanish alphabetical order (a name repeated by a later vote reads "Ana (2)"); final once voting is no longer open (`currentState`). The organizer reaches it from the management page and "Mis eventos" through the same results link, so no other credential opens it. The participation link of an event answers `403 FORBIDDEN`, a cancelled event `410 EVENT_CANCELLED` with its title, an unknown link `404 NOT_FOUND`.

**Exports:**

| Export | What it does |
|---|---|
| `readResults(eventResults, resultsId, now)`, `ResultsReading` (`read-results.ts`) | The use case, free of HTTP so every adapter reads the same results: the results as the page shows them, or why there are none (cancelled, a participation link, missing). |
| `EventResults` (`read-results.ts`) | The port: `find(resultsId)`. |
| `StoredResultsEvent`, `StoredVote`, `ResultsLookup` (`read-results.ts`) | The event with its options and every vote; what a link leads to (found, cancelled, a participation link, missing). |
| `resultsRouter(eventResults, now)` (`results.ts`) | The HTTP side of `readResults`: reads the path, answers each reading with its status, never cached. |
| `createEventResults(db)` (`results-repository.ts`) | The PostgreSQL implementation: one read of the event with its options, confirmation and votes; only a link that opens no results costs the reads that tell why. |

**Depends on:** `apps/api/src/db`, `apps/api/src/http`, `packages/contracts/src/results`, `packages/domain/src`.

**Used by:** `apps/api/src`.

### `apps/api/src/seed`

**Summary:** Store whole events: demo data and acceptance tests.

**Purpose:** Writes events straight into the database, until organizers create them through the API. The package entry `@qando/api/seed` (`index.ts`) is what the acceptance tests use; the pool, Drizzle and the migrations stay behind it.

**Exports:**

| Export | What it does |
|---|---|
| `migrateDatabase(url)` (`index.ts`) | Applies the pending migrations to the database at `url`. |
| `openSeeder(url)`, `Seeder` (`index.ts`) | A connection that stores events (`seedEvent`) and reads their votes back (`storedVotes`) until closed. |
| `seedEvent(db, seed)` (`seed-event.ts`) | Stores an event, its options, votes and outcome in one transaction and returns its links and tokens. The event is owned by the verified account of its organizer email (lowercase), created with its first event. |
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
| `testDependencies(state)`, `TestState`, `TestParticipation`, `TestManagedEvent` (`test-dependencies.ts`) | `AppDependencies` with in-memory ports, the fake sessions and a fixed time; a managed event is stored with its token's hash and owner, or as cancelled. |
| `testSessions`, `testSessionCookie`, `endedSession`, `testTrustedOrigin` (`test-dependencies.ts`) | Sessions without Better Auth: the cookie `test-session=<account ID>` signs that account in, except `ended`; `https://qando.test` is qando's origin. |
| `createFreshDatabase()`, `FreshDatabase` (`fresh-database.ts`) | A database created empty for one test file and dropped afterwards. |
| `testServerUrl()` (`fresh-database.ts`) | The PostgreSQL server of the integration tests, from `TEST_DATABASE_URL`. |
| `storeUser(db)` (`stored-user.ts`) | Stores a verified account with an email of its own and answers its ID, to own the events a test stores. |

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

**Contents:** `email/`; `favicon.ico`, `logo.svg`.

**Depends on:** —

**Used by:** `apps/web/src`.

### `apps/web/public/email`

**Summary:** Images the emails show.

**Purpose:** An email links its images by their full address, so the site serves them at `/email/…`, as PNG (many email clients do not show SVG).

**Contents:** `logo.png` (qando's logo, at `/email/logo.png`).

**Depends on:** —

**Used by:** `apps/api/src/modules/auth` (the sign-in code email links it).

### `apps/web/src`

**Summary:** Web source: entry point and global styles.

**Purpose:** Boots the app and holds what is not a component: translations and styles.

**Contents:** `app/`, `i18n/`, `styles/`, `test/`; `main.ts` (boots `App` with `appConfig`), `index.html`, `styles.scss` (the global stylesheet), `text-imports.d.ts` (types for files imported as text).

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
| `routes` (`app.routes.ts`) | Every URL and its page: `/` (home), `/vote/:eventId`, `/vote/:eventId/my-vote` (private link), `/results/:resultsId`, `/manage/:eventId` (the management link's token taken first), `/manage/:eventId/options`, `/sign-in`, `/my-events`, `/profile`, the development pages of `apps/web/src/app/dev` (none in production), and `**` (not found). Each page loads on demand. |
| `appConfig` (`app.config.ts`) | The app's providers: router with component input binding, HTTP client, translations, tab titles. |

**Depends on:** `apps/web/src/app/core`, `apps/web/src/app/dev`, `apps/web/src/app/features`, `apps/web/src/app/shared/ui`.

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
| `requestFailure(error)` (`request-failure.ts`) | Follows the error a request or a resource failed with as a `RequestFailure` (null without one): a `429 RATE_LIMITED` counts its `Retry-After` seconds down each second, from the clock, and stays at 0; any other error, or a `429` that breaks the contract, is a plain failure. Runs in an injection context. |
| `RequestFailure` (`request-failure.ts`) | How a request failed, as a page tells it: `failed` (trying again may work now) or `limited` with the `seconds` still to wait. |
| `waiting(failure)` (`request-failure.ts`) | A rate limit with seconds left: sending again now would be refused. |

**Depends on:** `packages/contracts`.

**Used by:** `apps/web/src/app/features/create`, `apps/web/src/app/features/manage`, `apps/web/src/app/features/results`, `apps/web/src/app/features/vote`, `apps/web/src/app/shared/ui`.

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

### `apps/web/src/app/dev`

**Summary:** Development-only pages (not in production).

**Purpose:** Pages for reviewing shared components while they are built, such as the step motion. The production build swaps `dev-routes.ts` for `dev-routes.production.ts` (an empty list, `fileReplacements` in `apps/web/angular.json`), so none of them reaches qando.app; mutation testing leaves them out.

**Components:**

| Component | Inputs → outputs | What it does |
|---|---|---|
| **`StepStackPlayground`** (`step-stack-playground.*`), route `/dev/step-stack` | — | A four-step `StepStack` with steps of different heights, buttons for every change (each step, back, a burst of quick clicks), a lock and a slow-motion switch (the step tokens × 4), where the step motion is reviewed at phone and desktop widths. |

**Exports:**

| Export | What it does |
|---|---|
| `devRoutes` (`dev-routes.ts`, `dev-routes.production.ts`) | The development pages' routes, spread into `routes` (`apps/web/src/app`); an empty list in production. |

**Depends on:** `apps/web/src/app/shared/ui`.

**Used by:** `apps/web/src/app`.

### `apps/web/src/app/features`

**Summary:** One folder per page or flow.

**Purpose:** Each folder is a route's page and everything only it uses. Pieces two pages share move to `apps/web/src/app/shared/ui`.

**Contents:** `create/`, `manage/`, `not-found/`, `results/`, `vote/`.

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

### `apps/web/src/app/features/manage`

**Summary:** The management page.

**Purpose:** The page the organizer opens with the management link: the event's title and state, the choice of its final date and its confirmation, and the links to pass on. The management token is taken from the link, kept per event in the browser and sent in a header, never left in the address bar. Deadline, closing, cancelling and the state of the emails come later.

**Components:**

| Component | Inputs → outputs | What it does |
|---|---|---|
| **`ManagePage`** (`manage-page.*`), route `/manage/:eventId` | `eventId` | Reads the event with `EventManagement`; shows the "gestión" corner label, the title, the state ("Votación abierta hasta el…", "Votación cerrada…") with how many voted, `FinalDate` and `EventLinks`; sends the confirmation `FinalDate` asks for and shows the event as it comes back (an answer that arrives after the page moved to another event is dropped). A browser whose link does not manage the event sees "No tienes acceso a este evento" (focus on its heading), a cancelled event the cancelled `VoteEnded` (`apps/web/src/app/features/vote`); only a failed request offers to try again. |
| **`FinalDate`** (`final-date.*`) | `event`, `sending`, `failure` → `confirm` | Until a date is confirmed: the options as radios in the event's order, the recommended ones marked "Más votada", the only recommended one already chosen (none with a tie or no votes, and the button waits for a choice), "Hora de Madrid" when an option has a time and the browser is in another zone, the button that confirms and, under it, a failed send; while a rate limit lasts, "Hay demasiadas visitas desde tu red en este momento." above the button, held and counting the seconds down ("Confirmar fecha en 42 s"). The usual case (voting closed, a recommended option, votes in) is confirmed at once; otherwise a question (`Dialog`, `apps/web/src/app/shared/ui`) first says why it is unusual (nobody voted; nobody can attend any option; not the recommended option, naming them; voting will close) and that the confirmation is final. Once confirmed: the green card with the date in full (`optionInFull`), focused when the organizer has just confirmed. Links to the full results. |
| **`EventLinks`** (`event-links.*`) | `participationId`, `resultsId` | The participation and results links without their protocol, each copied in full (the `Toaster` confirms); the results open from their row. |

**Exports:**

| Export | What it does |
|---|---|
| `EventManagement` (`event-management.ts`) | The organizer's access to the events this browser manages: `claim(eventId, token)` keeps a management link's token per event (in the browser's storage, or on the page when storage is blocked; one cut short is ignored), `claims` counts the links this page took (a page showing an event reads it again when it grows), `read(eventId)` and `confirm(eventId, optionId)` answer a `Management`, and reject only when the request did not get through (network, server, rate limit). A confirmation refused because the event changed meanwhile (`409`, `400`) answers the event read again. |
| `Management` (`event-management.ts`) | What the page can show: `managed` with the event, `refused`, or `cancelled` with the kept title. |
| `openManagementLink` (`management-link.ts`), guard of `/manage/:eventId` | Opens the management link: hands its token to `EventManagement` and opens the page without it in the address bar or the history; also when the link is pasted over its event's page (only the fragment changes), which then reads the event again. |

**Depends on:** `apps/web/src/app/core/api`, `apps/web/src/app/shared/ui`, `apps/web/src/app/features/results`, `apps/web/src/app/features/vote`, `packages/contracts/src/management`.

**Used by:** `apps/web/src/app`.

### `apps/web/src/app/features/not-found`

**Summary:** Unknown address.

**Purpose:** The page of any address that is not a page of the app, such as a link cut short when copied.

**Components:**

| Component | Inputs → outputs | What it does |
|---|---|---|
| **`NotFoundPage`** (`not-found-page.*`), route `**` | — | The page around `NotFoundCard` (`apps/web/src/app/shared/ui`): says the page does not exist and links back home. |

**Depends on:** `apps/web/src/app/shared/ui`.

**Used by:** `apps/web/src/app`.

### `apps/web/src/app/features/results`

**Summary:** The results page.

**Purpose:** The page opened with the results link: what the votes amount to as they stand now, provisional while voting is open and final after, with the buttons to share the link. Labels of dates are made here, in the active language, from the calendar values the API answers.

**Components:**

| Component | Inputs → outputs | What it does |
|---|---|---|
| **`ResultsPage`** (`results-page.*`), route `/results/:resultsId` | `resultsId` | Reads the results; under the event's title shows the confirmed date when there is one ("La fecha más votada es:" then introduces the winners), the sentence of the outcome, the winning dates (one to three; with one winner on a named event, its attendee list), "Hora de Madrid" when a date it names in full has a time and the browser is in another zone, the counts, the `ResultsChart` and `ShareLinks` (`apps/web/src/app/shared/ui`) for the link. A link of no results (`404`, `400` malformed, `403` the participation link) shows `NotFoundCard`; a cancelled event (`410`) the cancelled `VoteEnded` (`apps/web/src/app/features/vote`); only a failed request offers to try again. |
| **`ResultsChart`** (`results-chart.*`) | `winners`, `alternatives`, `voters` | A legend of the three answers, then one bar per winner and, under their own heading, one per alternative: each answer as wide as its share of the voters (an answer nobody gave is left out); options with names offer their `NameList` under the bar. |
| **`NameList`** (`name-list.*`) | `names`, `look` (`winner` or `option`) | Who answered an option, behind a "Lista de asistentes" toggle that starts closed: the preferred in bold, then the available, then, struck through, who cannot come; a screen reader hears the answer after each marked name. |

**Exports:**

| Export | What it does |
|---|---|
| `OptionLabels` (`option-labels.ts`) | Names an option in the active language: `long(option)` the winning date in parts ("sábado 11 de julio, a las 9:30", its connecting words marked `minor` to be drawn smaller), `plain(option)` the same as text, `short(option)` the chart's label ("Sáb 11 Jul · 9:30"). The shapes are in the catalogue (`results.label.*`, connecting words between `<m>` marks). |
| `LabelPart` (`option-labels.ts`) | A piece of a long label: its `text` and whether it is `minor`. |

**Depends on:** `apps/web/src/app/core/api`, `apps/web/src/app/shared/ui`, `apps/web/src/app/features/vote`, `packages/contracts/src/results`.

**Used by:** `apps/web/src/app`, `apps/web/src/app/features/manage`.

### `apps/web/src/app/features/vote`

**Summary:** The voting page.

**Purpose:** The page a participant opens with the participation link, from the welcome card to the thank-you screen, including editing an earlier vote from the same browser or from the private link. Each browser guards its votes with its own vote-edit tokens.

**Components:**

| Component | Inputs → outputs | What it does |
|---|---|---|
| **`VotePage`** (`vote-page.*`), route `/vote/:eventId` | `eventId` | Reads the event and the vote this browser holds, walks the voter through the steps as a stack of cards, keeps the name and the answers while the voter goes back and forth, sends the vote and shows the thanks. Once voting has ended (closed, confirmed, cancelled, also when a send is refused for it) shows `VoteEnded` instead, and a link of no event the `NotFoundCard`. |
| **`VoteWelcome`** (`vote-welcome.*`), step 1 | `event`, `name` (two-way), `sending`, `quickVoteFailure`, `notice` → `choose`, `quickVote` | Presents the event, asks for the name on named events, says when this browser already voted or the private link holds no vote, and offers the two ways to vote: choose the dates, or the quick vote; under them, why the quick vote failed (`FailureNotice`), both held while a rate limit lasts. |
| **`VoteDays`** (`vote-days.*`), step 2 | `options`, `answers` (two-way) → `back`, `done`, `toTimes` | The proposed days month by month; a tap toggles available ↔ unavailable, a long press or double-click marks the preferred one. In an event with times a day stands for all its times and goes on to step 3, and the mouse over a day (or a long press) previews its times. Options that share days are only outlined and answered by one chip each, with the same gestures. From 650 px the chips are below the calendar: the mouse or the keyboard focus on a chip paints its days, and an outlined day lifts its chips under the mouse. Below 650 px a tap on an outlined day opens its overlap in a `Dialog`: the overlap's days as a strip (`stripOf`) and its chips, the last one answered painted in the strip. |
| **`VoteTimes`** (`vote-times.*`), step 3 | `options`, `answers` (two-way), `timeZone` → `back`, `done` | The times of each day still possible, page by page, answered the same way as the days; names the event's time zone when the browser's is another; a column over 10 units scrolls under ︿ ﹀, and on a phone any column too tall for the step's buttons to stay on screen; on a phone a tap on such a column's header or arrows opens its whole day in a modal (`Dialog`), answered the same way. |
| **`VoteConfirm`** (`vote-confirm.*`) | `answers`, `deadline`, `sending`, `failure` → `back`, `send` | The confirmation bubble over the last step: what the answers amount to, and the button that sends them; a failed send is told inside it (`FailureNotice`), the button held while a rate limit lasts. |
| **`VoteThanks`** (`vote-thanks.*`) | `organizerName`, `deadline`, `editLink`, `updated` | The thank-you screen, with the private link to edit the vote from another browser, to open or copy. |
| **`VoteEnded`** (`vote-ended.*`) | `ended` | The card in place of the steps once voting has ended: closed (white, with a notice about this browser's vote), confirmed (green, the date with weekday, year and time, the event's zone when the browser is in another, and the notice of a vote sent too late) or cancelled (pink, the kept title); takes the focus to its heading. |

**Exports:**

| Export | What it does |
|---|---|
| `MyVotes` (`my-votes.ts`) | What this browser knows of its votes, one vote-edit token per event kept in the browser's storage and shared by its tabs. `stored(eventId)` reads the vote it holds (never fails: what the API cannot answer is `unread`, which voting takes as no vote); `cast(eventId, vote)` sends a new vote or edits the stored one and answers the private link and whether it replaced a vote; `claim(eventId, token)` takes the token of a private link just opened. |
| `StoredVote`, `CastVote` (`my-votes.ts`) | What `stored` and `cast` answer. |
| `Ended`, `ClosedNotice`, `LateNotice` (`vote-ended.ts`) | Why voting has ended (`closed`, `confirmed` with its option, `cancelled` with only the title), and what the closed card adds: `voted`, or a `LateNotice`, which the confirmed card can add too: `lateVote` (a new vote refused), `lateEdit` (an edit refused, the earlier vote kept). |
| `VoteNotice` (`vote-welcome.ts`) | What the welcome card tells before the vote: `alreadyVoted` (this browser voted) or `unknownLink` (the private link holds no vote). |
| `openMyVoteLink` (`my-vote-link.ts`), route `/vote/:eventId/my-vote` | Opens the private link: hands its token to `MyVotes` and goes to the voting page, without the token in the address bar or the history. |
| `Answers` (`answers.ts`) | The answer to each option, by option ID, while the vote is being made. |
| `allAvailable(optionIds)` (`answers.ts`) | Where a new vote starts: every option available. |
| `resumed(optionIds, stored)` (`answers.ts`) | Where an edit starts: the stored answers, `available` for options added since, without options the event no longer has. |
| `toggled(answers, optionId)` (`answers.ts`) | A tap: available ↔ unavailable; the preferred option goes back to available. |
| `withPreferred(answers, optionId)` (`answers.ts`) | A long press or double-click: the option becomes the preferred one and the previous one goes back to available. |
| `dayState(answers, optionIds)` (`answers.ts`) | In an event with times, what a day shows: unavailable when all its times are, available otherwise. |
| `dayToggled(answers, optionIds)` (`answers.ts`) | A tap on such a day: all its times unavailable, or all available again. |
| `calendarMonths(options)`, `CalendarMonth`, `CalendarDay` (`calendar-months.ts`) | The months of step 2: every month with a proposed day, Monday first, with ranges drawn as one shape cut at week and month ends. Options that share days are drawn as one outline (`CalendarDay.overlaps`: the choices on the day; `CalendarDay.overlap`: the whole `Overlap`, its choices and span), and each month lists the chips of the overlaps it touches (`CalendarMonth.chips`). |
| `DateChoice`, `Shape`, `DayGrid`, `shapeIn(grid, choice)`, `stripOf(overlap)` (`calendar-months.ts`) | What one tap answers (a date with all its times, or a range), how a day joins its neighbours, days laid out seven to a row (a month is one), the shape a choice's days take in a grid, to paint a chip's days, and an overlap's days on their own as the modal's strip. |
| `timePages(…)`, `TimePage`, `TimeColumn`, `TimeBlock` (`time-pages.ts`) | The pages of step 3: one column per day still possible, in the event's order, a few columns per page; each column has a `key` (its days) and says how many blocks show before it scrolls (`fold`: 10 units, a time 1, a range of times 2, the whole day 3). |
| `hourPreview(times)`, `HourPreview` (`hour-preview.ts`) | What the preview over a day of step 2 lists: its first four times (`09:00`, `09:00 → 11:00`, `null` for the whole day), each once, and how many more there are. |
| `longDate(isoDate, locale)` (`display.ts`) | `2026-07-01` → "1 de julio de 2026". |
| `fullDate(isoDate, locale)` (`display.ts`) | `2026-07-10` → "viernes 10 de julio de 2026". |
| `clockLabel(time)` (`display.ts`) | `09:30` → "9:30". |
| `optionInFull(option, locale, translate)`, `Translate` (`display.ts`) | An option as a confirmed date is named: "viernes 10 de julio de 2026, 20:00 a 22:00", with weekday and year of each day and its times; `translate` reads the catalogue's shapes. |
| `zoneCity(timeZone)` (`display.ts`) | `America/New_York` → "New York", or null when the browser is in that zone (no notice due). |
| `capitalised(name, locale)` (`display.ts`) | "ana" → "Ana". |

**Depends on:** `apps/web/src/app/core/api`, `apps/web/src/app/shared/ui`, `packages/contracts/src/public-events`, `packages/domain/src`.

**Used by:** `apps/web/src/app`, `apps/web/src/app/features/manage`, `apps/web/src/app/features/results`.

### `apps/web/src/app/shared`

**Summary:** Pieces several pages use.

**Purpose:** Groups the shared UI; a piece moves here once a second page needs it.

**Contents:** `ui/`.

**Depends on:** `apps/web/src/styles`.

**Used by:** `apps/web/src/app`, `apps/web/src/app/features`.

### `apps/web/src/app/shared/ui`

**Summary:** Small UI components and directives.

**Purpose:** Generic pieces with no knowledge of events or votes: loading, error and not-found states, the step stack, the toast, the long press, the tooltip, the folded scrolling box, the modal dialog and the share buttons.

**Components:**

| Component | Inputs → outputs | What it does |
|---|---|---|
| **`LoadingState`** (`loading-state.*`) | `message` | A spinner and a message ("Cargando…" by default) while a page waits for its data. |
| **`ErrorState`** (`error-state.*`) | `message`, `retryable`, `error` → `retry` | A message when a page could not get its data, with a retry button when trying again can help. Given the error, a rate limit says "Hay demasiadas visitas desde tu red en este momento." and its button counts the seconds down ("Reintentar en 42 s"), disabled until 0 (`requestFailure`, `apps/web/src/app/core/api`). |
| **`FailureNotice`** (`failure-notice.*`) | `failure`, `failedKey`, `waitKey` | What a page says under the button whose request failed: the plain failure (`failedKey`), or the rate limit and the seconds left (`waitKey`), gone at 0. Screen readers hear it once, with the seconds it starts with (a change inside an alert or an alertdialog is read again), the count shown going down hidden from them; the page styles it through its class on the element. |
| **`NotFoundCard`** (`not-found-card.*`) | — | The card for an address that leads nowhere (no page of the app, or a link of no event): says so, why that may be, and links home; takes the focus to its heading. |
| **`StepStack`** (`step-stack.*`) | `current` (two-way), `locked` | Steps as a stack of cards: the current card with its label, earlier steps folded into tabs that go back to them, and the motion between them (the card folds into its tab going forward, a tab grows back into the card going back while the later steps fade out; a change during a motion turns it from where it is); moves the focus to the new card. A page only sets `current`. |
| **`Step`** directive (`step-stack.*`), `ng-template[appStep]` | `appStep` (label), `accent` | One step of a `StepStack`, with the colour of its dot (`StepAccent`). |
| **`Toast`** (`toast.*`) | — | Where the `Toaster`'s messages appear, once in the app shell. |
| **`LongPress`** directive (`long-press.ts`) | → `longPress` | Fires after a finger rests `HOLD_MS` (500 ms) on the element, with a short vibration, and swallows the click that follows; exposes the `holding` class for a progress style. |
| **`DateChip`** (`date-chip.*`) | `start`, `end` (`YYYY-MM-DD`) | A date or range as a pill named the short way ("Mié 8", "Mar 7➔Vie 10"), coloured by an `available`, `preferred` or `unavailable` class; only shows, the page puts it in a button to press it. `chipLabel(start, end, locale)` says what it shows in words ("Mar 7 – Vie 10"), for the name of that button to start with (WCAG 2.5.3). |
| **`Tooltip`** (`tooltip.*`) | `anchor` (an element) | A small white box above the anchor with a stem at its centre, showing what it is given; stays inside its container (the nearest positioned ancestor). Shown while it is in the page. |
| **`ScrollFold`** directive (`scroll-fold.ts`), `[appScrollFold]`, `exportAs: 'appScrollFold'` | `appScrollFold` (how many children show, or `null`), `foldHeight` (the most it may measure, or `null`) | A box as tall as its first children (one at least, as many as fit in `foldHeight`) that scrolls the rest: `back()` / `forward()` move one child, `nextHidden('back' | 'forward')` says which child they would bring into sight, `atStart` / `atEnd` say where it stands, and `folded()` and the class `folded` say it scrolls, for the page's arrows and for its stylesheet to hide the scrollbar. |
| **`Dialog`** (`dialog.*`) | `label`, `confirmLabel` → `closed`, `confirmed` | A card over the whole screen on a dark scrim (the browser's modal `<dialog>`), no wider than the page's column, with what it is given and a round ✓ at the bottom; open while it is in the page. The ✓, a tap on the scrim, Escape or back on a phone close it and emit `closed` for the page to remove it. Given a `confirmLabel`, it asks a question: "Volver" and that action (green) replace the ✓, and the action emits `confirmed` before closing. |
| **`ShareLinks`** (`share-links.*`) | `title`, `text`, `url` | Shares a link: "Compartir" opens the device's share sheet (without one, it points to the row under it), and the row opens WhatsApp or Telegram in a new tab, writes an email or copies the link (the `Toaster` confirms). Every channel carries the same title, text and link. |
| **`PlaceholderPage`** (`placeholder-page.*`) | — (reads the route title) | Stands in for a view of the sitemap until its story is built. |

**Exports:**

| Export | What it does |
|---|---|
| `Toaster` (`toast.ts`) | `show(message)`: a short message at the bottom of the screen for two seconds ("Enlace copiado"), from any page. |
| `StepAccent` (`step-stack.ts`) | The identity colours of a step: `slate`, `blue`, `teal`, `amber`, `salmon`. |
| `HOLD_MS` (`long-press.ts`) | How long the finger rests before a long press fires. |

**Depends on:** `apps/web/src/styles`, `apps/web/src/app/core/api`, `apps/web/src/app/core/i18n`.

**Used by:** `apps/web/src/app`, `apps/web/src/app/features/manage`, `apps/web/src/app/features/not-found`, `apps/web/src/app/features/results`, `apps/web/src/app/features/vote`.

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

### `apps/web/src/test`

**Summary:** Helpers for the web's own tests.

**Purpose:** What the browser has and jsdom does not, played by real objects the test controls. Left out of the app build and of mutation testing.

**Exports:**

| Export | What it does |
|---|---|
| `installTestScreen(matching)`, `TestScreen` (`media-queries.ts`) | Replaces `window.matchMedia` with one that answers the given media queries (any other does not match); `set(query, matches)` changes an answer later and sends `change` to that query's lists, as when the screen turns wide. |

**Depends on:** —

**Used by:** the web's `*.spec.ts` files.

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

**Contents:** `auth/`, `health/`, `management/`, `public-events/`, `results/`; the files below.

**Exports:**

| Export | What it does |
|---|---|
| `defineEndpoint(endpoint)`, `Endpoint`, `EndpointResponse`, `HttpMethod` (`endpoint.ts`) | Describes an endpoint (method, path, parameters, headers, body, responses) keeping its literal types. |
| `urlOf(endpoint, params)` (`endpoint.ts`) | The endpoint's path with each `{placeholder}` replaced, URL-encoded. |
| `successBodyOf(endpoint, body)`, `errorResponseOf(endpoint, status, body)`, `isSuccessStatus(status)` (`endpoint.ts`) | Checks a 2xx body against the success schemas (throws if it breaks them); finds the documented error answer of a status. |
| `SuccessBody`, `ErrorResponse`, `ParamsOf`, `HeadersOf`, `RequestBodyOf` (`endpoint.ts`) | The types of an endpoint's answers and request parts. |
| `errorBodySchema(code, shape)` (`error.ts`) | The body every error shares: `{ error: { code, message, details } }`; `code` is what clients branch on. |
| `internalErrorSchema`, `validationFailedSchema`, `fieldProblemSchema`, `unauthenticatedSchema`, `rateLimitedSchema`, `rateLimitedResponse` (`error.ts`) | The shared error answers: `500`, `400` naming each broken part (never its value), `401` without any credential, `429`. |
| `InternalErrorBody`, `ValidationFailedBody`, `FieldProblem`, `RateLimitedBody` (`error.ts`) | The types of those bodies. |
| `endpoints` (`endpoints.ts`) | Every endpoint the API serves; the OpenAPI document lists exactly these. |
| `createOpenApiDocument()` (`openapi.ts`) | Builds the OpenAPI document from the endpoints' schemas. |

**Depends on:** —

**Used by:** `apps/api/src`, `apps/api/src/http`, `apps/api/src/modules`, `apps/web/src/app/core/api`.

### `packages/contracts/src/auth`

**Summary:** The sign-in and sign-out endpoints.

**Purpose:** `POST /api/auth/sign-in-code` sends a 6-digit code to an email; `POST /api/auth/sign-in` signs the browser in with it, creating the account if the email has none; `POST /api/auth/sign-out` deletes the browser's session on the server, then clears its cookies. Also the refusal of a session sent from a page of another site, shared by every change a session can make. Emails are trimmed and compared in lower case.

**Exports:**

| Export | What it does |
|---|---|
| `sendSignInCodeEndpoint` (`sign-in.ts`) | The endpoint that sends a code: `200` delivered, `400` a broken body, `403` from another site or without `Origin`, `429` too many codes (per email: a new one after 30 seconds, at most 5 an hour; per address), `502` not delivered. |
| `signInCodeBodySchema`, `SignInCodeBody` (`sign-in.ts`) | Its body `{ email }` (at most 254 characters). |
| `signInCodeSentSchema`, `SignInCodeSent` (`sign-in.ts`) | Its answer `{ sent: true, resendAfterSeconds }`: the new code replaces the last one, valid for 10 minutes and 5 wrong tries. |
| `codeNotDeliveredSchema`, `CodeNotDeliveredBody` (`sign-in.ts`) | `502 CODE_NOT_DELIVERED`: the email server did not take the email; asking again sends a new code. |
| `foreignPageSchema`, `ForeignPageBody` (`sign-in.ts`) | `403 FORBIDDEN` to a sign-in request from a page of another site, or without `Origin`, session or not (login CSRF). |
| `signInEndpoint` (`sign-in.ts`) | The endpoint that signs in: `200` with the session cookie, `400` refused, `403` from another site, `429` too many tries from the address, `500`. |
| `signInBodySchema`, `SignInBody` (`sign-in.ts`) | Its body `{ email, code }`, the code being 6 digits. |
| `signedInSchema`, `SignedIn` (`sign-in.ts`) | Its answer `{ signedIn: true }`. |
| `wrongCodeSchema`, `codeExpiredSchema`, `tooManyAttemptsSchema` (`sign-in.ts`) | The refusals of a code: `WRONG_CODE` with `attemptsLeft` (1 to 4), `CODE_EXPIRED` (expired, used, or never sent), `TOO_MANY_ATTEMPTS` (void after 5 wrong tries, even for the right code). |
| `signInRefusedSchema`, `SignInRefusedBody` (`sign-in.ts`) | Every `400` of signing in: those three or `VALIDATION_FAILED`. |
| `signOutEndpoint` (`sign-out.ts`) | The endpoint: `200` signed out, `403` the session from another site, `500` the session could not be deleted (its cookie kept). |
| `signedOutSchema`, `SignedOut` (`sign-out.ts`) | The answer `{ signedOut: true }`. |
| `crossSiteSessionSchema`, `CrossSiteSessionBody` (`sign-out.ts`) | `403 FORBIDDEN` to a change sent with the session from a page of another site, or without `Origin` (CSRF). |

**Depends on:** `packages/contracts/src`.

**Used by:** `apps/api/src/http`, `apps/api/src/modules/auth`.

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

### `packages/contracts/src/management`

**Summary:** Endpoints opened with a management token.

**Purpose:** What the organizer can do with the management link, the token sent in `X-Management-Token` (22 to 64 base64url characters; optional, since the session will be the other way in). Reading the event to manage it, with the facts a decision needs (how many voted, which options are recommended), and confirming its final option. Rate-limited with the voting endpoints; `401` without a credential, `403` with one that does not manage the event (an unknown event too, so no `404`), `410` for a cancelled event.

**Exports:**

| Export | What it does |
|---|---|
| `managedEventEndpoint` (`managed-event.ts`) | `GET /api/events/{id}`: `200`, `400`, `401`, `403`, `410`, `429`, `500`. |
| `managedEventSchema`, `ManagedEvent` (`managed-event.ts`) | The event as its organizer manages it: title, time zone, deadline, current state, options, confirmed option, `voters`, `recommendedOptionIds` and the participation and results IDs. |
| `managementHeadersSchema`, `managementTokenSchema` (`managed-event.ts`) | The token header and its format. |
| `managementForbiddenSchema` (`managed-event.ts`) | `403 FORBIDDEN`: the credential does not manage this event. |
| `confirmOptionEndpoint` (`confirm-option.ts`) | `POST /api/events/{id}/confirmation`: `200` with the managed event (also for the confirmed option sent again), `400`, `401`, `403`, `409`, `410`, `429`, `500`. |
| `confirmOptionBodySchema`, `ConfirmOptionBody` (`confirm-option.ts`) | The body: `{ optionId }`, a UUID. |
| `confirmationRejectedSchema` (`confirm-option.ts`) | `400 VALIDATION_FAILED`: a broken part of the request (`INVALID_FIELD`) or an option that is not the event's (`OPTION_UNKNOWN` with its ID). |
| `alreadyConfirmedSchema` (`confirm-option.ts`) | `409 ALREADY_CONFIRMED`: another option is confirmed; a confirmation is final. |

**Depends on:** `packages/contracts/src`, `packages/contracts/src/public-events`.

**Used by:** `apps/api/src/modules/management`, `apps/web/src/app/features/manage`.

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

**Used by:** `apps/api/src/modules/public-events`, `apps/api/src/modules/participations`, `packages/contracts/src/results`, `packages/contracts/src/management`, `apps/web/src/app/features/vote`.

### `packages/contracts/src/results`

**Summary:** The results endpoint.

**Purpose:** What the results link answers: the winners and their alternatives (never a full ranking), the counts, who answered each shown option each way on named events, whether the results are final, and the confirmed option apart. Rate-limited with the voting endpoints.

**Exports:**

| Export | What it does |
|---|---|
| `resultsEndpoint` (`results.ts`) | `GET /api/results/{resultsId}`: `200`, `400` malformed link, `403` participation link, `404`, `410`, `429`. |
| `resultsSchema`, `Results`, `resultsOptionSchema`, `ResultsOption` (`results.ts`) | The results and one shown option with its counts and, on named events, its `names`. |
| `resultsForbiddenSchema` (`results.ts`) | `403 FORBIDDEN`: a participation link opens no results. |

**Depends on:** `packages/contracts/src`, `packages/contracts/src/public-events`.

**Used by:** `apps/api/src/modules/results`, `apps/web/src/app/features/results`.

### `packages/domain`

**Summary:** Business rules (`@qando/domain`).

**Purpose:** The rules the API and the web must apply the same way, as pure functions with no input or output. The API enforces them; the web uses them to tell the participant about a problem before sending.

**Contents:** `src/`; package, TypeScript, Vitest and Stryker settings (mutation threshold 85 %).

**Depends on:** —

**Used by:** `apps/api`, `apps/web`.

### `packages/domain/src`

**Summary:** Event state, vote rules and results.

**Purpose:** When an event accepts votes, what makes a vote valid, and what the votes amount to. `index.ts` re-exports the three files.

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
| `resultsOf(optionIds, votes)` (`results.ts`) | The results of an event's votes: each option's preferred, available and unavailable count; the winners (best attendance = preferred + available, then most preferred, in the event's order); the alternatives (as well attended, less preferred); how many can and cannot attend; the outcome that picks the page's sentence (`no-votes`, `nobody-can-attend`, `one`, `two`, `three`, `several`, `all`) and whether the winners are listed (one to three). An unanswered option counts as unavailable. |
| `Results`, `ResultsOutcome`, `OptionTally` (`results.ts`) | The types of the results. |

**Depends on:** —

**Used by:** `apps/api/src/modules/participations`, `apps/api/src/modules/public-events`, `apps/api/src/modules/results`, `apps/web/src/app/features/vote`.

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

**Purpose:** The user stories as executable scenarios, run in Chromium with playwright-bdd against the real web, API and database. A feature runs once its story is being built (the list in `playwright.config.ts`); scenarios not built yet carry `@wip`, and those waiting on a later milestone `@m2` or `@m3` (with a comment naming what they wait for); both run as expected to fail, so one that starts passing turns the run red until its tag is removed.

**Contents:** `features/`, `steps/`, `layout/`; `settled.ts` (`settled(page)`: waits for the page's finite animations, so what is checked is read at rest); `accessibility.ts` (`expectAccessible(page)`: checks the page with axe against WCAG 2.2 AA once at rest, failing with each rule broken and its elements; a page whose markup has not changed since its last check is skipped); `playwright.config.ts` (starts the API with the test clock and the web, or targets `E2E_BASE_URL`; every test at 375, 768 and 1280 px: the features in the `phone`, `tablet` and `desktop` projects, `layout/` in `layout <width>`), `global-setup.ts` (applies the migrations to `DATABASE_URL` before any scenario; `databaseUrl()` reads it, or says how to set it).

**Depends on:** `apps/api/src/seed`, `apps/web`, `apps/api`.

**Used by:** `.github/workflows`.

### `e2e/features`

**Summary:** One Gherkin feature per user story.

**Purpose:** The acceptance criteria of each story (HU01–HU10) written as scenarios, plus a smoke test that the web, the API and the database work together.

**Contents:** `hu01-sign-in-with-code.feature` … `hu10-plain-language-dates.feature`, `smoke.feature`. Running today: `smoke.feature`, `hu06-vote.feature`, `hu07-results.feature`, `hu08-confirm-date.feature`.

**Depends on:** `e2e/steps`.

**Used by:** `e2e`.

### `e2e/steps`

**Summary:** Step definitions and fixtures.

**Purpose:** What each Gherkin step does in the browser or the database, and the per-scenario state the steps share.

**Contents:** `common.steps.ts` (opening pages and reading what they show), `events.steps.ts` (storing events, their votes and how they ended), `vote.steps.ts` (the voting page, and votes sent to the API directly), `results.steps.ts` (the results page, and results asked of the API directly), `manage.steps.ts` (the management page, and confirmations asked of the API directly), `clock.steps.ts` (setting the scenario's time), `pending.hooks.ts` (the `@wip`, `@m2`, `@m3` handling), `accessibility.hooks.ts` (after every step, `expectAccessible` on each page the scenario looks at; a step that opens and closes a dialog checks it while it is open), `fixtures.ts`.

**Exports:**

| Export | What it does |
|---|---|
| `test` (`fixtures.ts`) | Playwright's `test` extended with the fixtures below, for every step file. |
| `StoredEvents` (`fixtures.ts`) | The events a scenario stored, by title, so later steps open them by the name they read. |
| `ScenarioClock` (`fixtures.ts`) | The scenario's time, frozen in the browser and sent to the API in `X-Test-Now`. |
| `OtherBrowsers` (`fixtures.ts`) | Fresh browsers besides the scenario's own, on the same time and address. |
| `MyVote` (`fixtures.ts`) | The vote the scenario cast through a page, for the steps that come back to it, and whether the page asked for a name. |
| `ApiAnswer` (`fixtures.ts`) | The status the API gave to a request a step sent it directly (a vote no page would send, the results or a confirmation asked with the wrong link), for the step that checks it. |
| `MyConfirmation` (`fixtures.ts`) | The date the scenario confirmed through the API, for the step that checks it stayed confirmed. |
| `expectNoVoting(page)` (`vote.steps.ts`) | Checks that nothing on the page lets the voter vote: no first-step choices, no days, no send. |
| `localInstant(date, time, timeZone)` (`clock.steps.ts`) | The instant the clocks of a time zone show `time` on `date`; refuses times skipped or repeated by a clock change. |

**Depends on:** `apps/api/src/seed`.

**Used by:** `e2e/features`.

### `e2e/layout`

**Summary:** Checks of the rendered layout.

**Purpose:** What only a browser can measure, which the unit tests (jsdom, no layout) cannot: the widths of the results bars, each answer its exact share of the 250 px bar while its count fits and one too narrow for its count grown to fit it, and a results page that never scrolls sideways; a management page that never scrolls sideways (its question neither), drops the token from the address bar and is used with the keyboard alone; a vote cast with the keyboard alone; on the voting, results and management pages, every Tab stop drawn differently while it has the focus; and the chips of dates that overlap, in their modal on a phone, focused and checked with axe. Plain Playwright tests that answer the API themselves, so they store nothing and run against any URL.

**Contents:** `manage-page.spec.ts`, `results-bars.spec.ts`, `vote-page.spec.ts`; `focus.ts` (`expectEveryStopShowsFocus(page)`: walks the page with Tab and checks each stop, with its label, looks different focused and blurred; `tabTo(page, target)`: presses Tab until `target` has the focus).

**Depends on:** `apps/web`.

**Used by:** `e2e`.

### `docs`

**Summary:** Planning and design documents.

**Purpose:** What v1 does and how it looks: user stories, sitemap, diagrams, API contract, mockups, design tokens, accessibility, backlog, and this guide. `README.md` lists them.

**Contents:** `README.md`, `user-stories.md`, `sitemap.md`, `diagrams.md`, `api-contract.md`, `mockups.md`, `design-tokens.md`, `accessibility.md`, `backlog.md`, `code-guide.md`; `mockups/`, `screenshots/`.

**Depends on:** —

**Used by:** —

### `docs/mockups`

**Summary:** Screen mockups.

**Purpose:** The images `docs/mockups.md` shows: the desktop screens and emails, and the changes each story makes to them.

**Contents:** one JPEG per screen or email (`create-1-title-and-name.jpg`, `email-summary.jpg`, …).

**Depends on:** —

**Used by:** `docs`.

### `docs/screenshots`

**Summary:** The pages at each width.

**Purpose:** The images `docs/accessibility.md` shows: the voting, results and management pages in each of their main states, at 375, 768 and 1280 px.

**Contents:** one JPEG per state and width (`vote-1-welcome-375.jpg`, `results-1280.jpg`, …).

**Depends on:** —

**Used by:** `docs`.
